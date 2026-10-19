import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor } from "@/server/auth/session";
import { BusinessError } from "@/server/errors";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await getActor();
  } catch (error) {
    if (error instanceof BusinessError) redirect("/login");
    throw error;
  }
  return <AppShell>{children}</AppShell>;
}
