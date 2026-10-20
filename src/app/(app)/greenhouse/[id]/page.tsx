import Link from "next/link";
import { notFound } from "next/navigation";
import { advanceBatchAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

const STAGES = [
  ["received", "მიღებული"],
  ["growing", "იზრდება"],
  ["ready", "მზად არის"],
  ["closed", "დახურული"],
] as const;

export default async function GreenhouseBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const batch = await getDb().growthBatch.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { variant: true, location: true, supplier: true, tasks: true },
  });
  if (!batch) notFound();
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/greenhouse">სათბური</Link>
        <h1>{batch.number}</h1>
        <p>{batch.variant.sku} · {batch.location.nameKa} · {batch.quantity.toString()}</p>
      </div>
      <div className="card">
        <p>მიმწოდებელი: {batch.supplier?.name ?? "—"}</p>
        <p>მიღება: {formatDateOnly(batch.receivedOn)}</p>
        <p>მზადყოფნა: {batch.expectedReadyOn ? formatDateOnly(batch.expectedReadyOn) : "—"}</p>
        <p>ეტაპის შეცვლა ნაშთს არ ამრავლებს.</p>
        <div className="row">
          {STAGES.map(([code, label]) => (
            <form key={code} action={advanceBatchAction.bind(null, batch.id, code)}>
              <button className={batch.stage === code ? "" : "secondary"} type="submit">{label}</button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}
