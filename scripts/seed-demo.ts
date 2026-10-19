import "dotenv/config";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { provisionOrganization } from "@/server/org";
import { withTx } from "@/server/tx";

if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true") {
  throw new BusinessError("დემო seed მხოლოდ SEED_DEMO=true და არა-production გარემოში ირთვება", "seed");
}

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) {
  throw new BusinessError("DEMO_PASSWORD უნდა იყოს მინიმუმ 10 სიმბოლო", "seed");
}

async function main() {
const db = getDb();
const existing = await db.organization.findFirst({ where: { isDemo: true, name: "Planter სატესტო" } });
if (existing) {
  console.log("სატესტო ორგანიზაცია უკვე არსებობს");
  process.exit(0);
}

const passwordHash = await hashPassword(password);
await withTx(async (tx) => {
  const organization = await tx.organization.create({
    data: {
      name: "Planter სატესტო",
      legalName: "შპს სატესტო Planter",
      identificationCode: "400000001",
      address: "თბილისი, სატესტო ქუჩა 1",
      bankName: "სატესტო ბანკი",
      iban: "GE00TB0000000000000001",
      isDemo: true,
    },
  });
  await provisionOrganization(tx, organization.id);
  const owner = await tx.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: organization.id, code: "owner" } } });
  const driver = await tx.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: organization.id, code: "driver" } } });
  const admin = await tx.user.create({
    data: { email: "demo-admin@planter.test", name: "სატესტო ადმინი", passwordHash },
  });
  const driverUser = await tx.user.create({
    data: { email: "demo-driver@planter.test", name: "სატესტო მძღოლი", passwordHash },
  });
  await tx.membership.create({ data: { organizationId: organization.id, userId: admin.id, roleId: owner.id } });
  await tx.membership.create({ data: { organizationId: organization.id, userId: driverUser.id, roleId: driver.id } });
  await tx.customer.create({
    data: { organizationId: organization.id, kind: "company", name: "სატესტო სკოლა A", segment: "school", relationshipStatus: "to_contact" },
  });
});

console.log("სატესტო ორგანიზაცია შეიქმნა. შესვლა: demo-admin@planter.test");
}

void main();
