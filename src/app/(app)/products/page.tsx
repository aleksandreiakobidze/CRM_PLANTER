import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; created?: string }> }) {
  const actor = await getActor();
  const params = await searchParams;
  const variants = await getDb().productVariant.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: params.q ? [{ sku: { contains: params.q, mode: "insensitive" } }, { nameKa: { contains: params.q, mode: "insensitive" } }] : undefined,
    },
    include: { product: true },
    orderBy: { sku: "asc" },
  });
  return (
    <section className="grid">
      <div className="row">
        <h1>პროდუქტები</h1>
        <div className="actions">
          <Link className="button secondary" href={params.q?.trim() ? `/export/products?q=${encodeURIComponent(params.q.trim())}` : "/export/products"}>Excel</Link>
          <Link className="button" href="/products/new">ახალი პროდუქტი</Link>
        </div>
      </div>
      <form className="row" role="search">
        <label>ძებნა
          <input name="q" defaultValue={params.q ?? ""} placeholder="SKU ან დასახელება" />
        </label>
        <button type="submit">ჩვენება</button>
      </form>
      {params.created ? <p className="ok">შეიქმნა {params.created}</p> : null}
      <RecordList
        storageKey="products"
        empty="პროდუქტი ჯერ არ არის."
        columns={[
          { key: "sku", header: "SKU" },
          { key: "name", header: "სახელი" },
          { key: "price", header: "ფასი" },
          { key: "care", header: "მოვლა" },
        ]}
        rows={variants.map((variant) => ({
          id: variant.id,
          cells: {
            sku: variant.sku,
            name: variant.nameKa,
            price: `${variant.listPrice.toString()} ₾`,
            care: <Link href={`/care/${variant.sku}`}>საჯარო გვერდი</Link>,
          },
        }))}
      />
    </section>
  );
}
