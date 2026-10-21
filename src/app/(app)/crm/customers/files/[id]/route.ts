import { getActor } from "@/server/auth/session";
import { BusinessError } from "@/server/errors";
import { readCustomerFile } from "@/server/features/crm/customer-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    const file = await readCustomerFile(actor, id);
    const name = encodeURIComponent(file.fileName);
    const inline = file.kind === "image" || file.contentType === "application/pdf";
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Content-Length": String(file.bytes.byteLength),
      },
    });
  } catch (error) {
    const status = error instanceof BusinessError
      ? error.code === "forbidden" ? 403 : error.code === "unauthenticated" ? 401 : 404
      : 404;
    return new Response(error instanceof BusinessError ? error.message : "ფაილი ვერ მოიძებნა", { status });
  }
}
