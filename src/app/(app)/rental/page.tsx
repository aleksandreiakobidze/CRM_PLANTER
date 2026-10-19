import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { createAssetAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function RentalPage() {
  const actor = await getActor();
  const [assets, bookings, variants] = await Promise.all([
    getDb().rentalAsset.findMany({ where: { organizationId: actor.organizationId }, include: { variant: true } }),
    getDb().rentalBooking.findMany({ where: { organizationId: actor.organizationId }, include: { customer: true }, orderBy: { startOn: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId } }),
  ]);
  return (
    <section className="grid">
      <div className="row">
        <h1>გაქირავება</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/rental">Excel</Link>
          <Link className="button" href="/rental/new">ჯავშანი</Link>
        </div>
      </div>
      <div className="card">
        <h2>ფონდში გადაყვანა</h2>
        <BoundForm action={createAssetAction} label="შექმნა">
          <label>ვარიანტი<ComboBox name="variantId" options={variants.map((variant) => ({ value: variant.id, label: variant.sku }))} /></label>
          <label>კოდი<input name="code" required /></label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="rental-assets"
        empty="გასაქირავებელი მცენარე ჯერ არ არის."
        columns={[{ key: "code", header: "კოდი" }, { key: "status", header: "სტატუსი" }, { key: "sku", header: "SKU" }]}
        rows={assets.map((asset) => ({ id: asset.id, cells: { code: asset.code, status: asset.status, sku: asset.variant.sku } }))}
      />
      <RecordList
        storageKey="rental-bookings"
        empty="ჯავშანი ჯერ არ არის."
        columns={[
          { key: "number", header: "ჯავშანი" },
          { key: "customer", header: "კლიენტი" },
          { key: "days", header: "დღეები" },
          { key: "total", header: "ჯამი" },
          { key: "deposit", header: "დეპოზიტი" },
        ]}
        rows={bookings.map((booking) => ({
          id: booking.id,
          cells: {
            number: <Link href={`/rental/${booking.id}`}>{booking.number}</Link>,
            customer: booking.customer.name,
            days: booking.billingDays,
            total: booking.total.toString(),
            deposit: booking.depositAmount.toString(),
          },
        }))}
      />
    </section>
  );
}
