import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { createManualInvoice } from "@/server/features/finance/invoice-service";
import { changeBalance } from "@/server/features/inventory/stock-service";
import { D, Decimal, monthlyMaintenanceFee, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { periodBounds } from "@/server/time";
import { withTx } from "@/server/tx";

export type PlantInput = { description: string; quantity: string; referenceUnitPrice: string };

export function maintenanceQuote(lines: { quantity: Decimal; referenceUnitPrice: Decimal; active?: boolean }[], percent: Decimal) {
  const base = roundMoney(
    lines.filter((line) => line.active !== false).reduce((sum, line) => sum.plus(line.quantity.mul(line.referenceUnitPrice)), new Decimal(0)),
  );
  return { base, fee: monthlyMaintenanceFee(base, percent) };
}

export async function createMaintenanceContract(
  actor: Actor,
  input: { customerId: string; percent?: string; startOn: string; lines: PlantInput[]; partialMonthPolicy?: "full" | "prorate" },
) {
  requirePermission(actor, "maintenance.write");
  const percent = D(input.percent ?? "10");
  return withTx(async (tx) => {
    const number = await nextNumber(tx, actor.organizationId, "maintenance", "MC");
    const contract = await tx.maintenanceContract.create({
      data: {
        organizationId: actor.organizationId,
        customerId: input.customerId,
        number,
        percent: percent.toFixed(2),
        partialMonthPolicy: input.partialMonthPolicy ?? "full",
        startOn: new Date(`${input.startOn}T00:00:00.000Z`),
        lines: {
          create: input.lines.map((line) => ({
            description: line.description,
            quantity: D(line.quantity).toFixed(3),
            referenceUnitPrice: D(line.referenceUnitPrice).toFixed(4),
          })),
        },
      },
      include: { lines: true },
    });
    for (const line of contract.lines) {
      await tx.customerPlant.create({
        data: {
          organizationId: actor.organizationId,
          contractId: contract.id,
          contractLineId: line.id,
          description: line.description,
          quantity: line.quantity,
          ownership: "customer",
          referenceUnitPrice: line.referenceUnitPrice,
        },
      });
    }
    return contract;
  });
}

export async function setContractStatus(actor: Actor, contractId: string, status: "active" | "paused" | "ended") {
  requirePermission(actor, "maintenance.write");
  return getDb().maintenanceContract.update({
    where: { id: contractId },
    data: { status, version: { increment: 1 } },
  });
}

export async function amendContract(actor: Actor, contractId: string, input: { effectiveOn: string; percent: string; note: string }) {
  requirePermission(actor, "maintenance.write");
  return getDb().contractAmendment.create({
    data: {
      contractId,
      effectiveOn: new Date(`${input.effectiveOn}T00:00:00.000Z`),
      percent: D(input.percent).toFixed(2),
      note: input.note,
    },
  });
}

export async function billMaintenancePeriod(actor: Actor, contractId: string, month: string) {
  requirePermission(actor, "maintenance.write");
  const postingKey = `maint:${contractId}:${month}`;
  try {
    return await withTx((tx) => billMaintenanceTx(tx, actor, contractId, month, postingKey));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return getDb().invoice.findUnique({ where: { postingKey } });
  }
}

async function billMaintenanceTx(tx: Tx, actor: Actor, contractId: string, month: string, postingKey: string) {
  const existing = await tx.invoice.findUnique({ where: { postingKey } });
  if (existing) return existing;
  const contract = await tx.maintenanceContract.findFirst({
    where: { id: contractId, organizationId: actor.organizationId },
    include: { lines: true, amendments: true },
  });
  if (!contract) throw new BusinessError("ხელშეკრულება ვერ მოიძებნა", "not_found");
  if (contract.status !== "active") return null;
  const bounds = periodBounds(month);
  const percent = percentOn(contract.percent, contract.amendments, bounds.start);
  const quote = maintenanceQuote(
    contract.lines.map((line) => ({ quantity: D(line.quantity), referenceUnitPrice: D(line.referenceUnitPrice), active: line.active })),
    percent,
  );
  return createManualInvoice(tx, actor, {
    postingKey,
    customerId: contract.customerId,
    sourceType: "maintenance_contract",
    sourceId: contract.id,
    lines: [
      {
        description: `მოვლა ${month}`,
        quantity: new Decimal(1),
        unitPrice: quote.fee,
        lineTotal: quote.fee,
      },
    ],
    forceDraft: true,
  });
}

function percentOn(base: { toString(): string }, amendments: { effectiveOn: Date; percent: { toString(): string } | null }[], periodStart: string): Decimal {
  const applicable = amendments
    .filter((item) => item.percent && item.effectiveOn.toISOString().slice(0, 10) <= periodStart)
    .sort((a, b) => a.effectiveOn.getTime() - b.effectiveOn.getTime());
  const chosen = applicable.at(-1)?.percent;
  return D(chosen ?? base);
}

export async function replaceCoveredPlant(
  actor: Actor,
  input: { customerPlantId: string; variantId: string; locationId: string; postingKey: string },
) {
  requirePermission(actor, "maintenance.write");
  return withTx(async (tx) => {
    const existingExpense = await tx.expense.findUnique({ where: { postingKey: input.postingKey } });
    if (existingExpense) return existingExpense;
    const plant = await tx.customerPlant.findFirst({
      where: { id: input.customerPlantId, organizationId: actor.organizationId, status: "active" },
    });
    if (!plant?.contractLineId || !plant.contractId) throw new BusinessError("მცენარე ხელშეკრულებაზე არ არის", "not_found");
    const line = await tx.contractPlantLine.findUniqueOrThrow({ where: { id: plant.contractLineId } });
    const variant = await tx.productVariant.findFirstOrThrow({ where: { id: input.variantId, organizationId: actor.organizationId } });
    await tx.contractPlantLine.update({ where: { id: line.id }, data: { active: false } });
    const replacement = await tx.contractPlantLine.create({
      data: {
        contractId: plant.contractId,
        description: `${line.description} (ჩანაცვლება)`,
        quantity: line.quantity,
        referenceUnitPrice: line.referenceUnitPrice,
        replacesLineId: line.id,
      },
    });
    await tx.customerPlant.update({ where: { id: plant.id }, data: { status: "replaced" } });
    await tx.customerPlant.create({
      data: {
        organizationId: actor.organizationId,
        contractId: plant.contractId,
        contractLineId: replacement.id,
        description: replacement.description,
        quantity: line.quantity,
        ownership: "customer",
        referenceUnitPrice: line.referenceUnitPrice,
      },
    });
    await changeBalance(tx, {
      organizationId: actor.organizationId,
      variantId: variant.id,
      locationId: input.locationId,
      onHandDelta: D(line.quantity).neg(),
      reservedDelta: new Decimal(0),
      movement: {
        quantity: D(line.quantity).neg(),
        unitCost: D(variant.averageCost),
        movementType: "replacement_issue",
        postingKey: `${input.postingKey}:stock`,
        sourceType: "replacement",
        sourceId: plant.id,
        actorId: actor.userId,
      },
    });
    const expense = await tx.expense.create({
      data: {
        organizationId: actor.organizationId,
        category: "replacement",
        amount: D(variant.averageCost).mul(D(line.quantity)).toFixed(2),
        sourceType: "replacement",
        sourceId: plant.id,
        postingKey: input.postingKey,
      },
    });
    await tx.replacementCase.create({
      data: {
        organizationId: actor.organizationId,
        customerPlantId: plant.id,
        status: "closed",
        coverage: "covered",
        postingKey: `${input.postingKey}:case`,
      },
    });
    return expense;
  });
}

export async function contractFee(contractId: string): Promise<{ base: string; fee: string }> {
  const contract = await getDb().maintenanceContract.findUniqueOrThrow({
    where: { id: contractId },
    include: { lines: true, amendments: true },
  });
  const quote = maintenanceQuote(
    contract.lines.map((line) => ({ quantity: D(line.quantity), referenceUnitPrice: D(line.referenceUnitPrice), active: line.active })),
    D(contract.percent),
  );
  return { base: quote.base.toFixed(2), fee: quote.fee.toFixed(2) };
}

export async function activeMaintenanceFees(organizationId: string): Promise<string> {
  const contracts = await getDb().maintenanceContract.findMany({
    where: { organizationId, status: "active" },
    include: { lines: true },
  });
  const total = contracts.reduce((sum, contract) => {
    const quote = maintenanceQuote(
      contract.lines.map((line) => ({ quantity: D(line.quantity), referenceUnitPrice: D(line.referenceUnitPrice), active: line.active })),
      D(contract.percent),
    );
    return sum.plus(quote.fee);
  }, new Decimal(0));
  return roundMoney(total).toFixed(2);
}
