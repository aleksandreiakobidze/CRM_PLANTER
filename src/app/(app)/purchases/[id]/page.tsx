import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { landedCostAction, receivePurchaseAction, submitPurchaseAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D } from "@/server/money";

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const order = await getDb().purchaseOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { supplier: true, lines: true, receipts: true, landedCosts: { include: { allocations: true } } },
  });
  if (!order) notFound();
  const locations = await getDb().location.findMany({
    where: { organizationId: actor.organizationId, kind: { in: ["greenhouse", "warehouse"] } },
    orderBy: { code: "asc" },
  });
  const remaining = order.lines.map((line) => ({
    ...line,
    left: D(line.quantity).minus(line.receivedQty),
  }));
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/purchases">შესყიდვები</Link>
        <h1>{order.number}</h1>
        <p>{order.supplier.name} · {order.status}</p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ვარიანტი</th><th>შეკვეთილი</th><th>მიღებული</th><th>ჯამი</th></tr></thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>{line.quantity.toString()}</td>
                <td>{line.receivedQty.toString()}</td>
                <td>{line.lineTotal.toString()} {order.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.status === "draft" ? (
        <form action={submitPurchaseAction.bind(null, order.id)}><button type="submit">გაგზავნა</button></form>
      ) : null}
      {order.status === "ordered" || order.status === "partial" ? (
        <div className="card">
          <h2>მიღება</h2>
          <BoundForm action={receivePurchaseAction} label="მიღება">
            <input type="hidden" name="purchaseOrderId" value={order.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ხაზი
              <ComboBox
                name="purchaseLineId"
                options={remaining.filter((line) => line.left.gt(0)).map((line) => ({
                  value: line.id,
                  label: `${line.description} · დარჩა ${line.left.toFixed(3)}`,
                }))}
              />
            </label>
            <label>ლოკაცია
              <ComboBox name="locationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} />
            </label>
            <label>რაოდენობა<input name="quantity" required /></label>
          </BoundForm>
        </div>
      ) : null}
      <div className="card">
        <h2>Landed cost</h2>
        <p>სავარაუდო ხარჯი ნაშთს არ ცვლის. ფაქტობრივი და დაგვიანებული ხარჯი განაწილდება ღირებულებით.</p>
        <BoundForm action={landedCostAction} label="დაფიქსირება">
          <input type="hidden" name="purchaseOrderId" value={order.id} />
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>ტიპი
            <ComboBox
              name="kind"
              options={[
                { value: "estimated", label: "სავარაუდო" },
                { value: "actual", label: "ფაქტობრივი" },
                { value: "late", label: "დაგვიანებული" },
              ]}
            />
          </label>
          <label>თანხა<input name="amount" required /></label>
          <label>ვალუტა<input name="currency" defaultValue={order.currency} /></label>
          <label>კურსი<input name="fxRate" defaultValue="1" /></label>
          <label>შენიშვნა<input name="note" /></label>
        </BoundForm>
        {order.landedCosts.map((cost) => (
          <p key={cost.id}>{cost.kind}: {cost.amount.toString()} {cost.currency} · განაწილება {cost.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D("0")).toFixed(2)}</p>
        ))}
      </div>
      {order.receipts.length > 0 ? (
        <div className="card">
          <h2>მიღებები</h2>
          <ul>{order.receipts.map((receipt) => <li key={receipt.id}>{receipt.number}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
