import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { MapsUrlField } from "@/components/maps-url-field";
import { createCustomerAction } from "@/server/actions/work-actions";

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

export default function NewCustomerPage() {
  return (
    <section className="grid editor">
      <div className="page-head">
        <h1>ახალი კლიენტი</h1>
        <p>ობიექტი, ზონა და პრიორიტეტი აქვე ივსება. ქუჩა შენახვის შემდეგ ბარათზე ემატება.</p>
      </div>
      <div className="card">
        <BoundForm action={createCustomerAction} label="შენახვა">
          <fieldset className="group">
            <legend>ვინ არის</legend>
            <label>კომპანია თუ პირი<ComboBox name="kind" options={KINDS} defaultValue="company" /></label>
            <label>სახელი<input name="name" required /></label>
            <label>ობიექტის ტიპი<input name="venueType" placeholder="კაფე, რესტორანი..." /></label>
            <label>სეგმენტი<ComboBox name="segment" options={SEGMENTS} defaultValue="horeca" /></label>
            <label>საიდენტიფიკაციო კოდი<input name="identificationCode" /></label>
          </fieldset>
          <fieldset className="group">
            <legend>სად დგას</legend>
            <label>ზონა<input name="district" placeholder="ვაჟა, საბურთალო..." /></label>
            <label>ქალაქი<input name="city" /></label>
            <label>რეგიონი<input name="region" /></label>
          </fieldset>
          <fieldset className="group">
            <legend>როგორ დავუკავშირდე</legend>
            <label>ტელეფონი<input name="phone" placeholder="რამდენიმე ნომერი / -ით" /></label>
            <label>ელფოსტა<input name="email" type="email" /></label>
            <label>ვებგვერდი<input name="website" placeholder="https://" /></label>
            <MapsUrlField defaultValue="" placeName="ობიექტი" fallback="" />
            <label>წყარო<input name="source" /></label>
          </fieldset>
          <fieldset className="group">
            <legend>სად არის ურთიერთობა</legend>
            <label>პრიორიტეტი<ComboBox name="priority" options={PRIORITIES} defaultValue="" /></label>
            <label>ვერიფიკაცია<ComboBox name="verification" options={VERIFIED} defaultValue="" /></label>
            <label>სტატუსი<ComboBox name="relationshipStatus" options={STATUSES} defaultValue="fresh" /></label>
            <label>შემდეგი კონტაქტი<input name="nextContactOn" type="date" /></label>
          </fieldset>
          <fieldset className="group">
            <legend>შენიშვნა</legend>
            <label>რა უნდა გვახსოვდეს<textarea name="notes" /></label>
          </fieldset>
          <fieldset className="group warn">
            <legend>ფრთხილად</legend>
            <label><input name="confirmDuplicate" type="checkbox" value="yes" /> დუბლიკატის მიუხედავად შექმნა</label>
            <p className="muted">იგივე კოდი ან ტელეფონი თუ უკვე არსებობს, ამის გარეშე შენახვა გაჩერდება.</p>
          </fieldset>
        </BoundForm>
      </div>
    </section>
  );
}
