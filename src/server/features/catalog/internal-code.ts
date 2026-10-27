import { randomInt } from "node:crypto";
import type { Tx } from "@/server/db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = { variant: "PL", asset: "RA" } as const;

export type InternalCodeKind = keyof typeof PREFIX;

export function randomInternalCode(kind: InternalCodeKind): string {
  let body = "";
  for (let index = 0; index < 6; index += 1) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${PREFIX[kind]}-${body}`;
}

async function taken(tx: Tx, organizationId: string, kind: InternalCodeKind, code: string) {
  if (kind === "variant") {
    return Boolean(await tx.productVariant.findFirst({ where: { organizationId, internalCode: code }, select: { id: true } }));
  }
  return Boolean(await tx.rentalAsset.findFirst({ where: { organizationId, internalCode: code }, select: { id: true } }));
}

export async function nextInternalCode(tx: Tx, organizationId: string, kind: InternalCodeKind): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomInternalCode(kind);
    if (!(await taken(tx, organizationId, kind, code))) return code;
  }
  throw new Error("internal code space exhausted");
}

export async function backfillInternalCodes(tx: Tx, organizationId: string) {
  let filled = 0;
  const variants = await tx.productVariant.findMany({ where: { organizationId, internalCode: null }, select: { id: true } });
  for (const variant of variants) {
    await tx.productVariant.update({ where: { id: variant.id }, data: { internalCode: await nextInternalCode(tx, organizationId, "variant") } });
    filled += 1;
  }
  const assets = await tx.rentalAsset.findMany({ where: { organizationId, internalCode: null }, select: { id: true } });
  for (const asset of assets) {
    await tx.rentalAsset.update({ where: { id: asset.id }, data: { internalCode: await nextInternalCode(tx, organizationId, "asset") } });
    filled += 1;
  }
  return filled;
}
