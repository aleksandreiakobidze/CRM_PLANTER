import type { Prisma } from "@/generated/prisma/client";
import { canSeeSalesTotals, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { excursionStatusLabel, SEGMENT_LABEL } from "@/server/labels";
import { D, Decimal, roundMoney } from "@/server/money";
import { Groups, monthLabel, monthOf, percent, reportPeriod } from "@/server/features/reports/report-kit";

export const EXCURSION_STATUSES = ["requested", "confirmed", "completed", "cancelled"] as const;

export type ExcursionReportFilters = {
  from?: string;
  to?: string;
  customerId?: string;
  programId?: string;
  guideId?: string;
  status?: string;
  photo?: string;
};

const NO_PROGRAM = "ინდივიდუალური";
const NO_GUIDE = "გიდის გარეშე";

export function excursionRevenue(booking: {
  status: string;
  price: Decimal.Value;
  plannedChildren: number;
  billableChildren: number | null;
  program: { pricePerChild: Decimal.Value } | null;
}) {
  if (booking.status === "cancelled") return D(0);
  if (booking.program) return roundMoney(D(booking.program.pricePerChild).mul(booking.billableChildren ?? booking.plannedChildren));
  return roundMoney(D(booking.price));
}

export async function excursionReport(actor: Actor, filters: ExcursionReportFilters) {
  requirePermission(actor, "reports.read");
  const showMoney = canSeeSalesTotals(actor);
  const period = reportPeriod(filters);
  const db = getDb();
  const where: Prisma.ExcursionBookingWhereInput = {
    organizationId: actor.organizationId,
    startsAt: { gte: period.start, lt: period.end },
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.programId === "none" ? { programId: null } : filters.programId ? { programId: filters.programId } : {}),
    ...(filters.guideId === "none" ? { staff: { none: {} } } : filters.guideId ? { staff: { some: { userId: filters.guideId } } } : {}),
    ...(filters.status && (EXCURSION_STATUSES as readonly string[]).includes(filters.status) ? { status: filters.status } : {}),
    ...(filters.photo === "yes" ? { photoAllowed: true } : filters.photo === "no" ? { photoAllowed: false } : {}),
  };
  const [bookings, programs, members] = await Promise.all([
    db.excursionBooking.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, segment: true } },
        program: { select: { id: true, nameKa: true, pricePerChild: true } },
        resource: { select: { nameKa: true } },
        staff: { select: { userId: true } },
      },
      orderBy: [{ startsAt: "asc" }, { number: "asc" }],
    }),
    db.excursionProgram.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, nameKa: true }, orderBy: { nameKa: "asc" } }),
    db.membership.findMany({ where: { organizationId: actor.organizationId }, select: { user: { select: { id: true, name: true } } } }),
  ]);
  const userName = new Map(members.map((member) => [member.user.id, member.user.name]));
  const customerIds = await db.excursionBooking.findMany({
    where: { organizationId: actor.organizationId },
    distinct: ["customerId"],
    select: { customer: { select: { id: true, name: true } } },
  });

  const months = new Groups();
  const customers = new Groups();
  const programGroups = new Groups();
  const guides = new Groups();
  const statuses = new Groups();
  let planned = 0;
  let attended = 0;
  let billable = 0;
  let charged = 0;
  let completedPlanned = 0;
  let cancelled = 0;
  let completed = 0;
  let photoAllowed = 0;
  let revenue = D(0);

  const rows = bookings.map((booking) => {
    const amount = excursionRevenue(booking);
    const children = booking.status === "completed" ? (booking.attendedChildren ?? 0) : booking.plannedChildren;
    const guideNames = booking.staff.map((item) => userName.get(item.userId) ?? "—");
    statuses.add(booking.status, excursionStatusLabel(booking.status));
    if (booking.status === "cancelled") {
      cancelled += 1;
    } else {
      planned += booking.plannedChildren;
      charged += booking.status === "completed" ? (booking.billableChildren ?? 0) : booking.plannedChildren;
      revenue = revenue.plus(amount);
      if (booking.photoAllowed) photoAllowed += 1;
      if (booking.status === "completed") {
        completed += 1;
        completedPlanned += booking.plannedChildren;
        attended += booking.attendedChildren ?? 0;
        billable += booking.billableChildren ?? 0;
      }
      const values = { quantity: children, amount };
      const month = monthOf(booking.startsAt);
      months.add(month, monthLabel(month), values);
      customers.add(booking.customer.id, booking.customer.name, values);
      programGroups.add(booking.program?.id ?? "none", booking.program?.nameKa ?? NO_PROGRAM, values);
      if (booking.staff.length === 0) guides.add("none", NO_GUIDE, values);
      for (const item of booking.staff) guides.add(item.userId, userName.get(item.userId) ?? "—", values);
    }
    return {
      id: booking.id,
      number: booking.number,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      customerId: booking.customer.id,
      customer: booking.customer.name,
      segment: SEGMENT_LABEL[booking.customer.segment] ?? booking.customer.segment,
      program: booking.program?.nameKa ?? NO_PROGRAM,
      note: booking.note,
      resource: booking.resource.nameKa,
      guides: guideNames,
      status: booking.status,
      statusLabel: excursionStatusLabel(booking.status),
      photoAllowed: booking.photoAllowed,
      planned: booking.plannedChildren,
      attended: booking.attendedChildren,
      billable: booking.billableChildren,
      revenue: showMoney ? amount : null,
    };
  });

  const active = bookings.length - cancelled;
  const hide = <T extends { amount: Decimal }>(items: T[]) => (showMoney ? items : items.map((item) => ({ ...item, amount: D(0) })));
  return {
    period,
    showMoney,
    totals: {
      bookings: bookings.length,
      active,
      completed,
      cancelled,
      planned,
      attended,
      billable,
      photoAllowed,
      attendanceRate: percent(attended, completedPlanned),
      cancelRate: percent(cancelled, bookings.length),
      revenue: showMoney ? revenue : null,
      perChild: showMoney && charged > 0 ? roundMoney(revenue.div(charged)) : null,
    },
    breakdowns: {
      months: hide(months.sorted("key")),
      customers: hide(customers.sorted("count")),
      programs: hide(programGroups.sorted("count")),
      guides: hide(guides.sorted("count")),
      statuses: statuses.sorted("count"),
    },
    rows,
    options: {
      customers: customerIds.map((item) => ({ value: item.customer.id, label: item.customer.name })).sort((a, b) => a.label.localeCompare(b.label)),
      programs: programs.map((item) => ({ value: item.id, label: item.nameKa })),
      guides: members.map((member) => ({ value: member.user.id, label: member.user.name })).sort((a, b) => a.label.localeCompare(b.label)),
    },
  };
}

export type ExcursionReport = Awaited<ReturnType<typeof excursionReport>>;
