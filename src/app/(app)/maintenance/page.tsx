import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { contractFee } from "@/server/features/maintenance/maintenance-service";
import { statusBadge } from "@/server/labels";

export default async function MaintenancePage() {
  const actor = await getActor();
  const contracts = await getDb().maintenanceContract.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true },
    orderBy: { number: "desc" },
  });
  const fees = await Promise.all(contracts.map(async (contract) => ({ id: contract.id, fee: await contractFee(contract.id) })));
  return (
    <section className="grid">
      <div className="row">
        <h1>მოვლა</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/maintenance">Excel</Link>
          <Link className="button" href="/maintenance/new">ხელშეკრულება</Link>
        </div>
      </div>
      <RecordList
        storageKey="maintenance"
        empty="ხელშეკრულება ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "status", header: "სტატუსი" },
          { key: "fee", header: "თვიური" },
        ]}
        rows={contracts.map((contract) => {
          const badge = statusBadge(contract.status);
          return {
            id: contract.id,
            cells: {
              number: <Link href={`/maintenance/${contract.id}`}>{contract.number}</Link>,
              customer: contract.customer.name,
              status: <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>,
              fee: `${fees.find((fee) => fee.id === contract.id)?.fee.fee} ₾`,
            },
          };
        })}
      />
    </section>
  );
}
