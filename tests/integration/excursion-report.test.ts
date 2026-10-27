import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { bookExcursion, cancelExcursion, completeExcursion } from "@/server/features/excursions/excursion-service";
import { excursionReport } from "@/server/features/reports/excursion-report";
import { getDb } from "@/server/db";
import { zonedDateTime } from "@/server/time";
import { makeWorld } from "../helpers";

describe("excursion report", () => {
  it("totals children, revenue and cancellations and groups by school, month and guide", async () => {
    const { actor } = await makeWorld();
    const schoolA = await createCustomer(actor, { kind: "company", name: "რეპორტის სკოლა A", segment: "school" });
    const schoolB = await createCustomer(actor, { kind: "company", name: "რეპორტის სკოლა B", segment: "school" });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    const book = (customerId: string, day: string, children: number, price: string, key: string, staff: string[] = []) =>
      bookExcursion(actor, {
        customerId,
        resourceId: resource.id,
        startsAt: zonedDateTime(day, "11:00"),
        endsAt: zonedDateTime(day, "12:30"),
        plannedChildren: children,
        note: "დათვალიერება",
        price,
        staffUserIds: staff,
        photoAllowed: key === "a1",
        postingKey: `report-${key}-${resource.id}`,
      });
    const a1 = await book(schoolA.id, "2027-03-03", 20, "100", "a1", [actor.userId]);
    await book(schoolA.id, "2027-04-07", 15, "75", "a2");
    const b1 = await book(schoolB.id, "2027-03-10", 30, "150", "b1");
    await completeExcursion(actor, a1.id, 18);
    await cancelExcursion(actor, b1.id);

    const report = await excursionReport(actor, { from: "2027-03-01", to: "2027-04-30" });
    expect(report.totals.bookings).toBe(3);
    expect(report.totals.completed).toBe(1);
    expect(report.totals.cancelled).toBe(1);
    expect(report.totals.planned).toBe(35);
    expect(report.totals.attended).toBe(18);
    expect(report.totals.billable).toBe(18);
    expect(report.totals.attendanceRate).toBe(90);
    expect(report.totals.photoAllowed).toBe(1);
    expect(report.totals.revenue?.toFixed(2)).toBe("175.00");
    expect(report.breakdowns.months.map((row) => [row.key, row.count, row.quantity.toNumber()])).toEqual([
      ["2027-03", 1, 18],
      ["2027-04", 1, 15],
    ]);
    expect(report.breakdowns.customers).toHaveLength(1);
    expect(report.breakdowns.customers[0].amount.toFixed(2)).toBe("175.00");
    expect(report.breakdowns.guides.map((row) => row.key).sort()).toEqual([actor.userId, "none"].sort());

    const guided = await excursionReport(actor, { from: "2027-03-01", to: "2027-04-30", guideId: actor.userId });
    expect(guided.rows.map((row) => row.id)).toEqual([a1.id]);
    const cancelled = await excursionReport(actor, { from: "2027-03-01", to: "2027-04-30", status: "cancelled", customerId: schoolB.id });
    expect(cancelled.rows).toHaveLength(1);
    expect(cancelled.totals.revenue?.toFixed(2)).toBe("0.00");
    const march = await excursionReport(actor, { from: "2027-03-01", to: "2027-03-31", photo: "no" });
    expect(march.rows.map((row) => row.id)).toEqual([b1.id]);
  });
});
