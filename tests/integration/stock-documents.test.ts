import { describe, expect, it } from "vitest";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { listMovements } from "@/server/features/inventory/movement-journal";
import { postOpeningDocument, transferDocument } from "@/server/features/inventory/stock-service";
import { getDb } from "@/server/db";
import { makeWorld } from "../helpers";

async function location(organizationId: string, code: string) {
  return getDb().location.findUniqueOrThrow({ where: { organizationId_code: { organizationId, code } } });
}

async function onHand(variantId: string, locationId: string) {
  const balance = await getDb().stockBalance.findFirst({ where: { variantId, locationId } });
  return balance?.onHand.toString() ?? "0";
}

describe("multi-line stock documents", () => {
  it("posts opening and transfer documents once and shows them in the journal by source", async () => {
    const { actor } = await makeWorld();
    const a = await createVariant(actor, { category: "plant", productName: "A", sku: "", variantName: "A", listPrice: "10" });
    const b = await createVariant(actor, { category: "plant", productName: "B", sku: "", variantName: "B", listPrice: "10" });
    const greenhouse = await location(actor.organizationId, "greenhouse");
    const sales = await location(actor.organizationId, "sales");

    const opening = { locationId: greenhouse.id, postingKey: `opening:${a.id}`, lines: [
      { variantId: a.id, quantity: "10", unitCost: "2" },
      { variantId: b.id, quantity: "4", unitCost: "5" },
    ] };
    await postOpeningDocument(actor, opening);
    await postOpeningDocument(actor, opening);
    expect(await onHand(a.id, greenhouse.id)).toBe("10");
    expect(await onHand(b.id, greenhouse.id)).toBe("4");

    const transfer = { fromLocationId: greenhouse.id, toLocationId: sales.id, postingKey: `transfer:${a.id}`, lines: [
      { variantId: a.id, quantity: "3" },
      { variantId: b.id, quantity: "1" },
    ] };
    await transferDocument(actor, transfer);
    await transferDocument(actor, transfer);
    expect(await onHand(a.id, greenhouse.id)).toBe("7");
    expect(await onHand(a.id, sales.id)).toBe("3");
    expect(await onHand(b.id, sales.id)).toBe("1");

    await expect(transferDocument(actor, { ...transfer, postingKey: `bad:${a.id}`, toLocationId: greenhouse.id })).rejects.toThrow();
    await expect(postOpeningDocument(actor, { ...opening, postingKey: `empty:${a.id}`, lines: [] })).rejects.toThrow();

    const openingJournal = await listMovements(actor, { source: opening.postingKey });
    expect(openingJournal.total).toBe(2);
    expect(openingJournal.totals.incoming.toString()).toBe("14");
    expect(openingJournal.rows[0].source.label).toBe("საწყისი ნაშთი");

    const transferJournal = await listMovements(actor, { source: transfer.postingKey });
    expect(transferJournal.total).toBe(4);
    expect(transferJournal.totals.incoming.toString()).toBe("4");
    expect(transferJournal.totals.outgoing.toString()).toBe("4");
  });
});
