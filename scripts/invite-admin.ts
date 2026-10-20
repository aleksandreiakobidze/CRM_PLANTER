import "dotenv/config";
import { createOrganizationInvite } from "@/server/auth/invite";
import { appUrl } from "@/server/env";

const email = process.argv[2];
const orgName = process.argv[3] ?? "Planter";
if (!email) {
  console.error("გამოყენება: npm run admin:invite -- admin@planter.ge \"Planter\"");
  process.exit(1);
}
void createOrganizationInvite({ orgName, email }).then((token) => {
  console.log(`მოწვევა: ${appUrl()}/invite/${token}`);
});
