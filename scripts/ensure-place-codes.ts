import "dotenv/config";
import { getDb } from "@/server/db";
import { backfillPlaceCodes } from "@/server/features/crm/place-terms";

async function main() {
  const db = getDb();
  const orgs = await db.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    await backfillPlaceCodes(db, org.id);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
