import type { Tx } from "@/server/db";
import { PERMISSIONS, ROLE_PRESETS } from "@/server/auth/permissions";
import { seedPlaceTerms } from "@/server/features/crm/place-terms";

export const DEFAULT_LOCATIONS = [
  { code: "greenhouse", nameKa: "სათბური ნაფეტვრებში", kind: "greenhouse" },
  { code: "warehouse", nameKa: "საწყობი", kind: "warehouse" },
  { code: "sales", nameKa: "გასაყიდი ზონა", kind: "sales_floor" },
  { code: "quarantine", nameKa: "საკარანტინო", kind: "quarantine" },
  { code: "transit", nameKa: "ტრანზიტი", kind: "transit" },
  { code: "rental_pool", nameKa: "გასაქირავებელი ფონდი", kind: "rental_pool" },
  { code: "customer_site", nameKa: "კლიენტის ობიექტი", kind: "customer_site" },
] as const;

export const SELLABLE_LOCATION_KINDS = new Set(["greenhouse", "warehouse", "sales_floor"]);

export const SPECIES_SEED = [
  { nameKa: "სანსევიერია", nameLatin: "Sansevieria", aliases: ["სანს", "sansevieria"] },
  { nameKa: "ქლოროფიტუმი", nameLatin: "Chlorophytum", aliases: ["ქლორო", "chlorophytum"] },
  { nameKa: "ეპიპრემნუმი", nameLatin: "Epipremnum", aliases: ["ეპიპ", "epipremnum"] },
  { nameKa: "სპათიფილუმი", nameLatin: "Spathiphyllum", aliases: ["სპათი", "spathiphyllum"] },
  { nameKa: "არეკა", nameLatin: "Dypsis lutescens", aliases: ["areca"] },
  { nameKa: "მონსტერა", nameLatin: "Monstera", aliases: ["monstera"] },
  { nameKa: "კროტონი", nameLatin: "Codiaeum", aliases: ["croton", "კროტონ"] },
  { nameKa: "კალათეა", nameLatin: "Calathea", aliases: ["calathea"] },
] as const;

const PROVIDERS = ["website", "email", "sms", "whatsapp", "analytics", "payment", "bank", "erp", "rs"];

export async function provisionOrganization(tx: Tx, organizationId: string): Promise<void> {
  for (const code of PERMISSIONS) {
    await tx.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  for (const [code, preset] of Object.entries(ROLE_PRESETS)) {
    const role = await tx.role.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: { nameKa: preset.nameKa },
      create: { organizationId, code, nameKa: preset.nameKa },
    });
    for (const permission of preset.permissions) {
      const row = await tx.permission.findUniqueOrThrow({ where: { code: permission } });
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: row.id } },
        update: {},
        create: { roleId: role.id, permissionId: row.id },
      });
    }
  }
  for (const location of DEFAULT_LOCATIONS) {
    await tx.location.upsert({
      where: { organizationId_code: { organizationId, code: location.code } },
      update: {},
      create: { organizationId, ...location },
    });
  }
  for (const species of SPECIES_SEED) {
    await tx.species.upsert({
      where: { organizationId_nameKa: { organizationId, nameKa: species.nameKa } },
      update: { aliases: [...species.aliases], nameLatin: species.nameLatin },
      create: { organizationId, nameKa: species.nameKa, nameLatin: species.nameLatin, aliases: [...species.aliases] },
    });
  }
  await tx.priceList.upsert({
    where: { organizationId_code: { organizationId, code: "retail" } },
    update: {},
    create: { organizationId, code: "retail", nameKa: "საცალო", kind: "retail" },
  });
  for (const provider of PROVIDERS) {
    await tx.integrationConnection.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      update: {},
      create: { organizationId, provider, status: "not_configured" },
    });
  }
  await seedPlaceTerms(tx, organizationId);
  const hall = await tx.resource.findFirst({ where: { organizationId, nameKa: "სათბურის დარბაზი" } });
  if (!hall) {
    await tx.resource.create({ data: { organizationId, nameKa: "სათბურის დარბაზი", capacity: 1 } });
  }
}

function aliasList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function matchSpecies(name: string, species: { id: string; nameKa: string; nameLatin: string | null; aliases: unknown }[]): string | null {
  const needle = name.trim().toLocaleLowerCase("ka");
  const hits = species.filter((item) => {
    const names = [item.nameKa, item.nameLatin ?? "", ...aliasList(item.aliases)].map((value) => value.toLocaleLowerCase("ka"));
    return names.includes(needle);
  });
  return hits.length === 1 ? hits[0].id : null;
}
