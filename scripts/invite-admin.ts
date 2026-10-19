import "dotenv/config";
import { createOrganizationInvite } from "@/server/auth/invite";

const email = process.argv[2];
const orgName = process.argv[3] ?? "Planter";
if (!email) {
  console.error("გამოყენება: npm run admin:invite -- admin@planter.ge \"Planter\"");
  process.exit(1);
}
void createOrganizationInvite({ orgName, email }).then((token) => {
  console.log(`მოწვევა: http://localhost:3000/invite/${token}`);
});
