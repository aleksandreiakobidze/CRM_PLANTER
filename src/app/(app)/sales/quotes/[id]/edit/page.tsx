import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { variantLabel } from "@/lib/variant-label";
import { updateQuoteAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { isLineKind } from "@/server/features/sales/line-kinds";
import { QUOTE_EDITABLE } from "@/server/features/sales/order-service";

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const quote = await getDb().quote.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  if (!quote) notFound();
  if (!QUOTE_EDITABLE.has(quote.status)) redirect(`/sales/quotes/${quote.id}`);
  const [customers, variants] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href={`/sales/quotes/${quote.id}`}>{quote.number}</Link>
        <h1>შეთავაზების რედაქტირება</h1>
        <p>შეიძლება შეიცვალოს მიღებამდე ან უარყოფამდე. ჯამები თავიდან დაითვლება.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={updateQuoteAction}
          label="შენახვა"
          mode="sale"
          partyName="customerId"
          partyLabel="კლიენტი"
          partyDefault={quote.customerId}
          parties={customers.map(customerOption)}
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
          initialLines={quote.lines.map((line) => ({
            kind: isLineKind(line.kind) ? line.kind : "item",
            itemId: line.variantId ?? "",
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discountAmount: line.discountAmount.toString(),
          }))}
          extra={
            <>
              <input type="hidden" name="quoteId" value={quote.id} />
              <div className="docv-fields">
                <label>მოქმედების ვადა<input name="validUntil" type="date" defaultValue={quote.validUntil?.toISOString().slice(0, 10) ?? ""} /></label>
                <label>შენიშვნა<input name="notes" defaultValue={quote.notes ?? ""} /></label>
              </div>
            </>
          }
        />
      </div>
    </section>
  );
}
