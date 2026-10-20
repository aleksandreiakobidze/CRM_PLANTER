import { NextResponse } from "next/server";
import { runOnce } from "@/worker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  await runOnce();
  return NextResponse.json({ ok: true });
}
