import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError, publicMessage } from "@/server/errors";
import { listBalances } from "@/server/features/inventory/stock-service";

export async function GET() {
  try {
    const actor = await getActor();
    const rows = await listBalances(actor);
    return NextResponse.json({ rows });
  } catch (error) {
    const status = error instanceof BusinessError && error.code === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}
