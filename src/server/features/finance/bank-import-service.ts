import { createHash } from "crypto";
import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { recordPayment } from "@/server/features/finance/payment-service";
import { D, roundMoney } from "@/server/money";
import { formatDateOnly, parseDateOnly } from "@/server/time";
import { withTx } from "@/server/tx";

export type BankMapping = { date: string; amount: string; purpose: string; reference?: string };

function hashBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new BusinessError("CSV-ში სათაური და ერთი სტრიქონი მაინც უნდა იყოს", "validation");
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalizeDate(value: string): string {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const ge = value.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (ge) return `${ge[3]}-${ge[2]}-${ge[1]}`;
  throw new BusinessError(`თარიღი წაუკითხავია: ${value}`, "validation");
}

export async function importBankFile(
  actor: Actor,
  input: { filename: string; bytes: Buffer; mapping: BankMapping },
) {
  requirePermission(actor, "finance.write");
  const fileHash = hashBytes(input.bytes);
  const existing = await getDb().bankImportBatch.findUnique({
    where: { organizationId_fileHash: { organizationId: actor.organizationId, fileHash } },
    include: { rows: true },
  });
  if (existing) return existing;
  const parsed = parseCsv(input.bytes.toString("utf8"));
  const missing = [input.mapping.date, input.mapping.amount, input.mapping.purpose].filter(
    (column) => !parsed.headers.includes(column),
  );
  if (missing.length) throw new BusinessError(`სვეტი ვერ მოიძებნა: ${missing.join(", ")}`, "validation");
  try {
    return await withTx(async (tx) => {
      const batch = await tx.bankImportBatch.create({
        data: {
          organizationId: actor.organizationId,
          filename: input.filename,
          fileHash,
          mapping: input.mapping,
        },
      });
      for (const row of parsed.rows) {
        const amount = roundMoney(D(row[input.mapping.amount].replace(/\s/g, "").replace(",", ".")));
        if (amount.lte(0)) continue;
        await tx.bankImportRow.create({
          data: {
            batchId: batch.id,
            paidOn: parseDateOnly(normalizeDate(row[input.mapping.date])),
            amount: amount.toFixed(2),
            purpose: row[input.mapping.purpose] || "ბანკის ამონაწერი",
            reference: input.mapping.reference ? row[input.mapping.reference] || null : null,
          },
        });
      }
      return tx.bankImportBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { rows: true } });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const again = await getDb().bankImportBatch.findUnique({
      where: { organizationId_fileHash: { organizationId: actor.organizationId, fileHash } },
      include: { rows: true },
    });
    if (!again) throw error;
    return again;
  }
}

export async function confirmBankRow(
  actor: Actor,
  input: { rowId: string; customerId: string; invoiceId?: string },
) {
  requirePermission(actor, "finance.write");
  const row = await getDb().bankImportRow.findFirst({
    where: { id: input.rowId, batch: { organizationId: actor.organizationId } },
    include: { batch: true },
  });
  if (!row) throw new BusinessError("სტრიქონი ვერ მოიძებნა", "not_found");
  if (row.status === "posted") return row;
  const postingKey = `bank:${row.batchId}:${row.id}`;
  await recordPayment(actor, {
    customerId: input.customerId,
    amount: row.amount.toString(),
    method: "bank",
    paidOn: formatDateOnly(row.paidOn),
    reference: row.reference ?? row.purpose,
    postingKey,
    allocations: input.invoiceId ? [{ invoiceId: input.invoiceId, amount: row.amount.toString() }] : [],
  });
  return getDb().bankImportRow.update({
    where: { id: row.id },
    data: { status: "posted", customerId: input.customerId, invoiceId: input.invoiceId ?? null, postingKey },
  });
}

export async function skipBankRow(actor: Actor, rowId: string) {
  requirePermission(actor, "finance.write");
  const row = await getDb().bankImportRow.findFirst({
    where: { id: rowId, batch: { organizationId: actor.organizationId } },
  });
  if (!row) throw new BusinessError("სტრიქონი ვერ მოიძებნა", "not_found");
  if (row.status === "posted") return row;
  return getDb().bankImportRow.update({ where: { id: row.id }, data: { status: "skipped" } });
}
