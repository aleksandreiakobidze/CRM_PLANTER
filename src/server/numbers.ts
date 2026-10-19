import { randomUUID } from "crypto";
import type { Tx } from "@/server/db";
import { tbilisiYear } from "@/server/time";

export async function nextNumber(tx: Tx, organizationId: string, docType: string, prefix: string, now = new Date()): Promise<string> {
  const year = tbilisiYear(now);
  const rows = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO document_sequences (id, organization_id, doc_type, year, last_number)
    VALUES (${randomUUID()}, ${organizationId}, ${docType}, ${year}, 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = document_sequences.last_number + 1
    RETURNING last_number
  `;
  const value = Number(rows[0]?.last_number ?? 1);
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}
