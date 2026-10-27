import { describe, expect, it } from "vitest";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { backfillInternalCodes, randomInternalCode } from "@/server/features/catalog/internal-code";
import { getDb } from "@/server/db";
import { makeWorld } from "../helpers";

describe("internal codes", () => {
  it("formats codes without look-alike characters", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(randomInternalCode("variant")).toMatch(/^PL-[A-HJ-NP-Z2-9]{6}$/);
      expect(randomInternalCode("asset")).toMatch(/^RA-[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("assigns a unique code to every new and existing variant", async () => {
    const { actor } = await makeWorld();
    const first = await createVariant(actor, { category: "plant", productName: "Ficus", sku: "", variantName: "Ficus 1m", listPrice: "10" });
    const second = await createVariant(actor, { category: "plant", productName: "Ficus", sku: "FIC-2", variantName: "Ficus 2m", listPrice: "20" });
    expect(first.internalCode).toMatch(/^PL-/);
    expect(first.sku).toBe(first.internalCode);
    expect(second.internalCode).not.toBe(first.internalCode);
    await getDb().productVariant.update({ where: { id: second.id }, data: { internalCode: null } });
    await backfillInternalCodes(getDb(), actor.organizationId);
    const missing = await getDb().productVariant.count({ where: { organizationId: actor.organizationId, internalCode: null } });
    expect(missing).toBe(0);
  });
});
