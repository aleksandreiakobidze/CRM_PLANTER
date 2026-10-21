import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { canAccessPath, hrefsForActor } from "@/server/auth/nav-access";
import { getActor } from "@/server/auth/session";
import { BusinessError } from "@/server/errors";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let actor;
  try {
    actor = await getActor();
  } catch (error) {
    if (error instanceof BusinessError) redirect("/login");
    throw error;
  }
  const path = (await headers()).get("x-planter-path") ?? "/";
  if (!canAccessPath(actor, path)) redirect("/");
  return <AppShell allowedHrefs={hrefsForActor(actor)}>{children}</AppShell>;
}
