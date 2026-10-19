import { notFound } from "next/navigation";
import { publicCare } from "@/server/features/catalog/catalog-service";

export default async function CarePage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const care = await publicCare(decodeURIComponent(sku));
  if (!care) notFound();
  return (
    <main className="auth">
      <section className="auth-card card">
        <img className="auth-logo" src="/brand/planter-logo.png" alt="Planter" />
        <div className="page-head">
          <h1>{care.name}</h1>
          <p>SKU: {care.sku}</p>
        </div>
        <div className="fact-row">
          {care.species ? <p><small>სახეობა</small>{care.species}</p> : null}
          <p><small>სინათლე</small>{care.light || "მოვლის ინსტრუქცია ჯერ არ არის შევსებული"}</p>
          <p><small>მორწყვა</small>{care.water || "—"}</p>
          <p><small>ტენიანობა</small>{care.humidity || "—"}</p>
        </div>
        {care.careNotes ? <p className="note">{care.careNotes}</p> : null}
        {care.videoUrl ? <p><a className="button secondary" href={care.videoUrl}>ვიდეო</a></p> : null}
      </section>
    </main>
  );
}
