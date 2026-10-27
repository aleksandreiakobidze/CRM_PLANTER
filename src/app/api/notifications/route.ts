import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { BusinessError, publicMessage } from "@/server/errors";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/server/features/notifications/notification-service";

export async function GET() {
  try {
    const actor = await getActor();
    return NextResponse.json(await listNotifications(actor));
  } catch (error) {
    const status = error instanceof BusinessError && error.code === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id === "string" && body.id) await markNotificationRead(actor, body.id);
    else await markAllNotificationsRead(actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof BusinessError && error.code === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}
