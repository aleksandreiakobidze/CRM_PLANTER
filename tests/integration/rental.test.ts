import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { companyOnHand } from "@/server/features/inventory/stock-service";
import { rentalRevenue, bookRental, createRentalAsset, deliverRental, rentalBillingDays, returnRentalAssets } from "@/server/features/rental/rental-service";
import { getDb } from "@/server/db";
import { makeSellable, makeWorld } from "../helpers";

describe("გაქირავება", () => {
  it("3 დღიანი ჯავშანი გადაფარვას ბლოკავს, გაცემა გაყიდვა არ არის, დაზიანებული ხელმისაწვდომი არ რჩება", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `RENT-${actor.userId.slice(-4)}`, "2", "11");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო ღონისძიება" });
    const firstAsset = await createRentalAsset(actor, { variantId: variant.id, code: `A-${actor.userId.slice(-4)}` });
    const secondAsset = await createRentalAsset(actor, { variantId: variant.id, code: `B-${actor.userId.slice(-4)}` });
    expect(rentalBillingDays("2026-11-21", "2026-11-23")).toBe(3);
    const before = await companyOnHand(actor.organizationId, variant.id);
    const booking = await bookRental(actor, {
      customerId: customer.id,
      assetIds: [firstAsset.id],
      startOn: "2026-11-21",
      endOn: "2026-11-23",
      priceModel: "fixed_total",
      total: "1372",
      depositAmount: "100",
      postingKey: `rent-${firstAsset.id}`,
    });
    expect(booking.billingDays).toBe(3);
    await expect(
      bookRental(actor, {
        customerId: customer.id,
        assetIds: [firstAsset.id],
        startOn: "2026-11-22",
        endOn: "2026-11-22",
        priceModel: "fixed_total",
        total: "100",
        postingKey: `rent-overlap-${firstAsset.id}`,
      }),
    ).rejects.toThrow(/დაკავებულია/);
    const parallel = await Promise.allSettled([
      bookRental(actor, {
        customerId: customer.id,
        assetIds: [secondAsset.id],
        startOn: "2026-12-01",
        endOn: "2026-12-03",
        priceModel: "fixed_total",
        total: "90",
        postingKey: `parallel-a-${secondAsset.id}`,
      }),
      bookRental(actor, {
        customerId: customer.id,
        assetIds: [secondAsset.id],
        startOn: "2026-12-02",
        endOn: "2026-12-04",
        priceModel: "fixed_total",
        total: "90",
        postingKey: `parallel-b-${secondAsset.id}`,
      }),
    ]);
    expect(parallel.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    await deliverRental(actor, booking.id);
    const after = await companyOnHand(actor.organizationId, variant.id);
    expect(after.toFixed(3)).toBe(before.toFixed(3));
    const revenue = await rentalRevenue(actor.organizationId);
    expect(revenue).not.toContain("100.00");
    expect(Number(revenue)).toBeGreaterThan(0);
    await returnRentalAssets(actor, { bookingId: booking.id, assets: [{ assetId: firstAsset.id, condition: "damaged" }] });
    const damaged = await getDb().rentalAsset.findUniqueOrThrow({ where: { id: firstAsset.id } });
    expect(damaged.status).toBe("damaged");
    const available = await getDb().rentalAsset.count({ where: { id: firstAsset.id, status: "available" } });
    expect(available).toBe(0);
  });
});
