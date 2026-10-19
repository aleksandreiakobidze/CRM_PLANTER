import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { listBalances } from "@/server/features/inventory/stock-service";

export default async function InventoryPage() {
  const actor = await getActor();
  const canRead = actor.permissions.has("stock.read");
  const rows = canRead ? await listBalances(actor) : [];
  return (
    <section className="grid">
      <div className="row">
        <h1>მარაგები</h1>
        <div className="actions">
          {canRead ? <Link className="button secondary" href="/export/inventory">Excel</Link> : null}
          <Link className="button" href="/inventory/opening">ნაშთის შეტანა</Link>
        </div>
      </div>
      <RecordList
        storageKey="inventory"
        empty="ნაშთი ჯერ არ არის."
        columns={[
          { key: "sku", header: "SKU" },
          { key: "location", header: "ლოკაცია" },
          { key: "onHand", header: "on hand" },
          { key: "reserved", header: "reserved" },
          { key: "sellable", header: "sellable" },
          { key: "cost", header: "თვითღირებულება" },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            sku: row.sku,
            location: row.location,
            onHand: row.onHand,
            reserved: row.reserved,
            sellable: row.sellable,
            cost: row.unitCost ?? "—",
          },
        }))}
      />
    </section>
  );
}
