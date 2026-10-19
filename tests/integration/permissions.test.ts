import { describe, expect, it } from "vitest";
import { actorFromToken, createSession, revokeToken } from "@/server/auth/session";
import { listBalances } from "@/server/features/inventory/stock-service";
import { recordPayment } from "@/server/features/finance/payment-service";
import { makeSellable, makeWorld } from "../helpers";

describe("უფლებები", () => {
  it("მძღოლი თვითღირებულებას ვერ ხედავს და ფინანსურ გატარებას ვერ აკეთებს", async () => {
    const owner = await makeWorld("owner");
    const driver = await makeWorld("driver");
    await makeSellable(owner.actor, `COST-${owner.actor.userId.slice(-4)}`, "2", "9");
    const sameOrgDriver = { ...driver.actor, organizationId: owner.organizationId };
    const visible = await listBalances(sameOrgDriver);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((row) => row.unitCost === undefined)).toBe(true);
    expect(JSON.stringify(visible)).not.toContain("unitCost");
    await expect(
      recordPayment(sameOrgDriver, {
        customerId: "missing",
        amount: "1",
        method: "cash",
        paidOn: "2026-10-19",
        postingKey: "nope",
        allocations: [],
      }),
    ).rejects.toThrow(/უფლება/);
  });

  it("გაუქმებული სესია აღარ მუშაობს", async () => {
    const { actor } = await makeWorld();
    const token = await createSession(actor.userId);
    expect((await actorFromToken(token)).userId).toBe(actor.userId);
    await revokeToken(token);
    await expect(actorFromToken(token)).rejects.toThrow(/სესია/);
  });
});
