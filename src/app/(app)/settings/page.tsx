import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { PlaceCatalog } from "@/components/place-catalog";
import { SettingsPanel } from "@/components/settings-panel";
import { saveRsCredentialsAction } from "@/server/actions/waybill-actions";
import { addPlaceTermAction, saveOrganizationAction, setMemberRoleAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { listAssignableRoles, listTeam } from "@/server/features/admin/team-service";
import { listPlaceTerms, PLACE_KIND_LABEL, PLACE_KINDS } from "@/server/features/crm/place-terms";

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
  const canUsers = actor.permissions.has("admin.users");
  const [organization, connections, placeTerms, members, roles] = await Promise.all([
    getDb().organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    getDb().integrationConnection.findMany({ where: { organizationId: actor.organizationId }, orderBy: { provider: "asc" } }),
    listPlaceTerms(actor.organizationId),
    canUsers ? listTeam(actor) : Promise.resolve([]),
    canUsers ? listAssignableRoles(actor) : Promise.resolve([]),
  ]);
  const canPlaces = actor.permissions.has("crm.write");
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.nameKa }));
  const rsReady = connections.find((connection) => connection.provider === "rs")?.status === "configured";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">პარამეტრები</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          ორგანიზაციის რეკვიზიტები ინვოისისთვის. გასაღები აქ არ იწერება.
        </p>
      </div>

      <SettingsPanel
        id="org"
        defaultOpen
        title="რეკვიზიტები"
        hint="აკლებული საიდენტიფიკაციო კოდი ან ბანკი ინვოისს draft-ად ტოვებს."
      >
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
      </SettingsPanel>

      {canUsers ? (
        <SettingsPanel id="team" title="გუნდი და როლები" hint="ადმინი ხედავს გაყიდვების თანხას. მენეჯერს ოპერაციები რჩება, თანხა არა.">
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {members.map((member) => (
              <li key={member.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(160px,1fr)_minmax(240px,2fr)] md:items-center">
                <div>
                  <strong className="block text-sm font-semibold text-gray-800 dark:text-white/90">{member.user.name}</strong>
                  <small className="text-sm text-gray-400">{member.user.email}</small>
                </div>
                <BoundForm action={setMemberRoleAction} label="შენახვა">
                  <input type="hidden" name="membershipId" value={member.id} />
                  <label>
                    როლი
                    <ComboBox name="roleId" options={roleOptions} defaultValue={member.roleId} />
                  </label>
                </BoundForm>
              </li>
            ))}
          </ul>
        </SettingsPanel>
      ) : null}

      <SettingsPanel
        id="places"
        defaultOpen
        title="ზონები, ქალაქები, რეგიონები"
        hint="არჩევადი სიები. ახალი მნიშვნელობა კლიენტის ბარათშიც შეიძლება დაემატოს."
      >
        {canPlaces ? (
          <BoundForm action={addPlaceTermAction} label="დამატება">
            <label>
              ტიპი
              <ComboBox
                name="kind"
                options={PLACE_KINDS.map((kind) => ({ value: kind, label: PLACE_KIND_LABEL[kind] }))}
                defaultValue="district"
              />
            </label>
            <label>სახელი<input name="name" required /></label>
          </BoundForm>
        ) : null}
        <PlaceCatalog
          canWrite={canPlaces}
          groups={PLACE_KINDS.map((kind) => ({
            kind,
            label: PLACE_KIND_LABEL[kind],
            rows: placeTerms.filter((item) => item.kind === kind).map((item) => ({ id: item.id, name: item.name })),
          }))}
        />
      </SettingsPanel>

      <SettingsPanel id="integrations" title="ინტეგრაციები" hint="Adapter სტატუსი. გასაღები აქ არ იწერება.">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {connections.map((connection) => (
            <div key={connection.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[140px_120px_minmax(0,1fr)] sm:items-baseline">
              <strong className="text-sm font-semibold text-gray-800 dark:text-white/90">{connection.provider}</strong>
              <span className="text-sm text-gray-500">{connection.status}</span>
              <span className="text-sm text-gray-400">{ADAPTER_NOTE[connection.provider] ?? "არ არის კონფიგურირებული"}</span>
            </div>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel
        id="rs"
        title="RS.ge"
        hint={rsReady ? "სერვისის მომხმარებელი შენახულია. პაროლი ეკრანზე არ ბრუნდება." : "RS არ არის კონფიგურირებული."}
      >
        <BoundForm action={saveRsCredentialsAction} label="RS შენახვა">
          <label>სერვისის მომხმარებელი<input name="rsUser" autoComplete="off" /></label>
          <label>სერვისის პაროლი<input name="rsPassword" type="password" autoComplete="new-password" /></label>
          <label><input name="clearRs" type="checkbox" /> გასაღების წაშლა</label>
        </BoundForm>
      </SettingsPanel>

      <SettingsPanel id="portal" title="კლიენტის პორტალი">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          პორტალი გამორთულია (portalEnabled={String(organization.portalEnabled)}). საჯარო შესვლა არ იხსნება.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">MFA ამ სესიაში არ ირთვება. AI გამორთულია.</p>
      </SettingsPanel>
    </section>
  );
}
