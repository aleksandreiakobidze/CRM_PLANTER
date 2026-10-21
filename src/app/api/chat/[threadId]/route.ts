import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError, publicMessage } from "@/server/errors";
import { listMessages, sendMessage } from "@/server/features/chat/chat-service";

function fail(error: unknown) {
  const status = error instanceof BusinessError && error.code === "forbidden" ? 403 : error instanceof BusinessError && error.code === "not_found" ? 404 : error instanceof BusinessError ? 400 : 401;
  return NextResponse.json({ error: publicMessage(error) }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getActor();
    const { threadId } = await params;
    const after = new URL(request.url).searchParams.get("after") ?? undefined;
    return NextResponse.json({ messages: await listMessages(actor, threadId, after) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const actor = await getActor();
    const { threadId } = await params;
    const body = (await request.json()) as { body?: string };
    return NextResponse.json({ message: await sendMessage(actor, threadId, String(body.body ?? "")) });
  } catch (error) {
    return fail(error);
  }
}
