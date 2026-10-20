"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { rethrowRedirect, type ActionState } from "@/server/actions/state";

function done(message: string): ActionState {
  return { ok: true, message };
}
import { BusinessError, publicMessage } from "@/server/errors";
import { parseDocumentLines } from "@/server/features/sales/order-service";
import {
  completeInternalShipment,
  completeSale,
  readTransport,
  retryInternalUpload,
  retrySaleUpload,
  saveRsCredentials,
  type TransportInput,
} from "@/server/features/integrations/waybill-service";

function transportFrom(formData: FormData): TransportInput {
  const type = Number(formData.get("waybillType") ?? 2);
  return readTransport({
    waybillType: type === 1 || type === 3 ? type : 2,
    driverTin: String(formData.get("driverTin") ?? ""),
    driverName: String(formData.get("driverName") ?? ""),
    carNumber: String(formData.get("carNumber") ?? ""),
    transportText: String(formData.get("transportText") ?? ""),
    startAddress: String(formData.get("startAddress") ?? ""),
    endAddress: String(formData.get("endAddress") ?? ""),
    beginOn: String(formData.get("beginOn") ?? ""),
  });
}

function invoiceChecked(formData: FormData): boolean {
  return formData.get("createInvoice") === "on";
}

export async function completeSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  try {
    const actor = await getActor();
    const result = await completeSale(actor, { ...transportFrom(formData), orderId, createInvoice: invoiceChecked(formData) });
    revalidatePath(`/sales/orders/${orderId}`);
    if (!result.ok) return { ok: false, message: result.message };
    return done(`ზედნადები ${result.number}`);
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function retrySaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  try {
    const actor = await getActor();
    const result = await retrySaleUpload(actor, { ...transportFrom(formData), orderId, createInvoice: invoiceChecked(formData) });
    revalidatePath(`/sales/orders/${orderId}`);
    if (!result.ok) return { ok: false, message: result.message };
    return done(`ზედნადები ${result.number}`);
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function completeInternalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const lines = parseDocumentLines(String(formData.get("lines") ?? "")).map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
    }));
    const result = await completeInternalShipment(actor, {
      ...transportFrom(formData),
      waybillType: 1,
      fromLocationId: String(formData.get("fromLocationId") ?? ""),
      toLocationId: String(formData.get("toLocationId") ?? ""),
      postingKey: String(formData.get("postingKey") ?? ""),
      lines,
    });
    revalidatePath("/inventory/waybill");
    if (!result.ok) return { ok: false, message: result.message };
    return done(`შიდა გადაზიდვა ${result.number}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function retryInternalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const shipmentId = String(formData.get("shipmentId") ?? "");
  try {
    const actor = await getActor();
    const result = await retryInternalUpload(actor, shipmentId, { ...transportFrom(formData), waybillType: 1 });
    revalidatePath(`/inventory/waybill/${shipmentId}`);
    if (!result.ok) return { ok: false, message: result.message };
    return done(`შიდა გადაზიდვა ${result.number}`);
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function saveRsCredentialsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await saveRsCredentials(actor, {
      su: String(formData.get("rsUser") ?? ""),
      sp: String(formData.get("rsPassword") ?? ""),
      clear: formData.get("clearRs") === "on",
    });
    revalidatePath("/settings");
    return done("RS სერვისი შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createSalesOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const { createSalesOrder, parseDocumentLines: parseLines } = await import("@/server/features/sales/order-service");
    const order = await createSalesOrder(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      postingKey: String(formData.get("postingKey") ?? ""),
      lines: parseLines(String(formData.get("lines") ?? "")),
    });
    redirect(`/sales/orders/${order.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function updateOpenOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  try {
    const actor = await getActor();
    const { updateOpenOrder, parseDocumentLines: parseLines } = await import("@/server/features/sales/order-service");
    if (!orderId) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "validation");
    await updateOpenOrder(actor, orderId, {
      customerId: String(formData.get("customerId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      lines: parseLines(String(formData.get("lines") ?? "")),
    });
    revalidatePath(`/sales/orders/${orderId}`);
    return done("შეკვეთა განახლდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}
