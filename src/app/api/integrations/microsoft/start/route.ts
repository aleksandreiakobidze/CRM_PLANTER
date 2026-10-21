import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError } from "@/server/errors";
import { microsoftAuthorizeUrl, microsoftConfigured } from "@/server/features/integrations/microsoft-graph";
import { ADMIN_COPY } from "@/server/features/admin/admin-copy";

export const dynamic = "force-dynamic";

const COOKIE = "planter_ms_state";

export async function GET() {
  try {
    await getActor();
  } catch (error) {
    if (error instanceof BusinessError) return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
    throw error;
  }
  if (!microsoftConfigured()) {
    return NextResponse.redirect(new URL("/settings?m365=missing", process.env.APP_URL ?? "http://localhost:3000"));
  }
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(microsoftAuthorizeUrl(state));
}
