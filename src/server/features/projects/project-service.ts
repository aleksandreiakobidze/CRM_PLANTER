import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { createMaintenanceContract } from "@/server/features/maintenance/maintenance-service";
import { D, Decimal, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { withTx } from "@/server/tx";

const LINE_KINDS = new Set(["material", "labor", "transport"]);

export async function createGreeningProject(
  actor: Actor,
  input: {
    customerId: string;
    siteNotes?: string;
    lightNotes?: string;
    postingKey: string;
    lines: { kind: string; description: string; quantity?: string; amount: string }[];
  },
) {
  requirePermission(actor, "sales.write");
  if (input.lines.length === 0) throw new BusinessError("პროექტს სჭირდება ერთი ხაზი მაინც", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.greeningProject.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, organizationId: actor.organizationId },
      });
      if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
      const lines = input.lines.map((line) => {
        if (!LINE_KINDS.has(line.kind)) throw new BusinessError("ხაზის ტიპი უცნობია", "validation");
        const amount = roundMoney(D(line.amount));
        if (amount.lt(0)) throw new BusinessError("თანხა უარყოფითი ვერ იქნება", "validation");
        return {
          kind: line.kind,
          description: line.description.trim() || line.kind,
          quantity: D(line.quantity ?? "1").toFixed(3),
          amount: amount.toFixed(2),
        };
      });
      const budget = roundMoney(lines.reduce((sum, line) => sum.plus(D(line.amount)), new Decimal(0)));
      const number = await nextNumber(tx, actor.organizationId, "greening", "GP");
      const project = await tx.greeningProject.create({
        data: {
          organizationId: actor.organizationId,
          customerId: customer.id,
          number,
          siteNotes: input.siteNotes?.trim() || null,
          lightNotes: input.lightNotes?.trim() || null,
          budgetAmount: budget.toFixed(2),
          postingKey: input.postingKey,
          lines: { create: lines },
        },
        include: { lines: true, customer: true },
      });
      await audit(tx, actor, "project.create", "greening_project", project.id);
      return project;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().greeningProject.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function setProjectStatus(actor: Actor, projectId: string, status: "draft" | "quoted" | "in_progress" | "received" | "closed") {
  requirePermission(actor, "sales.write");
  const project = await getDb().greeningProject.findFirst({
    where: { id: projectId, organizationId: actor.organizationId },
  });
  if (!project) throw new BusinessError("პროექტი ვერ მოიძებნა", "not_found");
  return getDb().greeningProject.update({ where: { id: project.id }, data: { status } });
}

export async function recordProjectExpense(actor: Actor, input: { projectId: string; category: string; amount: string; postingKey: string }) {
  requirePermission(actor, "finance.write");
  const amount = roundMoney(D(input.amount));
  if (amount.lte(0)) throw new BusinessError("თანხა ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const project = await tx.greeningProject.findFirst({
        where: { id: input.projectId, organizationId: actor.organizationId },
      });
      if (!project) throw new BusinessError("პროექტი ვერ მოიძებნა", "not_found");
      return tx.expense.create({
        data: {
          organizationId: actor.organizationId,
          category: input.category.trim() || "greening",
          amount: amount.toFixed(2),
          sourceType: "greening",
          sourceId: project.id,
          postingKey: input.postingKey,
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().expense.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function projectActual(organizationId: string, projectId: string) {
  const rows = await getDb().expense.findMany({
    where: { organizationId, sourceType: "greening", sourceId: projectId },
  });
  return roundMoney(rows.reduce((sum, row) => sum.plus(D(row.amount)), new Decimal(0)));
}

export async function createMaintenanceFromProject(
  actor: Actor,
  input: { projectId: string; startOn: string; percent?: string },
) {
  requirePermission(actor, "maintenance.write");
  const project = await getDb().greeningProject.findFirst({
    where: { id: input.projectId, organizationId: actor.organizationId },
    include: { lines: true, customer: true },
  });
  if (!project) throw new BusinessError("პროექტი ვერ მოიძებნა", "not_found");
  if (project.status !== "received") throw new BusinessError("მოვლა მხოლოდ მიღებული პროექტიდან იქმნება", "invalid_state");
  const materials = project.lines.filter((line) => line.kind === "material");
  if (materials.length === 0) throw new BusinessError("მასალის ხაზი არ არის", "validation");
  return createMaintenanceContract(actor, {
    customerId: project.customerId,
    startOn: input.startOn,
    percent: input.percent,
    lines: materials.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      referenceUnitPrice: D(line.amount).div(D(line.quantity) || 1).toFixed(4),
    })),
  });
}
