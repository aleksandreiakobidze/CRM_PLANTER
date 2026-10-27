import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { variantLabel } from "@/lib/variant-label";
import { updatePurchaseOrderAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const order = await getDb().purchaseOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  if (!order) notFound();
  if (order.status !== "draft") redirect(`/purchases/${order.id}`);
  const [suppliers, variants] = await Promise.all([
    getDb().supplier.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href={`/purchases/${order.id}`}>{order.number}</Link>
        <h1>შესყიდვის რედაქტირება</h1>
        <p>რედაქტირება შესაძლებელია მხოლოდ გაგზავნამდე.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={updatePurchaseOrderAction}
          label="შენახვა"
          mode="purchase"
          partyName="supplierId"
          partyLabel="მიმწოდებელი"
          partyDefault={order.supplierId}
          parties={suppliers.map((item) => ({ value: item.id, label: item.name }))}
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.unitCost.toString() }))}
          initialLines={order.lines.map((line) => ({
            kind: "item",
            itemId: line.variantId,
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discountAmount: "0",
          }))}
          extra={
            <>
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <div className="docv-fields">
                <label>მოსალოდნელი თარიღი<input name="expectedOn" type="date" defaultValue={order.expectedOn?.toISOString().slice(0, 10) ?? ""} /></label>
                <label>შენიშვნა<input name="notes" defaultValue={order.notes ?? ""} /></label>
              </div>
            </>
          }
        />
      </div>
    </section>
  );
}
