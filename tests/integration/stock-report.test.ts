import { describe, expect, it } from "vitest";
import { postOpeningStock } from "@/server/features/inventory/stock-service";
import { stockReport } from "@/server/features/reports/stock-report";
import { getDb } from "@/server/db";
import { tbilisiDateString } from "@/server/time";
import { makeSellable, makeWorld } from "../helpers";

describe("stock report", () => {
  it("rolls balances back to the chosen date and splits period movements", async () => {
    const { actor } = await makeWorld();
    const today = tbilisiDateString();
    const { variant, location } = await makeSellable(actor, "SR-1", "10", "8");
    await getDb().stockMovement.updateMany({
      where: { organizationId: actor.organizationId, variantId: variant.id },
      data: { occurredAt: new Date("2026-01-10T08:00:00Z") },
    });
    await postOpeningStock(actor, { variantId: variant.id, locationId: location.id, quantity: "5", unitCost: "8", postingKey: `sr-more:${variant.id}` });

    const january = await stockReport(actor, { from: "2026-01-01", to: "2026-01-31" });
    const row = january.rows.find((item) => item.variantId === variant.id);
    expect(row?.opening.toNumber()).toBe(0);
    expect(row?.incoming.toNumber()).toBe(10);
    expect(row?.closing.toNumber()).toBe(10);
    expect(january.totals.value?.toFixed(2)).toBe("80.00");

    const now = await stockReport(actor, { from: today, to: today });
    const current = now.rows.find((item) => item.variantId === variant.id);
    expect(current?.opening.toNumber()).toBe(10);
    expect(current?.incoming.toNumber()).toBe(5);
    expect(current?.closing.toNumber()).toBe(15);
    expect(now.breakdowns.locations[0]?.amount.toFixed(2)).toBe("120.00");

    const before = await stockReport(actor, { from: "2025-12-01", to: "2025-12-31" });
    expect(before.rows.find((item) => item.variantId === variant.id)).toBeUndefined();

    const moved = await stockReport(actor, { from: "2026-02-01", to: "2026-02-28", only: "moved" });
    expect(moved.rows).toHaveLength(0);
    const filtered = await stockReport(actor, { from: today, to: today, q: "nothing-matches" });
    expect(filtered.rows).toHaveLength(0);
  });
});
