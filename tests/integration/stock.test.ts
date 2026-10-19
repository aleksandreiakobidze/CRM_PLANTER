import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { expireHeldReservations } from "@/server/features/inventory/stock-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { cancelOrder, confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder, holdStock } from "@/server/features/sales/order-service";
import { makeSellable, makeWorld } from "../helpers";

describe("მარაგი", () => {
  it("ორი პარალელური მოთხოვნა 4-4-ზე ერთ ნაშთს ორჯერ არ ყიდის", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-RACE-${actor.organizationId.slice(-4)}`, "5");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო მყიდველი" });
    const first = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "4" }] });
    const second = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "4" }] });
    const orderA = await convertQuoteToOrder(actor, first.id);
    const orderB = await convertQuoteToOrder(actor, second.id);
    const results = await Promise.allSettled([confirmOrder(actor, orderA.id), confirmOrder(actor, orderB.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const balance = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id } });
    expect(D(balance.onHand).toFixed(3)).toBe("5.000");
    expect(D(balance.reserved).toFixed(3)).toBe("4.000");
    expect(D(balance.onHand).minus(balance.reserved).gte(0)).toBe(true);
  });

  it("გაუქმება რეზერვს ერთხელ ათავისუფლებს, expiry დადასტურებულს არ ეხება", async () => {
    const { actor } = await makeWorld();
    const { variant, location } = await makeSellable(actor, `SKU-CANCEL-${actor.userId.slice(-4)}`, "3");
    const customer = await createCustomer(actor, { kind: "person", name: "სატესტო პირი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await cancelOrder(actor, order.id);
    await cancelOrder(actor, order.id);
    const afterCancel = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id, locationId: location.id } });
    expect(D(afterCancel.reserved).toFixed(3)).toBe("0.000");
    await holdStock(actor, {
      variantId: variant.id,
      locationId: location.id,
      quantity: "1",
      postingKey: `hold-${order.id}`,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const confirmed = await getDb().reservation.findFirstOrThrow({ where: { sourceId: order.id } });
    await getDb().reservation.update({ where: { id: confirmed.id }, data: { expiresAt: new Date("2020-01-01T00:00:00.000Z"), status: "confirmed" } });
    await expireHeldReservations(new Date("2026-01-01T00:00:00.000Z"));
    const held = await getDb().reservation.findUniqueOrThrow({ where: { postingKey: `hold-${order.id}` } });
    const stillConfirmed = await getDb().reservation.findUniqueOrThrow({ where: { id: confirmed.id } });
    expect(held.status).toBe("expired");
    expect(stillConfirmed.status).toBe("confirmed");
  });

  it("მიწოდებული საქონელი უბრალო გაუქმებით არ ბრუნდება", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-FUL-${actor.userId.slice(-4)}`, "2");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო მიწოდება" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    await expect(cancelOrder(actor, order.id)).rejects.toThrow(/არ ბრუნდება/);
    const issues = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    expect(issues).toBe(1);
  });
});
