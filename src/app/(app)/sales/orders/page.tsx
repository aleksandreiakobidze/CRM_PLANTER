import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { orderStatusLabel } from "@/server/labels";
import { D } from "@/server/money";

export default async function OrdersPage() {
  const actor = await getActor();
  const orders = await getDb().salesOrder.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="grid">
      <div className="row">
        <h1>შეკვეთები</h1>
        <div className="actions">
          <Link className="button" href="/sales/orders/new">ახალი შეკვეთა</Link>
        </div>
      </div>
      <RecordList
        storageKey="orders"
        empty="შეკვეთა ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "status", header: "სტატუსი" },
          { key: "total", header: "ჯამი" },
        ]}
        rows={orders.map((order) => ({
          id: order.id,
          cells: {
            number: <Link href={`/sales/orders/${order.id}`}>{order.number}</Link>,
            customer: order.customer.name,
            status: orderStatusLabel(order.status),
            total: `${order.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0)).toFixed(2)} ₾`,
          },
        }))}
      />
    </section>
  );
}
