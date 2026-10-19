import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { publicMessage } from "@/server/errors";
import { renderInvoicePdf } from "@/server/features/finance/invoice-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { id } = await context.params;
    const pdf = await renderInvoicePdf(actor, id);
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 400 });
  }
}
