import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { RsFields } from "@/components/rs-fields";
import { retryInternalAction } from "@/server/actions/waybill-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { tbilisiDateString } from "@/server/time";

export default async function WaybillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const shipment = await getDb().internalShipment.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true, fromLocation: true, toLocation: true },
  });
  if (!shipment) notFound();
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/inventory/waybill">შიდა გადაზიდვა</Link>
        <h1>{shipment.number}</h1>
        <p>{shipment.fromLocation.nameKa} → {shipment.toLocation.nameKa}</p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>დასახელება</th><th>რაოდენობა</th></tr></thead>
          <tbody>
            {shipment.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{D(line.quantity).toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
        {shipment.rsWaybillNumber ? <p>RS ზედნადები: {shipment.rsWaybillNumber}</p> : null}
        {shipment.rsError ? <p className="err">{shipment.rsError}</p> : null}
      </div>
      {shipment.rsWaybillNumber ? null : (
        <div className="card">
          <h2>თავიდან ატვირთვა</h2>
          <BoundForm action={retryInternalAction} label="თავიდან ატვირთვა">
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <RsFields
              beginDefault={tbilisiDateString()}
              values={{
                driverTin: shipment.driverTin,
                driverName: shipment.driverName,
                carNumber: shipment.carNumber,
                transportText: shipment.transportText,
                startAddress: shipment.startAddress,
                endAddress: shipment.endAddress,
                beginOn: shipment.beginOn ? shipment.beginOn.toISOString().slice(0, 10) : "",
              }}
            />
          </BoundForm>
        </div>
      )}
    </section>
  );
}
