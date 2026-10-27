import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { variantLabel } from "@/lib/variant-label";
import { updateDraftInvoiceAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const invoice = await getDb().invoice.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  if (!invoice) notFound();
  if (invoice.status !== "draft") redirect(`/finance/invoices/${invoice.id}`);
  const [customers, variants] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href={`/finance/invoices/${invoice.id}`}>დრაფტი ინვოისი</Link>
        <h1>ინვოისის რედაქტირება</h1>
        <p>დრაფტის შეცვლა შეიძლება გატარებამდე. გატარებული ინვოისი იკეტება.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={updateDraftInvoiceAction}
          label="შენახვა"
          mode="sale"
          partyName="customerId"
          partyLabel="კლიენტი"
          partyDefault={invoice.customerId}
          parties={customers.map(customerOption)}
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
          initialLines={invoice.lines.map((line) => ({
            kind: line.variantId ? "item" : "service",
            itemId: line.variantId ?? "",
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            discountAmount: line.discountAmount.toString(),
          }))}
          extra={
            <>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div className="docv-fields">
                <label>გადახდის ვადა<input name="dueOn" type="date" defaultValue={invoice.dueOn?.toISOString().slice(0, 10) ?? ""} /></label>
              </div>
            </>
          }
        />
      </div>
    </section>
  );
}
