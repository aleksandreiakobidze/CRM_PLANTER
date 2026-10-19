import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { MapsUrlField } from "@/components/maps-url-field";
import { updateCustomerAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

const KINDS = [{ value: "company", label: "კომპანია" }, { value: "person", label: "ფიზიკური პირი" }];
const SEGMENTS = [
  { value: "horeca", label: "HoReCa" },
  { value: "person", label: "კერძო პირი" },
  { value: "office", label: "ოფისი" },
  { value: "school", label: "სკოლა" },
  { value: "other", label: "სხვა" },
];
const PRIORITIES = [
  { value: "", label: "არ არის" },
  { value: "A", label: "A · მაღალი" },
  { value: "B", label: "B · საშუალო" },
  { value: "C", label: "C · დაბალი" },
];
const VERIFIED = [
  { value: "", label: "არ არის" },
  { value: "verified", label: "დადასტურებული" },
];
const STATUSES = [
  { value: "fresh", label: "ახალი" },
  { value: "to_contact", label: "უნდა დავაკონტაქტო" },
  { value: "quote_sent", label: "შეთავაზება გავაგზავნე" },
  { value: "customer", label: "მომხმარებელი გახდა" },
  { value: "declined", label: "არ სურს" },
];

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const customer = await getDb().customer.findFirst({
    where: { id, organizationId: actor.organizationId, mergedIntoId: null },
    include: { addresses: { take: 1 } },
  });
  if (!customer) notFound();
  const place = customer.addresses[0];
  const mapFallback = [customer.name, place?.line1, customer.city, "თბილისი"].filter(Boolean).join(", ");
  return (
    <section className="grid editor">
      <div className="page-head">
        <Link className="back" href={`/crm/customers/${customer.id}`}>ბარათზე დაბრუნება</Link>
        <h1>რედაქტირება</h1>
        <p>{customer.name}</p>
      </div>
      <div className="card">
        <BoundForm action={updateCustomerAction.bind(null, customer.id)} label="შენახვა">
          <fieldset className="group">
            <legend>ვინ არის</legend>
            <label>კომპანია თუ პირი<ComboBox name="kind" options={KINDS} defaultValue={customer.kind} /></label>
            <label>სახელი<input name="name" required defaultValue={customer.name} /></label>
            <label>ობიექტის ტიპი<input name="venueType" defaultValue={customer.venueType ?? ""} placeholder="კაფე, რესტორანი..." /></label>
            <label>სეგმენტი<ComboBox name="segment" options={SEGMENTS} defaultValue={customer.segment} /></label>
            <label>საიდენტიფიკაციო კოდი<input name="identificationCode" defaultValue={customer.identificationCode ?? ""} /></label>
          </fieldset>
          <fieldset className="group">
            <legend>სად დგას</legend>
            <label>ზონა<input name="district" defaultValue={customer.district ?? ""} placeholder="ვაჟა, საბურთალო..." /></label>
            <label>ქალაქი<input name="city" defaultValue={customer.city ?? ""} /></label>
            <label>რეგიონი<input name="region" defaultValue={customer.region ?? ""} /></label>
            <p className="muted">ქუჩა ბარათის მისამართებში იცვლება.</p>
          </fieldset>
          <fieldset className="group">
            <legend>როგორ დავუკავშირდე</legend>
            <label>ტელეფონი<input name="phone" defaultValue={customer.phone ?? ""} placeholder="რამდენიმე ნომერი / -ით" /></label>
            <label>ელფოსტა<input name="email" type="email" defaultValue={customer.email ?? ""} /></label>
            <label>ვებგვერდი<input name="website" defaultValue={customer.website ?? ""} placeholder="https://" /></label>
            <MapsUrlField defaultValue={customer.mapsUrl ?? ""} placeName={customer.name} fallback={mapFallback} />
            <label>წყარო<input name="source" defaultValue={customer.source ?? ""} /></label>
          </fieldset>
          <fieldset className="group">
            <legend>სად არის ურთიერთობა</legend>
            <label>პრიორიტეტი<ComboBox name="priority" options={PRIORITIES} defaultValue={customer.priority ?? ""} /></label>
            <label>ვერიფიკაცია<ComboBox name="verification" options={VERIFIED} defaultValue={customer.verification ?? ""} /></label>
            <label>სტატუსი<ComboBox name="relationshipStatus" options={STATUSES} defaultValue={customer.relationshipStatus} /></label>
            <label>შემდეგი კონტაქტი<input name="nextContactOn" type="date" defaultValue={customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : ""} /></label>
          </fieldset>
          <fieldset className="group">
            <legend>შენიშვნა</legend>
            <label>რა უნდა გვახსოვდეს<textarea name="notes" defaultValue={customer.notes ?? ""} /></label>
          </fieldset>
          <fieldset className="group warn">
            <legend>ფრთხილად</legend>
            <label><input name="doNotContact" type="checkbox" value="yes" defaultChecked={customer.doNotContact} /> აღარ დამიკავშირდეთ</label>
            <p className="muted">მონიშვნის შემდეგ ეს კლიენტი დღის გადასარეკ სიაში აღარ ჩანს.</p>
            <label><input name="confirmDuplicate" type="checkbox" value="yes" /> დუბლიკატის მიუხედავად შენახვა</label>
            <p className="muted">იგივე კოდი ან ტელეფონი თუ უკვე არსებობს, ამის გარეშე შენახვა გაჩერდება.</p>
          </fieldset>
        </BoundForm>
      </div>
    </section>
  );
}
