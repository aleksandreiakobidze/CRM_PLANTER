import { can, canSeeSalesTotals, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { D, roundMoney } from "@/server/money";
import { parseDateOnly } from "@/server/time";
import { Groups, monthLabel, monthOf, percent, reportPeriod } from "@/server/features/reports/report-kit";

export type PurchaseReportFilters = { from?: string; to?: string; supplierId?: string; status?: string; variantId?: string };

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  draft: "დრაფტი",
  ordered: "გაგზავნილი",
  partial: "ნაწილობრივ მიღებული",
  received: "მიღებული",
  cancelled: "გაუქმებული",
};

export async function purchaseReport(actor: Actor, filters: PurchaseReportFilters) {
  requirePermission(actor, "reports.read");
  const showMoney = canSeeSalesTotals(actor) || can(actor, "stock.cost.read");
  const period = reportPeriod(filters);
  const orgId = actor.organizationId;
  const db = getDb();
  const status = filters.status && PURCHASE_STATUS_LABEL[filters.status] ? filters.status : undefined;
  const lineFilter = filters.variantId ? { variantId: filters.variantId } : {};

  const [orders, receipts, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: period.start, lt: period.end },
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(status ? { status } : { status: { not: "cancelled" } }),
        ...(filters.variantId ? { lines: { some: lineFilter } } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        lines: { where: lineFilter, include: { variant: { select: { id: true, nameKa: true, internalCode: true, sku: true } } } },
        landedCosts: { select: { amount: true, fxRate: true } },
      },
      orderBy: [{ createdAt: "asc" }, { number: "asc" }],
    }),
    db.goodsReceipt.findMany({
      where: {
        organizationId: orgId,
        receivedOn: { gte: parseDateOnly(period.from), lte: parseDateOnly(period.to) },
        ...(filters.supplierId ? { purchaseOrder: { supplierId: filters.supplierId } } : {}),
      },
      include: { lines: { where: filters.variantId ? { purchaseLine: lineFilter } : {}, select: { quantity: true, unitCost: true } } },
    }),
    db.supplier.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const bySupplier = new Groups();
  const byProduct = new Groups();
  const byMonth = new Groups();
  let ordered = D(0);
  let received = D(0);
  let outstanding = D(0);
  let landed = D(0);
  let orderedQty = D(0);
  let receivedQty = D(0);
  const outstandingLines: {
    id: string;
    orderId: string;
    number: string;
    supplier: string;
    expectedOn: Date | null;
    code: string;
    name: string;
    quantity: ReturnType<typeof D>;
    receivedQty: ReturnType<typeof D>;
    open: ReturnType<typeof D>;
    value: ReturnType<typeof D> | null;
  }[] = [];

  const rows = orders.map((order) => {
    let orderValue = D(0);
    let orderReceived = D(0);
    let orderOpen = D(0);
    let qty = D(0);
    let got = D(0);
    for (const line of order.lines) {
      const value = D(line.lineTotal);
      const done = D(line.receivedQty);
      const open = D(line.quantity).minus(done);
      const openPositive = open.gt(0) ? open : D(0);
      const receivedValue = done.mul(line.unitPrice);
      orderValue = orderValue.plus(value);
      orderReceived = orderReceived.plus(receivedValue);
      orderOpen = orderOpen.plus(openPositive.mul(line.unitPrice));
      qty = qty.plus(line.quantity);
      got = got.plus(done);
      byProduct.add(line.variant.id, `${line.variant.internalCode ?? line.variant.sku} · ${line.variant.nameKa}`, { quantity: line.quantity, amount: value });
      if (openPositive.gt(0) && order.status !== "draft") {
        outstandingLines.push({
          id: line.id,
          orderId: order.id,
          number: order.number,
          supplier: order.supplier.name,
          expectedOn: order.expectedOn,
          code: line.variant.internalCode ?? line.variant.sku,
          name: line.variant.nameKa,
          quantity: D(line.quantity),
          receivedQty: done,
          open: openPositive,
          value: showMoney ? roundMoney(openPositive.mul(line.unitPrice)) : null,
        });
      }
    }
    const orderLanded = order.landedCosts.reduce((sum, cost) => sum.plus(D(cost.amount).mul(cost.fxRate)), D(0));
    ordered = ordered.plus(orderValue);
    received = received.plus(orderReceived);
    outstanding = outstanding.plus(orderOpen);
    landed = landed.plus(orderLanded);
    orderedQty = orderedQty.plus(qty);
    receivedQty = receivedQty.plus(got);
    bySupplier.add(order.supplier.id, order.supplier.name, { quantity: qty, amount: orderValue });
    const month = monthOf(order.createdAt);
    byMonth.add(month, monthLabel(month), { quantity: qty, amount: orderValue });
    return {
      id: order.id,
      number: order.number,
      createdAt: order.createdAt,
      expectedOn: order.expectedOn,
      supplierId: order.supplier.id,
      supplier: order.supplier.name,
      status: order.status,
      statusLabel: PURCHASE_STATUS_LABEL[order.status] ?? order.status,
      lines: order.lines.length,
      quantity: qty,
      receivedQty: got,
      progress: percent(got, qty) ?? 0,
      ordered: showMoney ? roundMoney(orderValue) : null,
      received: showMoney ? roundMoney(orderReceived) : null,
      outstanding: showMoney ? roundMoney(orderOpen) : null,
      landed: showMoney ? roundMoney(orderLanded) : null,
    };
  });
  outstandingLines.sort((a, b) => (a.expectedOn?.getTime() ?? Infinity) - (b.expectedOn?.getTime() ?? Infinity) || a.number.localeCompare(b.number));

  const receiptValue = receipts.reduce((sum, receipt) => sum.plus(receipt.lines.reduce((inner, line) => inner.plus(D(line.quantity).mul(line.unitCost)), D(0))), D(0));
  const hide = <T extends { amount: unknown }>(items: T[]) => (showMoney ? items : items.map((item) => ({ ...item, amount: D(0) })));
  return {
    period,
    showMoney,
    totals: {
      orders: orders.length,
      suppliers: new Set(orders.map((order) => order.supplierId)).size,
      orderedQty,
      receivedQty,
      fulfilment: percent(receivedQty, orderedQty),
      ordered: showMoney ? roundMoney(ordered) : null,
      received: showMoney ? roundMoney(received) : null,
      outstanding: showMoney ? roundMoney(outstanding) : null,
      landed: showMoney ? roundMoney(landed) : null,
      landedShare: showMoney ? percent(landed, ordered) : null,
      receipts: receipts.length,
      receiptValue: showMoney ? roundMoney(receiptValue) : null,
      openLines: outstandingLines.length,
    },
    breakdowns: {
      suppliers: hide(bySupplier.sorted(showMoney ? "amount" : "quantity")),
      products: hide(byProduct.sorted(showMoney ? "amount" : "quantity")),
      months: hide(byMonth.sorted("key")),
    },
    rows,
    outstandingLines,
    options: { suppliers: suppliers.map((item) => ({ value: item.id, label: item.name })) },
  };
}

export type PurchaseReport = Awaited<ReturnType<typeof purchaseReport>>;
