import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError, publicMessage } from "@/server/errors";
import { listInbox } from "@/server/features/chat/chat-service";

export async function GET() {
  try {
    const actor = await getActor();
    return NextResponse.json(await listInbox(actor));
  } catch (error) {
    const status = error instanceof BusinessError && error.code === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}
