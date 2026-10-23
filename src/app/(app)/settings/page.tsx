import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { PlaceCatalog } from "@/components/place-catalog";
import { SettingsPanel } from "@/components/settings-panel";
import { disconnectMicrosoftAction, inviteMemberAction, purgeMasterDataAction, resetMemberPasswordAction } from "@/server/actions/admin-actions";
import { saveRsCredentialsAction } from "@/server/actions/waybill-actions";
import { addPlaceTermAction, saveOrganizationAction, setMemberRoleAction } from "@/server/actions/work-actions";
import { isMasterAdmin } from "@/server/auth/permissions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { ADMIN_COPY, PURGE_GROUP_LABELS } from "@/server/features/admin/admin-copy";
import { countPurgeGroups, PURGE_GROUPS } from "@/server/features/admin/purge-service";
import { listAssignableRoles, listTeam } from "@/server/features/admin/team-service";
import { listPlaceTerms, PLACE_KIND_LABEL, PLACE_KINDS } from "@/server/features/crm/place-terms";
import { microsoftConfigured } from "@/server/features/integrations/microsoft-graph";

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
  const master = isMasterAdmin(actor);
  const [organization, connections, placeTerms, members, roles, outlook, purgeCounts] = await Promise.all([
    getDb().organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    getDb().integrationConnection.findMany({ where: { organizationId: actor.organizationId }, orderBy: { provider: "asc" } }),
    listPlaceTerms(actor.organizationId),
    canUsers ? listTeam(actor) : Promise.resolve([]),
    canUsers ? listAssignableRoles(actor) : Promise.resolve([]),
    getDb().userIntegration.findUnique({
      where: { userId_provider: { userId: actor.userId, provider: "microsoft" } },
    }),
    master ? countPurgeGroups(actor) : Promise.resolve(null),
  ]);
  const canPlaces = actor.permissions.has("crm.write");
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.nameKa }));
  const rsReady = connections.find((connection) => connection.provider === "rs")?.status === "configured";
  const outlookReady = outlook?.status === "configured";
  const azureReady = microsoftConfigured();

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
              <li key={member.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(160px,1fr)_minmax(200px,1.4fr)_minmax(160px,1fr)] md:items-start">
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
                <BoundForm action={resetMemberPasswordAction} label={ADMIN_COPY.resetSubmit}>
                  <input type="hidden" name="membershipId" value={member.id} />
                </BoundForm>
              </li>
            ))}
          </ul>
          <BoundForm action={inviteMemberAction} label={ADMIN_COPY.inviteSubmit}>
            <label>
              {ADMIN_COPY.inviteEmail}
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              {ADMIN_COPY.inviteName}
              <input name="name" />
            </label>
            <label>
              {ADMIN_COPY.inviteRole}
              <ComboBox name="roleId" options={roleOptions} />
            </label>
            <p className="text-sm text-gray-400">{ADMIN_COPY.inviteHint}</p>
          </BoundForm>
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
            <label>კოდი<input name="code" required /></label>
          </BoundForm>
        ) : null}
        <PlaceCatalog
          canWrite={canPlaces}
          groups={PLACE_KINDS.map((kind) => ({
            kind,
            label: PLACE_KIND_LABEL[kind],
            rows: placeTerms.filter((item) => item.kind === kind).map((item) => ({ id: item.id, name: item.name, code: item.code })),
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

      <SettingsPanel id="microsoft" title={ADMIN_COPY.m365Title} hint={ADMIN_COPY.m365Hint}>
        {azureReady ? (
          outlookReady ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {ADMIN_COPY.m365Ready} {outlook?.email}
              </p>
              <BoundForm action={disconnectMicrosoftAction} label={ADMIN_COPY.m365Disconnect}>
                <input type="hidden" name="disconnect" value="1" />
              </BoundForm>
            </div>
          ) : (
            <form action="/api/integrations/microsoft/start" method="get">
              <button type="submit">{ADMIN_COPY.m365Connect}</button>
            </form>
          )
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{ADMIN_COPY.m365Missing}</p>
        )}
      </SettingsPanel>

      {master && purgeCounts ? (
        <SettingsPanel id="purge" title={ADMIN_COPY.purgeTitle} hint={ADMIN_COPY.purgeHint}>
          <BoundForm action={purgeMasterDataAction} label={ADMIN_COPY.purgeSubmit}>
            <div className="grid gap-2 sm:grid-cols-2">
              {PURGE_GROUPS.map((group) => (
                <label key={group} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input name={`group_${group}`} type="checkbox" />
                  {PURGE_GROUP_LABELS[group]} ({purgeCounts[group]})
                </label>
              ))}
            </div>
            <label>
              {ADMIN_COPY.purgePassword}
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <label>
              {ADMIN_COPY.purgeConfirmLabel} {ADMIN_COPY.purgeConfirmValue}
              <input name="confirm" required />
            </label>
          </BoundForm>
        </SettingsPanel>
      ) : null}

      <SettingsPanel id="portal" title="კლიენტის პორტალი">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          პორტალი გამორთულია (portalEnabled={String(organization.portalEnabled)}). საჯარო შესვლა არ იხსნება.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">MFA ამ სესიაში არ ირთვება. AI გამორთულია.</p>
      </SettingsPanel>
    </section>
  );
}
