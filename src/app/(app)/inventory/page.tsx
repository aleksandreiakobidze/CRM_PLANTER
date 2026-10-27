import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { listBalances } from "@/server/features/inventory/stock-service";

export default async function InventoryPage() {
  const actor = await getActor();
  const canRead = actor.permissions.has("stock.read");
  const rows = canRead ? await listBalances(actor) : [];
  const damaged = rows.filter((row) => row.locationKind === "quarantine");
  const low = rows.filter((row) => Number(row.available) > 0 && Number(row.available) < 1);
  return (
    <section className="grid">
      <div className="row">
        <h1>მარაგები</h1>
        <div className="actions">
          {canRead ? <Link className="button secondary" href="/export/inventory">Excel</Link> : null}
          <Link className="button secondary" href="/inventory/movements">მოძრაობა</Link>
          <Link className="button secondary" href="/inventory/count">ინვენტარიზაცია</Link>
          <Link className="button secondary" href="/inventory/transfer">გადატანა</Link>
          <Link className="button secondary" href="/inventory/waybill">შიდა გადაზიდვა</Link>
          <Link className="button" href="/inventory/opening">ნაშთის შეტანა</Link>
        </div>
      </div>
      {damaged.length > 0 ? <p className="card">დაზიანებული / საკარანტინო: {damaged.length} ჩანაწერი.</p> : null}
      {low.length > 0 ? <p className="card">დაბალი ნაშთი: {low.map((row) => row.sku).join(", ")}</p> : null}
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
