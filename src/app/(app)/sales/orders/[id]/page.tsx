import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { DocTabs } from "@/components/doc-tabs";
import { DocFacts, DocHeader, DocLines, docDate, docMoney } from "@/components/doc-view";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { variantLabel } from "@/lib/variant-label";
import { RsFields } from "@/components/rs-fields";
import { creditNoteAction, returnGoodsAction } from "@/server/actions/ops-actions";
import { cancelOrderAction, confirmOrderAction, invoiceOrderAction } from "@/server/actions/work-actions";
import { completeSaleAction, retrySaleAction, updateOpenOrderAction } from "@/server/actions/waybill-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { docStatus } from "@/server/labels";
import { isLineKind, isStockLine, LINE_KIND_LABEL } from "@/server/features/sales/line-kinds";
import { D } from "@/server/money";
import { formatDateOnly, tbilisiDateString } from "@/server/time";

function dateOnly(value: Date | null): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getActor();
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const [order, organization, customers, variants] = await Promise.all([
    getDb().salesOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { lines: true, customer: true, invoices: true, fulfillments: { orderBy: { fulfilledAt: "desc" }, take: 1 } },
    }),
    getDb().organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  if (!order) notFound();
  const variantIds = order.lines.map((line) => line.variantId).filter((value): value is string => Boolean(value));
  const codeOf = new Map(
    variants.filter((variant) => variantIds.includes(variant.id)).map((variant) => [variant.id, variant.internalCode ?? variant.sku]),
  );
  const fulfillment = order.fulfillments[0];
  const issued = order.status === "completed" || order.status === "rs_error" || order.status === "fulfilled";
  const open = order.status === "open" || order.status === "draft";
  const authorized = order.status === "authorized" || order.status === "confirmed";
  const total = order.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0));
  const base = `/sales/orders/${order.id}`;
  const tabs = [
    { id: "order", label: "შეკვეთა", href: base },
    { id: "delivery", label: "მიწოდება", href: `${base}?tab=delivery` },
    ...(issued ? [{ id: "return", label: "დაბრუნება", href: `${base}?tab=return` }] : []),
  ];
  const tab = tabs.some((item) => item.id === requested) ? requested! : "order";
  const rsValues = {
    waybillType: fulfillment?.waybillType ?? 2,
    driverTin: fulfillment?.driverTin,
    driverName: fulfillment?.driverName,
    carNumber: fulfillment?.carNumber,
    transportText: fulfillment?.transportText,
    startAddress: fulfillment?.startAddress || organization.address || "",
    endAddress: fulfillment?.endAddress || "",
    beginOn: dateOnly(fulfillment?.beginOn ?? null),
  };
  return (
    <section className="grid doc">
      <DocHeader
        back={{ href: "/sales/orders", label: "შეკვეთები" }}
        title={order.number}
        status={docStatus("order", order.status)}
        subtitle={<Link href={`/crm/customers/${order.customerId}`}>{order.customer.name}</Link>}
        actions={<p className="doc-total">{docMoney(total, order.currency)}</p>}
      />
      {!open ? <p className="docv-locked">{issued ? "მარაგი ჩამოწერილია — შეკვეთა დაკეტილია." : "ავტორიზებული შეკვეთის ხაზები აღარ იცვლება."}</p> : null}
      <DocTabs label="დოკუმენტის ტაბები" tabs={tabs} current={tab} />
      {tab === "order" ? (
        <div className="card doc-card">
          {open ? (
            <HeaderLinesForm
              action={updateOpenOrderAction}
              label="შენახვა"
              mode="sale"
              partyName="customerId"
              partyLabel="კლიენტი"
              partyDefault={order.customerId}
              parties={customers.map(customerOption)}
              items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
              initialLines={order.lines.map((line) => ({
                kind: isLineKind(line.kind) ? line.kind : "item",
                itemId: line.variantId ?? "",
                description: line.description,
                quantity: line.quantity.toString(),
                unitPrice: line.unitPrice.toString(),
                discountAmount: line.discountAmount.toString(),
              }))}
              extra={
                <>
                  <input type="hidden" name="orderId" value={order.id} />
                  <label>თარიღი<input name="orderedOn" type="date" required defaultValue={formatDateOnly(order.orderedOn)} /></label>
                  <label>შენიშვნა<textarea name="notes" defaultValue={order.notes ?? ""} /></label>
                </>
              }
            />
          ) : (
            <div className="grid">
              <DocFacts
                items={[
                  { label: "თარიღი", value: docDate(order.orderedOn) },
                  { label: "ხაზები", value: String(order.lines.length) },
                  { label: "შენიშვნა", value: order.notes || "—" },
                ]}
              />
              <DocLines
                columns={[
                  { key: "item", header: "დასახელება" },
                  { key: "qty", header: "რაოდენობა", align: "right" },
                  { key: "price", header: "ფასი", align: "right" },
                  { key: "discount", header: "ფასდაკლება", align: "right" },
                  { key: "total", header: "ჯამი", align: "right" },
                ]}
                rows={order.lines.map((line) => ({
                  id: line.id,
                  cells: {
                    item: (
                      <>
                        {line.description}
                        <span className="docv-code">
                          {line.variantId ? codeOf.get(line.variantId) : isLineKind(line.kind) ? LINE_KIND_LABEL[line.kind] : line.kind}
                        </span>
                      </>
                    ),
                    qty: line.quantity.toString(),
                    price: docMoney(line.unitPrice, order.currency),
                    discount: D(line.discountAmount).gt(0) ? docMoney(line.discountAmount, order.currency) : "—",
                    total: docMoney(line.lineTotal, order.currency),
                  },
                }))}
                totals={[{ label: "ჯამი", value: docMoney(total, order.currency), strong: true }]}
              />
            </div>
          )}
          <div className="doc-actions">
            {open ? <form action={confirmOrderAction.bind(null, order.id)}><button type="submit">ავტორიზება</button></form> : null}
            {open || authorized ? (
              <form action={cancelOrderAction.bind(null, order.id)}><button className="secondary" type="submit">გაუქმება</button></form>
            ) : null}
            {issued && order.invoices.length === 0 ? <form action={invoiceOrderAction.bind(null, order.id)}><button type="submit">ინვოისის შექმნა</button></form> : null}
            {order.invoices[0] ? <a className="button" href={`/finance/invoices/${order.invoices[0].id}`}>ინვოისი</a> : null}
          </div>
        </div>
      ) : null}
      {tab === "delivery" ? (
        <div className="card doc-card">
          <h2 className="doc-title">მიწოდება</h2>
          {open ? <p>მიწოდების ველები ავტორიზების შემდეგ ივსება. მანამდე მარაგი არ იძვრის.</p> : null}
          {authorized ? (
            <>
              <p>დასრულება მარაგს ერთხელ ჩამოწერს და ზედნადებს RS.ge-ზე ტვირთავს. ინვოისი იქმნება მხოლოდ ზედნადების ნომრის შემდეგ, თუ ჩეკბოქსი ჩართულია.</p>
              <BoundForm action={completeSaleAction} label="დასრულება">
                <input type="hidden" name="orderId" value={order.id} />
                <RsFields values={rsValues} beginDefault={tbilisiDateString()} saleType invoiceDefault={organization.autoInvoiceAfterWaybill} />
              </BoundForm>
            </>
          ) : null}
          {order.status === "rs_error" && fulfillment ? (
            <>
              {fulfillment.rsError ? <p className="err">{fulfillment.rsError}</p> : null}
              <p>მარაგი უკვე ჩამოწერილია. ეს ღილაკი მხოლოდ RS-ს იმეორებს.</p>
              <BoundForm action={retrySaleAction} label="თავიდან ატვირთვა">
                <input type="hidden" name="orderId" value={order.id} />
                <RsFields values={rsValues} beginDefault={tbilisiDateString()} saleType invoiceDefault={organization.autoInvoiceAfterWaybill} />
              </BoundForm>
            </>
          ) : null}
          {order.status === "cancelled" ? <p>გაუქმებული შეკვეთა აღარ მიეწოდება.</p> : null}
          {order.status === "completed" || order.status === "fulfilled" ? (
            <div className="fact-row">
              <p><small>RS ზედნადები</small>{fulfillment?.rsWaybillNumber || "—"}</p>
              <p><small>მძღოლი</small>{fulfillment?.driverName || "—"}</p>
              <p><small>მანქანა</small>{fulfillment?.carNumber || "—"}</p>
              <p><small>საიდან</small>{fulfillment?.startAddress || "—"}</p>
              <p><small>სად</small>{fulfillment?.endAddress || "—"}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === "return" && issued ? (
        <div className="card doc-card">
          <h2 className="doc-title">დაბრუნება</h2>
          <p>რაოდენობა არ უნდა აღემატებოდეს მიწოდებულს. დაზიანებული საკარანტინოში მიდის.</p>
          <BoundForm action={returnGoodsAction} label="დაბრუნება">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ხაზი
              <ComboBox
                name="orderLineId"
                options={order.lines.filter((line) => isStockLine(line.kind) && line.variantId).map((line) => ({
                  value: line.id,
                  label: `${line.description} · დარჩა ${D(line.fulfilledQty).minus(line.returnedQty).toFixed(3)}`,
                }))}
              />
            </label>
            <label>რაოდენობა<input name="quantity" required /></label>
            <label>მდგომარეობა
              <ComboBox name="condition" options={[{ value: "healthy", label: "ჯანმრთელი" }, { value: "damaged", label: "დაზიანებული" }]} />
            </label>
            <label>მიზეზი<input name="reason" required /></label>
          </BoundForm>
          <BoundForm action={creditNoteAction} label="კრედიტ-ნოტა">
            <input type="hidden" name="customerId" value={order.customerId} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>თანხა<input name="amount" required /></label>
            <label>აღწერა<input name="description" defaultValue={`${order.number} კრედიტი`} /></label>
          </BoundForm>
        </div>
      ) : null}
    </section>
  );
}
