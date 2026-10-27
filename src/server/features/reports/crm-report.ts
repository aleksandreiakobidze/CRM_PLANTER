import type { Prisma } from "@/generated/prisma/client";
import { canSeeSalesTotals, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { PRIORITY, RELATIONSHIP, SEGMENT_LABEL } from "@/server/labels";
import { D } from "@/server/money";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { Groups, percent, reportPeriod } from "@/server/features/reports/report-kit";

export type CrmReportFilters = { from?: string; to?: string; ownerId?: string; segment?: string };

const NONE = "—";
const CLOSED_TASK = ["done", "cancelled"];

export async function crmReport(actor: Actor, filters: CrmReportFilters) {
  requirePermission(actor, "reports.read");
  requirePermission(actor, "crm.read");
  const showMoney = canSeeSalesTotals(actor);
  const period = reportPeriod(filters);
  const today = parseDateOnly(tbilisiDateString());
  const db = getDb();
  const orgId = actor.organizationId;
  const ownerId = filters.ownerId === "none" ? null : filters.ownerId || undefined;
  const segment = filters.segment && SEGMENT_LABEL[filters.segment] ? filters.segment : undefined;
  const customerWhere: Prisma.CustomerWhereInput = {
    organizationId: orgId,
    mergedIntoId: null,
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(segment ? { segment } : {}),
  };

  const [customers, members, quotes, tasks, completions] = await Promise.all([
    db.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        name: true,
        relationshipStatus: true,
        district: true,
        venueType: true,
        priority: true,
        segment: true,
        ownerId: true,
        nextContactOn: true,
        doNotContact: true,
        phone: true,
        createdAt: true,
      },
    }),
    db.membership.findMany({ where: { organizationId: orgId }, select: { user: { select: { id: true, name: true } } } }),
    db.quote.findMany({
      where: { organizationId: orgId, createdAt: { gte: period.start, lt: period.end }, customer: customerWhere },
      select: { id: true, status: true, createdById: true, order: { select: { id: true } }, lines: { select: { lineTotal: true } } },
    }),
    db.task.findMany({
      where: {
        organizationId: orgId,
        status: { not: "cancelled" },
        ...(ownerId ? { OR: [{ assigneeId: ownerId }, { assignments: { some: { userId: ownerId } } }] } : {}),
      },
      select: {
        id: true,
        status: true,
        dueOn: true,
        createdAt: true,
        createdById: true,
        assigneeId: true,
        assignments: { select: { userId: true, status: true, completedAt: true } },
      },
    }),
    db.taskAssignment.count({
      where: { task: { organizationId: orgId }, completedAt: { gte: period.start, lt: period.end }, ...(ownerId ? { userId: ownerId } : {}) },
    }),
  ]);
  const userName = new Map(members.map((member) => [member.user.id, member.user.name]));
  const nameOf = (id: string | null) => (id ? (userName.get(id) ?? NONE) : "უპასუხისმგებლო");

  const byStatus = new Groups();
  const byZone = new Groups();
  const byType = new Groups();
  const byPriority = new Groups();
  const byOwner = new Groups();
  const newBySegment = new Groups();
  const overdue: { id: string; name: string; nextContactOn: Date; owner: string; status: string; phone: string | null; days: number }[] = [];
  let newCustomers = 0;
  for (const customer of customers) {
    byStatus.add(customer.relationshipStatus, RELATIONSHIP[customer.relationshipStatus]?.label ?? customer.relationshipStatus);
    byZone.add(customer.district ?? "", customer.district ?? "ზონის გარეშე");
    byType.add(customer.venueType ?? "", customer.venueType ?? "ტიპის გარეშე");
    byPriority.add(customer.priority ?? "", customer.priority ? (PRIORITY[customer.priority]?.label ?? customer.priority) : "პრიორიტეტის გარეშე");
    byOwner.add(customer.ownerId ?? "none", nameOf(customer.ownerId));
    if (customer.createdAt >= period.start && customer.createdAt < period.end) {
      newCustomers += 1;
      newBySegment.add(customer.segment, SEGMENT_LABEL[customer.segment] ?? customer.segment);
    }
    if (
      customer.nextContactOn &&
      customer.nextContactOn < today &&
      !customer.doNotContact &&
      customer.relationshipStatus !== "declined"
    ) {
      overdue.push({
        id: customer.id,
        name: customer.name,
        nextContactOn: customer.nextContactOn,
        owner: nameOf(customer.ownerId),
        status: RELATIONSHIP[customer.relationshipStatus]?.label ?? customer.relationshipStatus,
        phone: customer.phone,
        days: Math.round((today.getTime() - customer.nextContactOn.getTime()) / 86_400_000),
      });
    }
  }
  overdue.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));

  const stage = { created: 0, sent: 0, accepted: 0, ordered: 0, declined: 0 };
  const stageValue = { created: D(0), sent: D(0), accepted: D(0), ordered: D(0), declined: D(0) };
  for (const quote of quotes) {
    const value = quote.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0));
    const reached = {
      created: true,
      sent: quote.status !== "draft",
      accepted: ["accepted", "converted"].includes(quote.status) || Boolean(quote.order),
      ordered: quote.status === "converted" || Boolean(quote.order),
      declined: quote.status === "declined",
    };
    for (const key of Object.keys(stage) as (keyof typeof stage)[]) {
      if (!reached[key]) continue;
      stage[key] += 1;
      stageValue[key] = stageValue[key].plus(value);
    }
  }
  const funnel = [
    { key: "created", label: "შექმნილი", count: stage.created, value: stageValue.created },
    { key: "sent", label: "გაგზავნილი", count: stage.sent, value: stageValue.sent },
    { key: "accepted", label: "მიღებული", count: stage.accepted, value: stageValue.accepted },
    { key: "ordered", label: "შეკვეთა გახდა", count: stage.ordered, value: stageValue.ordered },
  ].map((row) => ({ ...row, rate: percent(row.count, stage.created), value: showMoney ? row.value : null }));

  type MemberRow = { id: string; name: string; created: number; assigned: number; done: number; open: number; overdue: number };
  const team = new Map<string, MemberRow>();
  const member = (id: string) => {
    const row = team.get(id) ?? { id, name: nameOf(id), created: 0, assigned: 0, done: 0, open: 0, overdue: 0 };
    team.set(id, row);
    return row;
  };
  let tasksCreated = 0;
  let tasksOpen = 0;
  let tasksOverdue = 0;
  for (const task of tasks) {
    const inPeriod = task.createdAt >= period.start && task.createdAt < period.end;
    const isOpen = !CLOSED_TASK.includes(task.status);
    const isOverdue = isOpen && task.dueOn != null && task.dueOn < today;
    if (inPeriod) tasksCreated += 1;
    if (isOpen) tasksOpen += 1;
    if (isOverdue) tasksOverdue += 1;
    if (inPeriod && task.createdById) member(task.createdById).created += 1;
    const assignees = task.assignments.length
      ? task.assignments
      : task.assigneeId
        ? [{ userId: task.assigneeId, status: task.status, completedAt: null as Date | null }]
        : [];
    for (const assignee of assignees) {
      if (ownerId && assignee.userId !== ownerId) continue;
      const row = member(assignee.userId);
      if (inPeriod) row.assigned += 1;
      if (assignee.completedAt && assignee.completedAt >= period.start && assignee.completedAt < period.end) row.done += 1;
      const mineOpen = isOpen && assignee.status !== "done";
      if (mineOpen) row.open += 1;
      if (mineOpen && isOverdue) row.overdue += 1;
    }
  }

  return {
    period,
    showMoney,
    totals: {
      customers: customers.length,
      newCustomers,
      overdueContacts: overdue.length,
      active: customers.filter((item) => item.relationshipStatus === "customer").length,
      conversion: percent(customers.filter((item) => item.relationshipStatus === "customer").length, customers.length),
      quotes: stage.created,
      quoteWin: percent(stage.ordered, stage.created),
      declined: stage.declined,
      tasksCreated,
      tasksDone: completions,
      tasksOpen,
      tasksOverdue,
    },
    breakdowns: {
      status: Object.keys(RELATIONSHIP)
        .map((key) => byStatus.sorted("count").find((row) => row.key === key))
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
      zones: byZone.sorted("count"),
      types: byType.sorted("count"),
      priority: [...byPriority.sorted("key").filter((row) => row.key), ...byPriority.sorted("key").filter((row) => !row.key)],
      owners: byOwner.sorted("count"),
      newBySegment: newBySegment.sorted("count"),
    },
    funnel,
    team: [...team.values()].sort((a, b) => b.done - a.done || b.assigned - a.assigned || a.name.localeCompare(b.name)),
    overdue,
    options: {
      owners: members.map((item) => ({ value: item.user.id, label: item.user.name })).sort((a, b) => a.label.localeCompare(b.label)),
      segments: Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label })),
    },
  };
}

export type CrmReport = Awaited<ReturnType<typeof crmReport>>;
