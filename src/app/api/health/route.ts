import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}
