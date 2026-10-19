import { randomBytes } from "crypto";
import { hashToken } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { provisionOrganization } from "@/server/org";
import { withTx } from "@/server/tx";

export async function createOrganizationInvite(input: { orgName: string; email: string; roleCode?: string }): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    const existing = await getDb().user.count();
    if (existing > 0 && process.env.ALLOW_INVITE !== "true") {
      throw new BusinessError("მოწვევა production-ში მხოლოდ ALLOW_INVITE=true-ით იქმნება", "invite");
    }
  }
  const token = randomBytes(24).toString("base64url");
  await withTx(async (tx) => {
    let organization = await tx.organization.findFirst({ where: { name: input.orgName, isDemo: false } });
    if (!organization) {
      organization = await tx.organization.create({ data: { name: input.orgName, legalName: input.orgName } });
      await provisionOrganization(tx, organization.id);
    }
    const role = await tx.role.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: organization.id, code: input.roleCode ?? "owner" } },
    });
    await tx.invitation.create({
      data: {
        organizationId: organization.id,
        email: input.email.toLowerCase(),
        roleId: role.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
      },
    });
  });
  return token;
}
