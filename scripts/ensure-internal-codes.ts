import "dotenv/config";
import { getDb } from "@/server/db";
import { backfillInternalCodes } from "@/server/features/catalog/internal-code";

async function main() {
  const db = getDb();
  const orgs = await db.organization.findMany({ select: { id: true } });
  let filled = 0;
  for (const org of orgs) {
    filled += await backfillInternalCodes(db, org.id);
  }
  return filled;
}

void main()
  .then((filled) => {
    console.log(`Internal codes ready (${filled} filled)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
