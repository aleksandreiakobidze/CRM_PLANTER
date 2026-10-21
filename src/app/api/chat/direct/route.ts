import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError, publicMessage } from "@/server/errors";
import { openDirect } from "@/server/features/chat/chat-service";

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    const body = (await request.json()) as { userId?: string };
    const thread = await openDirect(actor, String(body.userId ?? ""));
    return NextResponse.json({ id: thread.id });
  } catch (error) {
    const status = error instanceof BusinessError && error.code === "not_found" ? 404 : error instanceof BusinessError ? 400 : 401;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}
