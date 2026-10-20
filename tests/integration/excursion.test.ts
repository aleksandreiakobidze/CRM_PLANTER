import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { bookExcursion, completeExcursion } from "@/server/features/excursions/excursion-service";
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
        startsAt: zonedDateTime("2026-11-21", "12:00"),
        endsAt: zonedDateTime("2026-11-21", "14:00"),
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
});
