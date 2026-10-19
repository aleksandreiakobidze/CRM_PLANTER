import { createHash } from "crypto";
import ExcelJS from "exceljs";
import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { postOpeningStockTx } from "@/server/features/inventory/stock-service";
import { D } from "@/server/money";
import { matchSpecies } from "@/server/org";
import { normalizePhone } from "@/server/phone";
import { withTx } from "@/server/tx";

export type ImportPreviewRow = {
  rowNumber: number;
  rowKey: string;
  status: "ok" | "error" | "duplicate";
  message?: string;
  values: Record<string, string>;
};

function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readSheet(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const header = sheet.getRow(1).values as unknown[];
  const names = header.slice(1).map((value) => String(value ?? "").trim().toLocaleLowerCase("ka"));
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const record: Record<string, string> = {};
    names.forEach((name, column) => {
      record[name] = textOf(row.getCell(column + 1).value);
    });
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  return rows;
}

function textOf(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value).trim();
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key.toLocaleLowerCase("ka")];
    if (value) return value;
  }
  return "";
}

export async function dryRunCustomers(actor: Actor, buffer: Buffer): Promise<ImportPreviewRow[]> {
  requirePermission(actor, "import.run");
  const rows = await readSheet(buffer);
  const preview: ImportPreviewRow[] = [];
  for (const [index, row] of rows.entries()) {
    const name = pick(row, ["სახელი", "name"]);
    const phone = pick(row, ["ტელეფონი", "phone"]);
    const email = pick(row, ["ელფოსტა", "email"]);
    const code = pick(row, ["საიდენტიფიკაციო კოდი", "identificationcode", "code"]);
    const rowKey = `${index + 2}:${name}:${phone}:${code}`;
    if (!name) {
      preview.push({ rowNumber: index + 2, rowKey, status: "error", message: "სახელი ცარიელია", values: row });
      continue;
    }
    const phoneNormalized = phone ? normalizePhone(phone) : "";
    const duplicate = await getDb().customer.findFirst({
      where: {
        organizationId: actor.organizationId,
        mergedIntoId: null,
        OR: [
          phoneNormalized ? { phoneNormalized } : undefined,
          code ? { identificationCode: code } : undefined,
          email ? { email: email.toLowerCase() } : undefined,
        ].filter(Boolean) as { phoneNormalized?: string; identificationCode?: string; email?: string }[],
      },
    });
    preview.push({
      rowNumber: index + 2,
      rowKey,
      status: duplicate ? "duplicate" : "ok",
      message: duplicate ? `დუბლიკატი: ${duplicate.name}` : undefined,
      values: row,
    });
  }
  return preview;
}

export async function confirmCustomerImport(actor: Actor, buffer: Buffer, choices: Record<string, "skip" | "create"> = {}) {
  requirePermission(actor, "import.run");
  const hash = fileHash(buffer);
  const existing = await getDb().importBatch.findFirst({
    where: { organizationId: actor.organizationId, kind: "customers", fileHash: hash, status: "confirmed" },
  });
  if (existing) return { batch: existing, created: false };
  const preview = await dryRunCustomers(actor, buffer);
  return withTx(async (tx) => {
    const again = await tx.importBatch.findFirst({
      where: { organizationId: actor.organizationId, kind: "customers", fileHash: hash, status: "confirmed" },
    });
    if (again) return { batch: again, created: false };
    const batch = await tx.importBatch.create({
      data: { organizationId: actor.organizationId, kind: "customers", status: "confirmed", fileHash: hash, actorId: actor.userId },
    });
    for (const row of preview) {
      if (row.status === "error") throw new BusinessError(row.message || "იმპორტის შეცდომა", "import");
      if (row.status === "duplicate" && choices[row.rowKey] !== "create") {
        await tx.importRow.create({ data: { batchId: batch.id, rowNumber: row.rowNumber, rowKey: row.rowKey, status: "skipped", message: row.message } });
        continue;
      }
      const name = pick(row.values, ["სახელი", "name"]);
      const phone = pick(row.values, ["ტელეფონი", "phone"]);
      const customer = await tx.customer.create({
        data: {
          organizationId: actor.organizationId,
          kind: "company",
          name,
          phone,
          phoneNormalized: phone ? normalizePhone(phone) : null,
          email: pick(row.values, ["ელფოსტა", "email"]).toLowerCase() || null,
          identificationCode: pick(row.values, ["საიდენტიფიკაციო კოდი", "identificationcode", "code"]) || null,
          source: "import",
        },
      });
      await tx.importRow.create({ data: { batchId: batch.id, rowNumber: row.rowNumber, rowKey: row.rowKey, status: "created", entityId: customer.id } });
    }
    return { batch, created: true };
  });
}

