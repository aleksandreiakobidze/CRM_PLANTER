import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { bookExcursion, cancelExcursion, completeExcursion, rescheduleExcursion, rescheduleExcursionToDate } from "@/server/features/excursions/excursion-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { zonedDateTime } from "@/server/time";
import { makeWorld } from "../helpers";

describe("ექსკურსია", () => {
  it("ფანჯარას და სივრცის გადაფარვას იცავს, ინვოისი შენახულ ფასს უდრის", async () => {
    const { actor } = await makeWorld();
    const school = await createCustomer(actor, { kind: "company", name: "სატესტო სკოლა B", segment: "school" });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    await expect(
      bookExcursion(actor, {
        customerId: school.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-21", "09:00"),
        endsAt: zonedDateTime("2026-11-21", "11:00"),
        plannedChildren: 10,
        note: "ადრე",
        price: "80",
        postingKey: `early-${resource.id}`,
      }),
    ).rejects.toThrow(/ფანჯარა/);
    const booking = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-11-21", "13:00"),
      endsAt: zonedDateTime("2026-11-21", "15:00"),
      plannedChildren: 20,
      note: "სათბურის დათვალიერება",
      price: "80",
      postingKey: `ok-${resource.id}`,
    });
    await completeExcursion(actor, booking.id, 18);
    const usage = await getDb().materialUsage.findFirst({ where: { bookingId: booking.id } });
    expect(usage).toBeNull();
    const invoice = await getDb().invoice.findUniqueOrThrow({ where: { postingKey: `invoice:excursion:${booking.id}` } });
    expect(D(invoice.total).toFixed(2)).toBe("80.00");
    const parallel = await Promise.allSettled([
      bookExcursion(actor, {
        customerId: school.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-22", "13:00"),
        endsAt: zonedDateTime("2026-11-22", "15:00"),
        plannedChildren: 10,
        note: "პირველი",
        price: "40",
        postingKey: `cap-a-${resource.id}`,
      }),
      bookExcursion(actor, {
        customerId: school.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-22", "14:00"),
        endsAt: zonedDateTime("2026-11-22", "16:00"),
        plannedChildren: 10,
        note: "მეორე",
        price: "40",
        postingKey: `cap-b-${resource.id}`,
      }),
    ]);
    expect(parallel.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  });

  it("გაუქმება სივრცეს ათავისუფლებს და დასრულებულს აღარ უქმებს", async () => {
    const { actor } = await makeWorld();
    const school = await createCustomer(actor, { kind: "company", name: "სატესტო სკოლა C", segment: "school" });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    const first = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-12-01", "13:00"),
      endsAt: zonedDateTime("2026-12-01", "15:00"),
      plannedChildren: 12,
      note: "გასაუქმებელი",
      price: "50",
      postingKey: `cancel-${resource.id}`,
    });
    const cancelled = await cancelExcursion(actor, first.id);
    expect(cancelled.status).toBe("cancelled");
    const hold = await getDb().resourceReservation.findFirst({ where: { bookingId: first.id } });
    expect(hold?.status).toBe("cancelled");
    const second = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-12-01", "13:00"),
      endsAt: zonedDateTime("2026-12-01", "15:00"),
      plannedChildren: 8,
      note: "გათავისუფლებული სივრცე",
      price: "40",
      postingKey: `after-cancel-${resource.id}`,
    });
    expect(second.status).toBe("confirmed");
    await completeExcursion(actor, second.id, 8);
    await expect(cancelExcursion(actor, second.id)).rejects.toThrow(/უქმდ/);
    await expect(completeExcursion(actor, first.id, 8)).rejects.toThrow(/სრულდ/);
  });

  it("moves the booking to a new date and keeps the old slot free", async () => {
    const { actor } = await makeWorld();
    const school = await createCustomer(actor, { kind: "company", name: "სატესტო სკოლა D", segment: "school" });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    const booking = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-12-03", "13:00"),
      endsAt: zonedDateTime("2026-12-03", "15:00"),
      plannedChildren: 10,
      note: "გადასატანი",
      price: "45",
      postingKey: `move-${resource.id}`,
    });
    const moved = await rescheduleExcursionToDate(actor, booking.id, "2026-12-04");
    expect(moved.startsAt.toISOString()).toBe(zonedDateTime("2026-12-04", "13:00").toISOString());
    expect(moved.endsAt.toISOString()).toBe(zonedDateTime("2026-12-04", "15:00").toISOString());
    const hold = await getDb().resourceReservation.findFirst({ where: { bookingId: booking.id, status: "confirmed" } });
    expect(hold?.startsAt.toISOString()).toBe(zonedDateTime("2026-12-04", "13:00").toISOString());
    const replacement = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-12-03", "13:00"),
      endsAt: zonedDateTime("2026-12-03", "15:00"),
      plannedChildren: 6,
      note: "ძველი სლოტი",
      price: "30",
      postingKey: `old-slot-${resource.id}`,
    });
    expect(replacement.status).toBe("confirmed");
    await expect(
      rescheduleExcursion(actor, booking.id, {
        startsAt: zonedDateTime("2026-12-03", "13:00"),
        endsAt: zonedDateTime("2026-12-03", "15:00"),
      }),
    ).rejects.toThrow(/დაკავებული/);
    await completeExcursion(actor, booking.id, 10);
    await expect(rescheduleExcursionToDate(actor, booking.id, "2026-12-05")).rejects.toThrow(/იცვლ/);
  });
});
