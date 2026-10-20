import { getDb } from "@/server/db";

export type InvoiceSource = { href: string; label: string };

type InvoiceSourceInput = {
  id: string;
  sourceType: string;
  sourceId: string;
  order: { id: string; number: string } | null;
};

export async function loadInvoiceSources(organizationId: string, invoices: InvoiceSourceInput[]) {
  const rentalIds = [...new Set(invoices.filter((invoice) => invoice.sourceType === "rental").map((invoice) => invoice.sourceId))];
  const bookings = rentalIds.length === 0
    ? []
    : await getDb().rentalBooking.findMany({
        where: { organizationId, id: { in: rentalIds } },
        select: { id: true, number: true },
      });
  const rentals = new Map(bookings.map((booking) => [booking.id, booking]));
  const links = new Map<string, InvoiceSource>();
  for (const invoice of invoices) {
    if (invoice.sourceType === "sales_order" && invoice.order) {
      links.set(invoice.id, { href: `/sales/orders/${invoice.order.id}`, label: `შეკვეთა ${invoice.order.number}` });
    } else if (invoice.sourceType === "rental") {
      const booking = rentals.get(invoice.sourceId);
      if (booking) links.set(invoice.id, { href: `/rental/${booking.id}`, label: `ჯავშანი ${booking.number}` });
    }
  }
  return links;
}