export async function dryRunProducts(actor: Actor, buffer: Buffer): Promise<ImportPreviewRow[]> {
  requirePermission(actor, "import.run");
  const rows = await readSheet(buffer);
  const species = await getDb().species.findMany({ where: { organizationId: actor.organizationId } });
  return rows.map((row, index) => {
    const name = pick(row, ["დასახელება", "name"]);
    const sku = pick(row, ["sku"]);
    const speciesName = pick(row, ["სახეობა", "species"]);
    const rowKey = `${index + 2}:${sku}`;
    if (!name || !sku) return { rowNumber: index + 2, rowKey, status: "error" as const, message: "SKU ან დასახელება ცარიელია", values: row };
    const speciesId = speciesName ? matchSpecies(speciesName, species) : null;
    if (speciesName && !speciesId) {
      return { rowNumber: index + 2, rowKey, status: "error" as const, message: `სახეობა ხელით უნდა შეირჩეს: ${speciesName}`, values: row };
    }
    return { rowNumber: index + 2, rowKey, status: "ok" as const, values: row };
  });
}

export async function confirmProductImport(actor: Actor, buffer: Buffer) {
  requirePermission(actor, "import.run");
  const hash = fileHash(buffer);
  const existing = await getDb().importBatch.findFirst({
    where: { organizationId: actor.organizationId, kind: "products", fileHash: hash, status: "confirmed" },
  });
  if (existing) return { batch: existing, created: false };
  const preview = await dryRunProducts(actor, buffer);
  if (preview.some((row) => row.status === "error")) {
    throw new BusinessError(preview.find((row) => row.status === "error")?.message || "იმპორტი შეჩერდა", "import");
  }
  const species = await getDb().species.findMany({ where: { organizationId: actor.organizationId } });
  return withTx(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { organizationId: actor.organizationId, kind: "products", status: "confirmed", fileHash: hash, actorId: actor.userId },
    });
    for (const row of preview) {
      const sku = pick(row.values, ["sku"]);
      const speciesName = pick(row.values, ["სახეობა", "species"]);
      const product = await tx.product.create({
        data: {
          organizationId: actor.organizationId,
          category: "plant",
          nameKa: pick(row.values, ["დასახელება", "name"]),
          speciesId: speciesName ? matchSpecies(speciesName, species) : null,
        },
      });
      const variant = await tx.productVariant.create({
        data: {
          organizationId: actor.organizationId,
          productId: product.id,
          sku,
          nameKa: pick(row.values, ["დასახელება", "name"]),
          listPrice: D(pick(row.values, ["ფასი", "price"]) || "0").toFixed(4),
        },
      });
      await tx.importRow.create({ data: { batchId: batch.id, rowNumber: row.rowNumber, rowKey: row.rowKey, status: "created", entityId: variant.id } });
    }
    return { batch, created: true };
  });
}

export async function dryRunOpeningStock(actor: Actor, buffer: Buffer): Promise<ImportPreviewRow[]> {
  requirePermission(actor, "import.run");
  const rows = await readSheet(buffer);
  const preview: ImportPreviewRow[] = [];
  for (const [index, row] of rows.entries()) {
    const sku = pick(row, ["sku"]);
    const quantity = pick(row, ["რაოდენობა", "quantity"]);
    const location = pick(row, ["ლოკაცია", "location"]) || "sales";
    const rowKey = `${index + 2}:${sku}:${location}`;
    const variant = sku ? await getDb().productVariant.findUnique({ where: { organizationId_sku: { organizationId: actor.organizationId, sku } } }) : null;
    if (!variant || !quantity) {
      preview.push({ rowNumber: index + 2, rowKey, status: "error", message: variant ? "რაოდენობა ცარიელია" : `SKU ვერ მოიძებნა: ${sku}`, values: row });
    } else {
      preview.push({ rowNumber: index + 2, rowKey, status: "ok", values: row });
    }
  }
  return preview;
}

export async function confirmOpeningStock(actor: Actor, buffer: Buffer) {
  requirePermission(actor, "stock.write");
  requirePermission(actor, "import.run");
  const hash = fileHash(buffer);
  const existing = await getDb().importBatch.findFirst({
    where: { organizationId: actor.organizationId, kind: "opening_stock", fileHash: hash, status: "confirmed" },
    include: { rows: true },
  });
  if (existing) return { batch: existing, created: false };
  const preview = await dryRunOpeningStock(actor, buffer);
  if (preview.some((row) => row.status === "error")) {
    throw new BusinessError(preview.find((row) => row.status === "error")?.message || "იმპორტი შეჩერდა", "import");
  }
  return withTx(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { organizationId: actor.organizationId, kind: "opening_stock", status: "confirmed", fileHash: hash, actorId: actor.userId },
    });
    for (const row of preview) {
      const sku = pick(row.values, ["sku"]);
      const locationCode = pick(row.values, ["ლოკაცია", "location"]) || "sales";
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { organizationId_sku: { organizationId: actor.organizationId, sku } },
      });
      const location = await tx.location.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: actor.organizationId, code: locationCode } },
      });
      const movement = await postOpeningStockTx(tx, actor, {
        variantId: variant.id,
        locationId: location.id,
        quantity: D(pick(row.values, ["რაოდენობა", "quantity"])),
        unitCost: D(pick(row.values, ["თვითღირებულება", "unitcost", "cost"]) || "0"),
        postingKey: `import-open:${hash}:${row.rowKey}`,
        reason: "იმპორტის საწყისი ნაშთი",
      });
      await tx.importRow.create({
        data: { batchId: batch.id, rowNumber: row.rowNumber, rowKey: row.rowKey, status: "created", entityId: movement?.id },
      });
    }
    return { batch, created: true };
  });
}
