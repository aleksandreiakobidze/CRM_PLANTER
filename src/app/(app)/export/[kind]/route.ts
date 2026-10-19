import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { buildExport } from "@/server/export/lists";
import { contentDisposition } from "@/server/export/workbook";
import { BusinessError, publicMessage } from "@/server/errors";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const actor = await getActor();
    const { kind } = await context.params;
    const file = await buildExport(kind, actor, new URL(request.url));
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(file.filename, file.fallback),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof BusinessError ? (error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400) : 400;
    return NextResponse.json({ error: publicMessage(error) }, { status });
  }
}
