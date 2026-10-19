import { describe, expect, it } from "vitest";
import { updateListPrice } from "@/server/features/catalog/catalog-service";
import { createCustomer } from "@/server/features/crm/customer-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import {
  amendContract,
  billMaintenancePeriod,
  contractFee,
  createMaintenanceContract,
  maintenanceQuote,
  replaceCoveredPlant,
  setContractStatus,
} from "@/server/features/maintenance/maintenance-service";
import { makeSellable, makeWorld } from "../helpers";

describe("მოვლა", () => {
  it("1000-ის ბაზა იძლევა 100-ს და ძველ ინვოისს კატალოგი არ ცვლის", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `CARE-${actor.userId.slice(-4)}`, "1", "12");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო მოვლა" });
    const quote = maintenanceQuote([{ quantity: D("1"), referenceUnitPrice: D("1000") }], D("10"));
    expect(quote.fee.toFixed(2)).toBe("100.00");
    const contract = await createMaintenanceContract(actor, {
      customerId: customer.id,
      startOn: "2026-10-01",
      lines: [{ description: "მცენარეები", quantity: "1", referenceUnitPrice: "1000" }],
    });
    await setContractStatus(actor, contract.id, "active");
    const first = await billMaintenancePeriod(actor, contract.id, "2026-10");
    const second = await billMaintenancePeriod(actor, contract.id, "2026-10");
    expect(second?.id).toBe(first?.id);
    expect(D(first!.total).toFixed(2)).toBe("100.00");
    expect(first?.status).toBe("draft");
    await updateListPrice(actor, variant.id, "5000");
    const reread = await getDb().invoice.findUniqueOrThrow({ where: { id: first!.id } });
    expect(D(reread.total).toFixed(2)).toBe("100.00");
    const fee = await contractFee(contract.id);
    expect(fee.fee).toBe("100.00");
    await amendContract(actor, contract.id, { effectiveOn: "2026-11-01", percent: "20", note: "შეთანხმებული" });
    const next = await billMaintenancePeriod(actor, contract.id, "2026-11");
    expect(D(next!.total).toFixed(2)).toBe("200.00");
    expect(D((await getDb().invoice.findUniqueOrThrow({ where: { id: first!.id } })).total).toFixed(2)).toBe("100.00");
    await setContractStatus(actor, contract.id, "paused");
    const paused = await billMaintenancePeriod(actor, contract.id, "2026-12");
    expect(paused).toBeNull();
  });

  it("დაფარული ჩანაცვლება ბაზას არ აორმაგებს", async () => {
    const { actor } = await makeWorld();
    const { variant, location } = await makeSellable(actor, `REPL-${actor.userId.slice(-4)}`, "1", "9");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო ჩანაცვლება" });
    const contract = await createMaintenanceContract(actor, {
      customerId: customer.id,
      startOn: "2026-10-01",
      lines: [{ description: "ერთი მცენარე", quantity: "1", referenceUnitPrice: "1000" }],
    });
    const plant = await getDb().customerPlant.findFirstOrThrow({ where: { contractId: contract.id, status: "active" } });
    await replaceCoveredPlant(actor, {
      customerPlantId: plant.id,
      variantId: variant.id,
      locationId: location.id,
      postingKey: `replace-${plant.id}`,
    });
    const fee = await contractFee(contract.id);
    expect(fee.base).toBe("1000.00");
    expect(fee.fee).toBe("100.00");
    const active = await getDb().contractPlantLine.count({ where: { contractId: contract.id, active: true } });
    expect(active).toBe(1);
    const expense = await getDb().expense.findUniqueOrThrow({ where: { postingKey: `replace-${plant.id}` } });
    expect(D(expense.amount).toFixed(2)).toBe("9.00");
    const movement = await getDb().stockMovement.findFirstOrThrow({ where: { postingKey: `replace-${plant.id}:stock` } });
    expect(D(movement.quantity).toFixed(3)).toBe("-1.000");
  });
});
