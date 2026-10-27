import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { DocFacts, DocHeader, DocLines, DocSection, docDate, docMoney } from "@/components/doc-view";
import { PostingForm } from "@/components/posting-form";
import { landedCostAction, receivePurchaseAction, submitPurchaseAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { docStatus } from "@/server/labels";
import { D } from "@/server/money";

const LANDED_KIND: Record<string, string> = { estimated: "სავარაუდო", actual: "ფაქტობრივი", late: "დაგვიანებული" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const order = await getDb().purchaseOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      supplier: true,
      lines: { orderBy: { sort: "asc" }, include: { variant: { select: { internalCode: true, sku: true } } } },
      receipts: { orderBy: { createdAt: "desc" }, include: { location: true, lines: true } },
      landedCosts: { include: { allocations: true } },
    },
  });
  if (!order) notFound();
  const locations = await getDb().location.findMany({
    where: { organizationId: actor.organizationId, kind: { in: ["greenhouse", "warehouse"] } },
    orderBy: { code: "asc" },
  });
  const lines = order.lines.map((line) => ({ ...line, left: D(line.quantity).minus(line.receivedQty) }));
  const open = lines.filter((line) => line.left.gt(0));
  const total = order.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0));
  const ordered = order.lines.reduce((sum, line) => sum.plus(line.quantity), D(0));
  const received = order.lines.reduce((sum, line) => sum.plus(line.receivedQty), D(0));
  const landed = order.landedCosts
    .filter((cost) => cost.kind !== "estimated")
    .reduce((sum, cost) => sum.plus(D(cost.amount).mul(cost.fxRate)), D(0));
  const receiving = order.status === "ordered" || order.status === "partial";

  return (
    <section className="grid doc">
      <DocHeader
        back={{ href: "/purchases", label: "შესყიდვები" }}
        title={order.number}
        status={docStatus("purchase", order.status)}
        subtitle={order.supplier.name}
        actions={
          order.status === "draft" ? (
            <>
              <Link className="button secondary" href={`/purchases/${order.id}/edit`}>რედაქტირება</Link>
              <form action={submitPurchaseAction.bind(null, order.id)}><button type="submit">მიმწოდებელთან გაგზავნა</button></form>
            </>
          ) : null
        }
      />
      <DocFacts
        items={[
          { label: "მიმწოდებელი", value: order.supplier.name },
          { label: "შექმნის თარიღი", value: docDate(order.createdAt, true) },
          { label: "მოსალოდნელი", value: docDate(order.expectedOn) },
          { label: "მიღებულია", value: `${received.toFixed(3)} / ${ordered.toFixed(3)}` },
          { label: "ჯამი", value: docMoney(total, order.currency) },
          { label: "შენიშვნა", value: order.notes || "—" },
        ]}
      />
      <DocLines
        title="ხაზები"
        columns={[
          { key: "item", header: "აითემი" },
          { key: "qty", header: "შეკვეთილი", align: "right" },
          { key: "received", header: "მიღებული", align: "right" },
          { key: "price", header: "ერთ. ღირებულება", align: "right" },
          { key: "total", header: "ჯამი", align: "right" },
        ]}
        rows={lines.map((line) => ({
          id: line.id,
          cells: {
            item: (
              <>
                {line.description}
                <span className="docv-code">{line.variant.internalCode ?? line.variant.sku}</span>
              </>
            ),
            qty: line.quantity.toString(),
            received: line.receivedQty.toString(),
            price: docMoney(line.unitPrice, order.currency),
            total: docMoney(line.lineTotal, order.currency),
          },
        }))}
        totals={[
          ...(landed.gt(0) ? [{ label: "დამატებითი ხარჯი", value: docMoney(landed) }] : []),
          { label: "ჯამი", value: docMoney(total, order.currency), strong: true },
        ]}
      />
      {receiving && open.length > 0 ? (
        <DocSection title="მიღება საწყობში">
          <PostingForm
            action={receivePurchaseAction}
            label="მიღების გატარება"
            summary={[{ label: "შესყიდვა", value: `${order.number} · ${order.supplier.name}` }]}
            pickLabels={{ locationId: "ლოკაცია" }}
          >
            <input type="hidden" name="purchaseOrderId" value={order.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ლოკაცია
              <ComboBox name="locationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} />
            </label>
            <table className="docv-table">
              <thead><tr><th>აითემი</th><th className="num">დარჩენილი</th><th className="num">მისაღები</th></tr></thead>
              <tbody>
                {open.map((line) => (
                  <tr key={line.id}>
                    <td data-label="აითემი">{line.description}</td>
                    <td className="num" data-label="დარჩენილი">{line.left.toString()}</td>
                    <td className="num" data-label="მისაღები">
                      <input type="hidden" name="purchaseLineId" value={line.id} />
                      <input name="quantity" aria-label={`მისაღები: ${line.description}`} defaultValue={line.left.toString()} inputMode="decimal" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">ნული ან ცარიელი ველი ამ ხაზს არ მიიღებს. გატარება ზრდის ნაშთს და თვითღირებულებას.</p>
          </PostingForm>
        </DocSection>
      ) : null}
      <div className="docv-grid">
        <DocSection title="მიღებები">
          {order.receipts.length === 0 ? <p className="muted">მიღება ჯერ არ გატარებულა.</p> : (
            <table className="docv-table">
              <thead><tr><th>ნომერი</th><th>თარიღი</th><th>ლოკაცია</th><th className="num">რაოდენობა</th></tr></thead>
              <tbody>
                {order.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td data-label="ნომერი">{receipt.number}</td>
                    <td data-label="თარიღი">{docDate(receipt.receivedOn)}</td>
                    <td data-label="ლოკაცია">{receipt.location.nameKa}</td>
                    <td className="num" data-label="რაოდენობა">{receipt.lines.reduce((sum, line) => sum.plus(line.quantity), D(0)).toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DocSection>
        <DocSection title="დამატებითი ხარჯი (landed cost)">
          {order.landedCosts.map((cost) => (
            <p key={cost.id}>
              {LANDED_KIND[cost.kind] ?? cost.kind}: {docMoney(cost.amount, cost.currency)} · განაწილდა {docMoney(cost.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D("0")))}
            </p>
          ))}
          <p className="muted">სავარაუდო ხარჯი ნაშთს არ ცვლის. ფაქტობრივი და დაგვიანებული ხარჯი განაწილდება ღირებულებით.</p>
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
            <div className="docv-fields">
              <label>თანხა<input name="amount" required /></label>
              <label>ვალუტა<input name="currency" defaultValue={order.currency} /></label>
              <label>კურსი<input name="fxRate" defaultValue="1" /></label>
            </div>
            <label>შენიშვნა<input name="note" /></label>
          </BoundForm>
        </DocSection>
      </div>
    </section>
  );
}
