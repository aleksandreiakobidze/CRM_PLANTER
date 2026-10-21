import { randomUUID } from "crypto";
import { hashPassword } from "@/server/auth/password";
import { ROLE_PRESETS, type Actor } from "@/server/auth/permissions";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { getDb } from "@/server/db";
import { provisionOrganization } from "@/server/org";
import { withTx } from "@/server/tx";

export async function makeWorld(roleCode = "owner"): Promise<{ actor: Actor; organizationId: string }> {
  const sequence = randomUUID().slice(0, 8);
  const db = getDb();
  const organization = await db.organization.create({
    data: {
      name: `სატესტო ორგანიზაცია ${sequence}`,
      legalName: `სატესტო ორგანიზაცია ${sequence}`,
      identificationCode: sequence,
      bankName: "სატესტო ბანკი",
      iban: "GE00TB0000000000000099",
      address: "თბილისი, სატესტო ქუჩა 1",
      isDemo: true,
    },
  });
  await withTx((tx) => provisionOrganization(tx, organization.id));
  const role = await db.role.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: roleCode } },
  });
  const user = await db.user.create({
    data: {
      email: `user-${sequence}-${roleCode}@planter.test`,
      name: "სატესტო მომხმარებელი",
      passwordHash: await hashPassword("test-password-123"),
    },
  });
  await db.membership.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id } });
  return {
    organizationId: organization.id,
    actor: {
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      username: user.username,
      permissions: new Set(ROLE_PRESETS[roleCode].permissions),
    },
  };
}

export async function makeSellable(actor: Actor, sku: string, quantity: string, unitCost = "8") {
  const variant = await createVariant(actor, {
    category: "plant",
    productName: sku,
    sku,
    variantName: sku,
    listPrice: "10",
  });
  const location = await getDb().location.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: actor.organizationId, code: "sales" } },
  });
  const { postOpeningStock } = await import("@/server/features/inventory/stock-service");
  await postOpeningStock(actor, {
    variantId: variant.id,
    locationId: location.id,
    quantity,
    unitCost,
    postingKey: `opening:${actor.organizationId}:${sku}`,
  });
  return { variant, location };
}
