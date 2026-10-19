import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { bookExcursion, completeExcursion, createProgram } from "@/server/features/excursions/excursion-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { zonedDateTime } from "@/server/time";
import { makeSellable, makeWorld } from "../helpers";

describe("ექსკურსია", () => {
  it("ფანჯარას, ტევადობას და მასალის 20/18 წესს იცავს", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `EXC-${actor.userId.slice(-4)}`, "30", "2");
    const school = await createCustomer(actor, { kind: "company", name: "სატესტო სკოლა B", segment: "school" });
    const program = await createProgram(actor, {
      nameKa: "სათბურის დათვალიერება",
      durationMinutes: 120,
      pricePerChild: "25",
      maxCapacity: 30,
      variantId: variant.id,
    });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    await expect(
      bookExcursion(actor, {
        customerId: school.id,
        programId: program.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-21", "12:00"),
        endsAt: zonedDateTime("2026-11-21", "14:00"),
        plannedChildren: 10,
        postingKey: `early-${program.id}`,
      }),
    ).rejects.toThrow(/ფანჯარა/);
    const booking = await bookExcursion(actor, {
      customerId: school.id,
      programId: program.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-11-21", "13:00"),
      endsAt: zonedDateTime("2026-11-21", "15:00"),
      plannedChildren: 20,
      postingKey: `ok-${program.id}`,
    });
    await completeExcursion(actor, booking.id, 18);
    const usage = await getDb().materialUsage.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(D(usage.reserved).toFixed(0)).toBe("20");
    expect(D(usage.consumed).toFixed(0)).toBe("18");
    const balance = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id, location: { code: "sales" } } });
    expect(D(balance.onHand).toFixed(3)).toBe("12.000");
    expect(D(balance.reserved).toFixed(3)).toBe("0.000");
    const invoice = await getDb().invoice.findUniqueOrThrow({ where: { postingKey: `invoice:excursion:${booking.id}` } });
    expect(D(invoice.total).toFixed(2)).toBe("450.00");
    const parallel = await Promise.allSettled([
      bookExcursion(actor, {
        customerId: school.id,
        programId: program.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-22", "13:00"),
        endsAt: zonedDateTime("2026-11-22", "15:00"),
        plannedChildren: 10,
        postingKey: `cap-a-${program.id}`,
      }),
      bookExcursion(actor, {
        customerId: school.id,
        programId: program.id,
        resourceId: resource.id,
        startsAt: zonedDateTime("2026-11-22", "14:00"),
        endsAt: zonedDateTime("2026-11-22", "16:00"),
        plannedChildren: 10,
        postingKey: `cap-b-${program.id}`,
      }),
    ]);
    expect(parallel.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  });
});
