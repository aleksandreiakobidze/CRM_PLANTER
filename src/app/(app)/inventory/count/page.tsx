import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { createCountAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

export default async function InventoryCountListPage() {
  const actor = await getActor();
  const [locations, counts] = await Promise.all([
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
    getDb().inventoryCount.findMany({
      where: { organizationId: actor.organizationId },
      include: { location: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/inventory">მარაგი</Link>
        <h1>ინვენტარიზაცია</h1>
        <p>სისტემური ნაშთი იწერება სესიის შექმნისას. სხვაობა ledger-ზე ერთხელ გაივლის.</p>
      </div>
      <div className="card">
        <BoundForm action={createCountAction} label="სესიის გახსნა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>ლოკაცია
            <ComboBox name="locationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} />
          </label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="counts"
        empty="სესია ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "location", header: "ლოკაცია" },
          { key: "status", header: "სტატუსი" },
          { key: "date", header: "თარიღი" },
        ]}
        rows={counts.map((count) => ({
          id: count.id,
          cells: {
            number: <Link href={`/inventory/count/${count.id}`}>{count.number}</Link>,
            location: count.location.nameKa,
            status: count.status === "posted" ? "დამტკიცებული" : "დრაფტი",
            date: formatDateOnly(count.countedOn),
          },
        }))}
      />
    </section>
  );
}
