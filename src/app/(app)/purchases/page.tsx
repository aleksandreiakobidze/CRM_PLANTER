import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { RecordList } from "@/components/record-list";
import { createSupplierAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D } from "@/server/money";

const STATUS: Record<string, string> = {
  draft: "დრაფტი",
  ordered: "გაგზავნილი",
  partial: "ნაწილობრივ მიღებული",
  received: "მიღებული",
};

export default async function PurchasesPage() {
  const actor = await getActor();
  const [orders, suppliers] = await Promise.all([
    getDb().purchaseOrder.findMany({
      where: { organizationId: actor.organizationId },
      include: { supplier: true, lines: true },
      orderBy: { createdAt: "desc" },
    }),
    getDb().supplier.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <section className="grid">
      <div className="row">
        <h1>შესყიდვები</h1>
        <div className="actions">
          <Link className="button" href="/purchases/new">ახალი PO</Link>
        </div>
      </div>
      <div className="card">
        <h2>მიმწოდებელი</h2>
        <BoundForm action={createSupplierAction} label="შენახვა">
          <label>სახელი<input name="name" required /></label>
          <label>ქვეყანა<input name="country" defaultValue="GE" /></label>
          <label>ვალუტა<input name="currency" defaultValue="GEL" /></label>
          <label>კონტაქტი<input name="contact" /></label>
        </BoundForm>
        {suppliers.length > 0 ? <p className="muted">{suppliers.map((item) => item.name).join(" · ")}</p> : null}
      </div>
      <RecordList
        storageKey="purchases"
        empty="შესყიდვა ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "supplier", header: "მიმწოდებელი" },
          { key: "status", header: "სტატუსი" },
          { key: "total", header: "ჯამი" },
        ]}
        rows={orders.map((order) => ({
          id: order.id,
          cells: {
            number: <Link href={`/purchases/${order.id}`}>{order.number}</Link>,
            supplier: order.supplier.name,
            status: STATUS[order.status] ?? order.status,
            total: order.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D("0")).toFixed(2),
          },
        }))}
      />
    </section>
  );
}
