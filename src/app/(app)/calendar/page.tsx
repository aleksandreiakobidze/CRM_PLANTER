import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { MonthCalendar, type CalendarChip, type CalendarDay } from "@/components/month-calendar";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { excursionStatusLabel, photoAllowedLabel } from "@/server/labels";
import { addDaysIso, BUSINESS_TIME_ZONE, formatDateOnly, monthKey, parseDateOnly, periodBounds, tbilisiDateString, zonedDateTime } from "@/server/time";

const TASK_STATUS: Record<string, string> = { open: "გასაკეთებელი", doing: "მიმდინარე", done: "შესრულებული" };
const RENTAL_STATUS: Record<string, string> = { confirmed: "დადასტურებული", out: "გაცემული", returned: "დაბრუნებული", draft: "დრაფტი" };

function taskChip(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueOn: Date | null;
  customer: { id: string; name: string } | null;
  assignments: { status: string; user: { name: string } }[];
  attachments: { id: string; fileName: string }[];
}, today: string): CalendarChip {
  const due = task.dueOn ? formatDateOnly(task.dueOn) : "";
  const people = task.assignments.map((item) => `${item.user.name}${item.status === "done" ? " · შესრულებული" : ""}`).join(", ");
  return {
    id: task.id,
    kind: "task",
    label: task.title,
    title: task.title,
    late: Boolean(due && due < today),
    lines: [
      TASK_STATUS[task.status] ?? task.status,
      due ? (due < today ? `ვადაგადაცილებული · ${due}` : due) : "ვადის გარეშე",
      task.customer?.name ?? "კლიენტის გარეშე",
      task.description?.trim() || "",
      people,
    ].filter(Boolean),
    files: task.attachments.map((file) => ({ id: file.id, name: file.fileName })),
    href: `/work/${task.id}`,
    hrefLabel: task.customer ? "კლიენტის ბარათი" : "დაფა",
  };
}

const MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthCells(month: string) {
  const { start, end } = periodBounds(month);
  const weekday = parseDateOnly(start).getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const cells: string[] = [];
  let cursor = addDaysIso(start, -mondayOffset);
  do {
    cells.push(cursor);
    cursor = addDaysIso(cursor, 1);
  } while (cursor <= end || cells.length % 7 !== 0);
  return cells;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await getActor();
  const params = await searchParams;
  const current = monthKey();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : current;
  const cells = monthCells(month);
  const from = cells[0];
  const to = cells[cells.length - 1];
  const today = tbilisiDateString();
  const [tasks, rentals, excursions] = await Promise.all([
    getDb().task.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { notIn: ["done", "cancelled"] },
        OR: [{ dueOn: null }, { dueOn: { gte: parseDateOnly(from), lte: parseDateOnly(to) } }],
      },
      include: { customer: true, assignments: { include: { user: true } }, attachments: true },
    }),
    getDb().rentalBooking.findMany({
      where: {
        organizationId: actor.organizationId,
        startOn: { lte: parseDateOnly(to) },
        endOn: { gte: parseDateOnly(from) },
      },
      include: { customer: true },
    }),
    getDb().excursionBooking.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { not: "cancelled" },
        startsAt: { gte: zonedDateTime(from, "00:00"), lt: zonedDateTime(addDaysIso(to, 1), "00:00") },
      },
      include: { customer: true, program: true },
    }),
  ]);
  const days: CalendarDay[] = cells.map((iso) => {
    const chips: CalendarChip[] = [
      ...tasks.filter((task) => task.dueOn && formatDateOnly(task.dueOn) === iso).map((task) => taskChip(task, today)),
      ...rentals.filter((booking) => formatDateOnly(booking.startOn) <= iso && iso <= formatDateOnly(booking.endOn)).map((booking) => ({
        id: booking.id,
        kind: "rental" as const,
        label: `გაქირავება · ${booking.customer.name}`,
        title: booking.number,
        lines: [
          booking.customer.name,
          `${formatDateOnly(booking.startOn)} – ${formatDateOnly(booking.endOn)} · ${booking.billingDays} დღე`,
          `${booking.total.toString()} ₾ · დეპოზიტი ${booking.depositAmount.toString()} ₾`,
          RENTAL_STATUS[booking.status] ?? booking.status,
        ],
        href: `/rental/${booking.id}`,
        hrefLabel: "ჯავშნის გახსნა",
      })),
      ...excursions.filter((booking) => formatInTimeZone(booking.startsAt, BUSINESS_TIME_ZONE, "yyyy-MM-dd") === iso).map((booking) => ({
        id: booking.id,
        kind: "excursion" as const,
        label: `ექსკურსია · ${booking.customer.name}`,
        title: booking.number,
        movable: booking.status !== "completed",
        lines: [
          booking.customer.name,
          booking.note.trim() || booking.program?.nameKa || "ექსკურსია",
          `${formatInTimeZone(booking.startsAt, BUSINESS_TIME_ZONE, "HH:mm")}–${formatInTimeZone(booking.endsAt, BUSINESS_TIME_ZONE, "HH:mm")}`,
          `ბავშვები: ${booking.plannedChildren}`,
          photoAllowedLabel(booking.photoAllowed),
          excursionStatusLabel(booking.status),
        ],
        href: `/excursions/${booking.id}`,
        hrefLabel: "ჯავშნის გახსნა",
      })),
    ];
    return { iso, inMonth: iso.startsWith(month), chips };
  });
  const unscheduled: CalendarChip[] = tasks.filter((task) => !task.dueOn).map((task) => taskChip(task, today));
  const [year, monthNumber] = month.split("-").map(Number);
  return (
    <section className="grid">
      <div className="page-head">
        <div className="row">
          <h1>{MONTHS[monthNumber - 1]} {year}</h1>
          <div className="actions">
            <Link className="button secondary" href={`/calendar?month=${shiftMonth(month, -1)}`}>წინა</Link>
            <Link className="button secondary" href={`/calendar?month=${current}`}>დღეს</Link>
            <Link className="button secondary" href={`/calendar?month=${shiftMonth(month, 1)}`}>შემდეგი</Link>
          </div>
        </div>
      </div>
      <MonthCalendar today={today} days={days} unscheduled={unscheduled} />
    </section>
  );
}
