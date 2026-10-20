import { BoundForm } from "@/components/bound-form";
import { saveRsCredentialsAction } from "@/server/actions/waybill-actions";
import { saveOrganizationAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

const ADAPTER_NOTE: Record<string, string> = {
  website: "საიტის ფორმა არ არის მიბმული",
  email: "წერილი არ იგზავნება",
  sms: "SMS არ იგზავნება",
  whatsapp: "WhatsApp არ არის ჩართული",
  analytics: "ანალიტიკის პიქსელი არ არის",
  payment: "ონლაინ გადახდა არ მუშაობს",
  bank: "ბანკის API არ არის; CSV ხელით შემოდის",
  erp: "ERP სინქრონი არ არის",
  rs: "RS დოკუმენტი არ იგზავნება",
};

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
          <label>
            <input name="autoInvoiceAfterWaybill" type="checkbox" defaultChecked={organization.autoInvoiceAfterWaybill} />
            RS ზედნადების შემდეგ ინვოისი ავტომატურად
          </label>
        </BoundForm>
      </div>
      <div className="card">
        <h2>ინტეგრაციები</h2>
        <p>Adapter სტატუსი. გასაღები აქ არ იწერება და რეალური კავშირი არ ირთვება.</p>
        <table>
          <thead>
            <tr>
              <th>პროვაიდერი</th>
              <th>სტატუსი</th>
              <th>ახსნა</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td>{connection.provider}</td>
                <td>{connection.status}</td>
                <td>{ADAPTER_NOTE[connection.provider] ?? "არ არის კონფიგურირებული"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>RS.ge</h2>
        <p>
          {connections.find((connection) => connection.provider === "rs")?.status === "configured"
            ? "სერვისის მომხმარებელი შენახულია. პაროლი ეკრანზე არ ბრუნდება."
            : "RS არ არის კონფიგურირებული. გასაღების გარეშე ზედნადების ნომერი არ იწერება."}
        </p>
        <BoundForm action={saveRsCredentialsAction} label="RS შენახვა">
          <label>სერვისის მომხმარებელი<input name="rsUser" autoComplete="off" /></label>
          <label>სერვისის პაროლი<input name="rsPassword" type="password" autoComplete="new-password" /></label>
          <label><input name="clearRs" type="checkbox" /> გასაღების წაშლა</label>
        </BoundForm>
      </div>
      <div className="card">
        <h2>კლიენტის პორტალი</h2>
        <p>პორტალი გამორთულია (portalEnabled={String(organization.portalEnabled)}). საჯარო შესვლა არ იხსნება.</p>
        <p>MFA ამ სესიაში არ ირთვება. AI გამორთულია.</p>
      </div>
    </section>
  );
}
