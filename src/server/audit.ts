import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";
import type { Actor } from "@/server/auth/permissions";

const SECRET = /password|token|secret|hash|iban/i;

function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object") return value as Prisma.InputJsonValue;
  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET.test(key)) continue;
    if (entry == null) continue;
    output[key] = typeof entry === "object" ? (scrub(entry) ?? {}) : (entry as Prisma.InputJsonValue);
  }
  return output;
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
  reason?: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action,
      entityType,
      entityId,
      reason,
      before: scrub(before),
      after: scrub(after),
    },
  });
}
