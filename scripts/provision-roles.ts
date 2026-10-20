import "dotenv/config";
import { getDb } from "@/server/db";
import { provisionOrganization } from "@/server/org";
import { withTx } from "@/server/tx";

async function main() {
  const orgs = await getDb().organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    await withTx((tx) => provisionOrganization(tx, org.id));
    console.log(org.name);
  }
}

void main();
