import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { campaignActualsAction, createCampaignAction, templateLogAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { campaignSummaries } from "@/server/features/reports/ops-reports";
import { tbilisiDateString } from "@/server/time";

export default async function MarketingPage() {
  const actor = await getActor();
  const [campaigns, customers] = await Promise.all([
    campaignSummaries(actor),
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
  ]);
  const today = tbilisiDateString();
  return (
    <section className="grid">
      <div className="page-head">
        <h1>მარკეტინგი</h1>
        <p>მასობრივი SMS/ელფოსტა გამორთულია. ROAS მხოლოდ მაშინ ჩანს, როცა ხარჯიც და მინიჭებული შემოსავალიც შევსებულია.</p>
      </div>
      <div className="card">
        <h2>კამპანია</h2>
        <BoundForm action={createCampaignAction} label="შენახვა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>სახელი<input name="name" required /></label>
          <label>მიზანი<input name="goal" /></label>
          <label>დაწყება<input name="startOn" type="date" required defaultValue={today} /></label>
          <label>დასრულება<input name="endOn" type="date" required defaultValue={today} /></label>
          <label>ბიუჯეტი<input name="budgetAmount" defaultValue="0" /></label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="campaigns"
        empty="კამპანია ჯერ არ არის."
        columns={[
          { key: "name", header: "სახელი" },
          { key: "budget", header: "ბიუჯეტი" },
          { key: "spend", header: "ხარჯი" },
          { key: "revenue", header: "შემოსავალი" },
          { key: "roas", header: "ROAS" },
        ]}
        rows={campaigns.map((campaign) => ({
          id: campaign.id,
          cells: {
            name: campaign.name,
            budget: campaign.budget,
            spend: campaign.spend ?? "—",
            revenue: campaign.attributedRevenue ?? "—",
            roas: campaign.roas ?? "მონაცემი არ არის",
          },
        }))}
      />
      {campaigns[0] ? (
        <div className="card">
          <h2>ფაქტობრივი ხარჯი</h2>
          <BoundForm action={campaignActualsAction} label="შენახვა">
            <label>კამპანია
              <ComboBox name="campaignId" options={campaigns.map((item) => ({ value: item.id, label: item.name }))} />
            </label>
            <label>ხარჯი<input name="spendAmount" /></label>
            <label>მინიჭებული შემოსავალი<input name="attributedRevenue" /></label>
          </BoundForm>
        </div>
      ) : null}
      <div className="card">
        <h2>შაბლონი კომუნიკაციის ჟურნალში</h2>
        <BoundForm action={templateLogAction} label="ჟურნალში ჩაწერა">
          <label>კლიენტი
            <ComboBox name="customerId" required options={customers.map((item) => ({ value: item.id, label: item.name }))} />
          </label>
          <label>ტექსტი<textarea name="body" required /></label>
        </BoundForm>
      </div>
    </section>
  );
}
