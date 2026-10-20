import { ComboBox } from "@/components/combo-box";
import { MapsUrlField } from "@/components/maps-url-field";

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

export type CustomerFieldValues = {
  kind?: string;
  name?: string;
  legalName?: string;
  directorName?: string;
  venueType?: string;
  segment?: string;
  identificationCode?: string;
  district?: string;
  city?: string;
  region?: string;
  phone?: string;
  email?: string;
  website?: string;
  mapsUrl?: string;
  source?: string;
  priority?: string;
  verification?: string;
  relationshipStatus?: string;
  nextContactOn?: string;
  notes?: string;
  doNotContact?: boolean;
};

export function CustomerFields({
  values,
  placeName,
  mapFallback,
  addressHint = false,
  showDoNotContact = false,
}: {
  values?: CustomerFieldValues;
  placeName: string;
  mapFallback: string;
  addressHint?: boolean;
  showDoNotContact?: boolean;
}) {
  return (
    <>
      <fieldset className="group">
        <legend>ვინ არის</legend>
        <label>კომპანია თუ პირი<ComboBox name="kind" options={KINDS} defaultValue={values?.kind || "company"} /></label>
        <label>სახელი<input name="name" required defaultValue={values?.name ?? ""} /></label>
        <label>იურიდიული დასახელება<input name="legalName" defaultValue={values?.legalName ?? ""} /></label>
        <label>დირექტორი<input name="directorName" defaultValue={values?.directorName ?? ""} /></label>
        <label>ობიექტის ტიპი<input name="venueType" defaultValue={values?.venueType ?? ""} placeholder="კაფე, რესტორანი..." /></label>
        <label>სეგმენტი<ComboBox name="segment" options={SEGMENTS} defaultValue={values?.segment || "horeca"} /></label>
        <label>საიდენტიფიკაციო კოდი<input name="identificationCode" defaultValue={values?.identificationCode ?? ""} /></label>
      </fieldset>
      <fieldset className="group">
        <legend>სად დგას</legend>
        <label>ზონა<input name="district" defaultValue={values?.district ?? ""} placeholder="ვაჟა, საბურთალო..." /></label>
        <label>ქალაქი<input name="city" defaultValue={values?.city ?? ""} /></label>
        <label>რეგიონი<input name="region" defaultValue={values?.region ?? ""} /></label>
        {addressHint ? <p className="muted">ქუჩა მისამართების ტაბში იცვლება.</p> : null}
      </fieldset>
      <fieldset className="group">
        <legend>როგორ დავუკავშირდე</legend>
        <label>ტელეფონი<input name="phone" defaultValue={values?.phone ?? ""} placeholder="რამდენიმე ნომერი / -ით" /></label>
        <label>ელფოსტა<input name="email" type="email" defaultValue={values?.email ?? ""} /></label>
        <label>ვებგვერდი<input name="website" defaultValue={values?.website ?? ""} placeholder="https://" /></label>
        <MapsUrlField defaultValue={values?.mapsUrl ?? ""} placeName={placeName} fallback={mapFallback} />
        <label>წყარო<input name="source" defaultValue={values?.source ?? ""} /></label>
      </fieldset>
      <fieldset className="group">
        <legend>სად არის ურთიერთობა</legend>
        <label>პრიორიტეტი<ComboBox name="priority" options={PRIORITIES} defaultValue={values?.priority ?? ""} /></label>
        <label>ვერიფიკაცია<ComboBox name="verification" options={VERIFIED} defaultValue={values?.verification ?? ""} /></label>
        <label>სტატუსი<ComboBox name="relationshipStatus" options={STATUSES} defaultValue={values?.relationshipStatus || "fresh"} /></label>
        <label>შემდეგი კონტაქტი<input name="nextContactOn" type="date" defaultValue={values?.nextContactOn ?? ""} /></label>
      </fieldset>
      <fieldset className="group">
        <legend>შენიშვნა</legend>
        <label>რა უნდა გვახსოვდეს<textarea name="notes" defaultValue={values?.notes ?? ""} /></label>
      </fieldset>
      <fieldset className="group warn">
        <legend>ფრთხილად</legend>
        {showDoNotContact ? (
          <>
            <label><input name="doNotContact" type="checkbox" value="yes" defaultChecked={values?.doNotContact} /> აღარ დამიკავშირდეთ</label>
            <p className="muted">მონიშვნის შემდეგ ეს კლიენტი დღის გადასარეკ სიაში აღარ ჩანს.</p>
          </>
        ) : null}
        <label><input name="confirmDuplicate" type="checkbox" value="yes" /> დუბლიკატის მიუხედავად შენახვა</label>
        <p className="muted">იგივე კოდი ან ტელეფონი თუ უკვე არსებობს, ამის გარეშე შენახვა გაჩერდება.</p>
      </fieldset>
    </>
  );
}
