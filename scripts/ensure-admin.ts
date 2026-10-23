import "dotenv/config";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { provisionOrganization } from "@/server/org";
import { withTx } from "@/server/tx";

const ADMIN_EMAIL = "admin@planter.ge";
const ADMIN_USERNAME = "Admin";
const ADMIN_PASSWORD = "Planter123$";

async function main() {
  const db = getDb();
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const organization = await withTx(async (tx) => {
    let org = await tx.organization.findFirst({ where: { isDemo: false }, orderBy: { createdAt: "asc" } });
    if (!org) org = await tx.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) {
      org = await tx.organization.create({
        data: { name: "Planter", legalName: "Planter" },
      });
    }
    await provisionOrganization(tx, org.id);
    await tx.organization.updateMany({
      where: { excursionWindowStart: "13:00", excursionWindowEnd: "16:00" },
      data: { excursionWindowStart: "10:00", excursionWindowEnd: "17:00" },
    });
    await tx.excursionProgram.updateMany({
      where: { windowStart: "13:00", windowEnd: "16:00" },
      data: { windowStart: "10:00", windowEnd: "17:00" },
    });
    const owner = await tx.role.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: org.id, code: "owner" } },
    });
    const existing = await tx.user.findFirst({
      where: { OR: [{ email: ADMIN_EMAIL }, { username: ADMIN_USERNAME }] },
    });
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            email: ADMIN_EMAIL,
            username: ADMIN_USERNAME,
            name: ADMIN_USERNAME,
            passwordHash,
            active: true,
          },
        })
      : await tx.user.create({
          data: {
            email: ADMIN_EMAIL,
            username: ADMIN_USERNAME,
            name: ADMIN_USERNAME,
            passwordHash,
            active: true,
          },
        });
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { roleId: owner.id, active: true },
      create: { organizationId: org.id, userId: user.id, roleId: owner.id, active: true },
    });
    return org;
  });
  console.log(`Admin ready for ${organization.name}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .then(() => process.exit(0));
