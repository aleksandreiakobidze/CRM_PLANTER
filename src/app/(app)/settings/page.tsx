import { BoundForm } from "@/components/bound-form";
import { saveOrganizationAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function SettingsPage() {
  const actor = await getActor();
  const [organization, connections] = await Promise.all([
    getDb().organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    getDb().integrationConnection.findMany({ where: { organizationId: actor.organizationId }, orderBy: { provider: "asc" } }),
  ]);
  return (
    <section className="grid">
      <div className="page-head">
        <h1>პარამეტრები</h1>
        <p>ორგანიზაციის რეკვიზიტები ინვოისისთვის. გასაღები აქ არ იწერება.</p>
      </div>
      <div className="card">
        <h2>რეკვიზიტები</h2>
        <p>აკლებული საიდენტიფიკაციო კოდი ან ბანკი ინვოისს draft-ად ტოვებს. მნიშვნელობა არ იგონება.</p>
        <BoundForm action={saveOrganizationAction} label="შენახვა">
          <label>იურიდიული სახელი<input name="legalName" defaultValue={organization.legalName ?? ""} /></label>
          <label>საიდენტიფიკაციო კოდი<input name="identificationCode" defaultValue={organization.identificationCode ?? ""} /></label>
          <label>მისამართი<input name="address" defaultValue={organization.address ?? ""} /></label>
          <label>დირექტორი<input name="directorName" defaultValue={organization.directorName ?? ""} /></label>
          <label>ბანკი<input name="bankName" defaultValue={organization.bankName ?? ""} /></label>
          <label>IBAN<input name="iban" defaultValue={organization.iban ?? ""} /></label>
        </BoundForm>
      </div>
      <div className="card">
        <h2>ინტეგრაციები</h2>
        <ul>{connections.map((connection) => <li key={connection.id}>{connection.provider}: {connection.status}</li>)}</ul>
        <p>გასაღების გარეშე არც გადახდა, არც წერილი და არც RS დოკუმენტი რეალურად არ იგზავნება.</p>
      </div>
      <div className="card">
        <h2>ჯერ არ არის ჩართული</h2>
        <p>კლიენტის პორტალი — ეტაპი 4, უფლებების ტესტების შემდეგ.</p>
        <p>MFA — ეტაპი 4. ადმინისტრატორისთვის ჩართვა ცალკე კონფიგურაციას ელოდება.</p>
        <p>AI — ეტაპი 5, გარე პროვაიდერის გარეშე.</p>
      </div>
    </section>
  );
}
