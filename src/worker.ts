import "dotenv/config";
import { getDb } from "@/server/db";
import { expireHeldReservations } from "@/server/features/inventory/stock-service";
import { billMaintenancePeriod } from "@/server/features/maintenance/maintenance-service";
import type { Actor } from "@/server/auth/permissions";
import { monthKey } from "@/server/time";

async function ownerActor(organizationId: string): Promise<Actor | null> {
  const membership = await getDb().membership.findFirst({
    where: { organizationId, active: true, role: { code: "owner" } },
    include: { user: true, role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!membership) return null;
  return {
    userId: membership.userId,
    organizationId,
    email: membership.user.email,
    permissions: new Set(membership.role.permissions.map((item) => item.permission.code)),
  };
}

export async function runOnce(now = new Date()): Promise<void> {
  await expireHeldReservations(now);
  const contracts = await getDb().maintenanceContract.findMany({ where: { status: "active" } });
  for (const contract of contracts) {
    const actor = await ownerActor(contract.organizationId);
    if (!actor) continue;
    await billMaintenancePeriod(actor, contract.id, monthKey(now));
  }
  const events = await getDb().outboxEvent.findMany({ where: { status: "queued" }, take: 20 });
  for (const event of events) {
    await getDb().outboxEvent.update({
      where: { id: event.id },
      data: { status: "not_configured", lastError: "პროვაიდერი არ არის კონფიგურირებული", attempts: { increment: 1 } },
    });
  }
}

const entry = process.argv[1] ?? "";
const launchedAsCli = /(?:^|[\\/])worker\.(?:ts|js|mjs)$/.test(entry);
if (launchedAsCli) {
  runOnce()
    .then(() => {
      console.log("worker cycle done");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
