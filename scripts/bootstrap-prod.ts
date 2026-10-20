import "dotenv/config";
import { createOrganizationInvite } from "@/server/auth/invite";
import { getDb } from "@/server/db";
import { appUrl } from "@/server/env";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    console.log("BOOTSTRAP_ADMIN_EMAIL არ არის — მოწვევა გამოტოვებულია");
    return;
  }
  const users = await getDb().user.count();
  const orgs = await getDb().organization.count();
  if (users > 0 || orgs > 0) {
    console.log("ორგანიზაცია უკვე არის — bootstrap გამოტოვებულია");
    return;
  }
  const token = await createOrganizationInvite({
    orgName: process.env.BOOTSTRAP_ORG_NAME || "Planter",
    email,
  });
  console.log(`პირველი ადმინის მოწვევა: ${appUrl()}/invite/${token}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
