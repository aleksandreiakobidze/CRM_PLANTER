import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { postCountAction, saveCountAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function InventoryCountPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const count = await getDb().inventoryCount.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { location: true, lines: { include: { variant: true } } },
  });
  if (!count) notFound();
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/inventory/count">ინვენტარიზაცია</Link>
        <h1>{count.number}</h1>
        <p>{count.location.nameKa} · {count.status === "posted" ? "დამტკიცებული" : "დრაფტი"}</p>
      </div>
      {count.status === "draft" ? (
        <div className="card">
          <BoundForm action={saveCountAction} label="ფაქტის შენახვა">
            <input type="hidden" name="countId" value={count.id} />
            {count.lines.map((line) => (
              <label key={line.id}>
                {line.variant.sku} · სისტემა {line.systemQty.toString()}
                <input type="hidden" name="lineId" value={line.id} />
                <input name="countedQty" defaultValue={line.countedQty.toString()} />
              </label>
            ))}
          </BoundForm>
          <form action={postCountAction.bind(null, count.id)}>
            <button type="submit">დამტკიცება</button>
          </form>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>SKU</th><th>სისტემა</th><th>ფაქტი</th><th>სხვაობა</th></tr></thead>
            <tbody>
              {count.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.variant.sku}</td>
                  <td>{line.systemQty.toString()}</td>
                  <td>{line.countedQty.toString()}</td>
                  <td>{line.difference.toString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
