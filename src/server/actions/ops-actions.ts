"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { rethrowRedirect, type ActionState } from "@/server/actions/state";
import { BusinessError, publicMessage } from "@/server/errors";
import { confirmBankRow, importBankFile, skipBankRow } from "@/server/features/finance/bank-import-service";
import { grantCustomerCredit, issueCreditNote } from "@/server/features/finance/invoice-service";
import { refundPayment } from "@/server/features/finance/payment-service";
import {
  createDeliveryTask,
  setDeliveryStatus,
  setRouteStops,
  upsertRoute,
} from "@/server/features/delivery/delivery-service";
import {
  advanceBatchStage,
  createGrowthBatch,
  createInventoryCount,
  postInventoryCount,
  repotBatch,
  setCountQuantities,
} from "@/server/features/greenhouse/greenhouse-service";
import { transferStock } from "@/server/features/inventory/stock-service";
import { bookEvent, createCampaign, logCampaignTemplate, setCampaignActuals } from "@/server/features/marketing/marketing-service";
import {
  createGreeningProject,
  createMaintenanceFromProject,
  recordProjectExpense,
  setProjectStatus,
} from "@/server/features/projects/project-service";
import {
  addLandedCost,
  createPurchaseOrder,
  createSupplier,
  receivePurchase,
  submitPurchaseOrder,
  updatePurchaseOrder,
} from "@/server/features/purchase/purchase-service";
import { parseDocumentLines, returnSoldGoods } from "@/server/features/sales/order-service";
import { zonedDateTime } from "@/server/time";

function done(message: string, id?: string): ActionState {
  return { ok: true, message, id };
}

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const supplier = await createSupplier(actor, {
      name: String(formData.get("name") ?? ""),
      country: String(formData.get("country") ?? "GE"),
      currency: String(formData.get("currency") ?? "GEL"),
      contact: String(formData.get("contact") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    revalidatePath("/purchases");
    return done("მიმწოდებელი შენახულია", supplier.id);
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

function purchaseLines(formData: FormData) {
  return parseDocumentLines(String(formData.get("lines") ?? "")).map((line) => ({
    variantId: line.variantId ?? "",
    quantity: line.quantity,
    unitPrice: line.unitPrice ?? "0",
  }));
}

export async function createPurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const order = await createPurchaseOrder(actor, {
      supplierId: String(formData.get("supplierId") ?? ""),
      expectedOn: String(formData.get("expectedOn") ?? "") || undefined,
      notes: String(formData.get("notes") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      lines: purchaseLines(formData),
    });
    revalidatePath("/purchases");
    redirect(`/purchases/${order.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function updatePurchaseOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const orderId = String(formData.get("purchaseOrderId") ?? "");
    await updatePurchaseOrder(actor, orderId, {
      supplierId: String(formData.get("supplierId") ?? ""),
      expectedOn: String(formData.get("expectedOn") ?? "") || undefined,
      notes: String(formData.get("notes") ?? ""),
      lines: purchaseLines(formData),
    });
    revalidatePath(`/purchases/${orderId}`);
    redirect(`/purchases/${orderId}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function submitPurchaseAction(orderId: string): Promise<void> {
  const actor = await getActor();
  await submitPurchaseOrder(actor, orderId);
  revalidatePath(`/purchases/${orderId}`);
}

export async function receivePurchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const orderId = String(formData.get("purchaseOrderId") ?? "");
    await receivePurchase(actor, {
      purchaseOrderId: orderId,
      locationId: String(formData.get("locationId") ?? ""),
      receivedOn: String(formData.get("receivedOn") ?? "") || undefined,
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      lines: formData
        .getAll("purchaseLineId")
        .map((lineId, index) => ({ purchaseLineId: String(lineId), quantity: String(formData.getAll("quantity")[index] ?? "") })),
    });
    revalidatePath(`/purchases/${orderId}`);
    revalidatePath("/inventory");
    return done("მიღება გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function landedCostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const orderId = String(formData.get("purchaseOrderId") ?? "");
    const kind = String(formData.get("kind") ?? "actual");
    await addLandedCost(actor, {
      purchaseOrderId: orderId,
      kind: kind === "estimated" || kind === "late" ? kind : "actual",
      amount: String(formData.get("amount") ?? ""),
      currency: String(formData.get("currency") ?? "GEL"),
      fxRate: String(formData.get("fxRate") ?? "1"),
      note: String(formData.get("note") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath(`/purchases/${orderId}`);
    return done("Landed cost დაფიქსირდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createBatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const batch = await createGrowthBatch(actor, {
      variantId: String(formData.get("variantId") ?? ""),
      locationId: String(formData.get("locationId") ?? "") || undefined,
      supplierId: String(formData.get("supplierId") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? ""),
      expectedReadyOn: String(formData.get("expectedReadyOn") ?? "") || undefined,
      notes: String(formData.get("notes") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/greenhouse");
    redirect(`/greenhouse/${batch.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function advanceBatchAction(batchId: string, stage: "received" | "growing" | "ready" | "closed"): Promise<void> {
  const actor = await getActor();
  await advanceBatchStage(actor, batchId, stage);
  revalidatePath(`/greenhouse/${batchId}`);
}

export async function repotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await repotBatch(actor, {
      fromVariantId: String(formData.get("fromVariantId") ?? ""),
      toVariantId: String(formData.get("toVariantId") ?? ""),
      potVariantId: String(formData.get("potVariantId") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      plantQty: String(formData.get("plantQty") ?? ""),
      potQty: String(formData.get("potQty") ?? "1"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/greenhouse");
    revalidatePath("/inventory");
    return done("გადარგვა გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const count = await createInventoryCount(actor, {
      locationId: String(formData.get("locationId") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/inventory/count");
    redirect(`/inventory/count/${count.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function saveCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const countId = String(formData.get("countId") ?? "");
    const lineIds = formData.getAll("lineId").map(String);
    const qtys = formData.getAll("countedQty").map(String);
    await setCountQuantities(
      actor,
      countId,
      lineIds.map((lineId, index) => ({ lineId, countedQty: qtys[index] ?? "0" })),
    );
    revalidatePath(`/inventory/count/${countId}`);
    return done("ფაქტი შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function postCountAction(countId: string): Promise<void> {
  const actor = await getActor();
  await postInventoryCount(actor, countId);
  revalidatePath(`/inventory/count/${countId}`);
  revalidatePath("/inventory");
}

export async function transferStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await transferStock(actor, {
      variantId: String(formData.get("variantId") ?? ""),
      fromLocationId: String(formData.get("fromLocationId") ?? ""),
      toLocationId: String(formData.get("toLocationId") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/inventory");
    return done("გადატანა გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const project = await createGreeningProject(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      siteNotes: String(formData.get("siteNotes") ?? ""),
      lightNotes: String(formData.get("lightNotes") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      lines: [
        {
          kind: String(formData.get("kind") ?? "material"),
          description: String(formData.get("description") ?? ""),
          quantity: String(formData.get("quantity") ?? "1"),
          amount: String(formData.get("amount") ?? "0"),
        },
      ],
    });
    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function projectStatusAction(projectId: string, status: "quoted" | "in_progress" | "received" | "closed"): Promise<void> {
  const actor = await getActor();
  await setProjectStatus(actor, projectId, status);
  revalidatePath(`/projects/${projectId}`);
}

export async function projectExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const projectId = String(formData.get("projectId") ?? "");
    await recordProjectExpense(actor, {
      projectId,
      category: String(formData.get("category") ?? "greening"),
      amount: String(formData.get("amount") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath(`/projects/${projectId}`);
    return done("ფაქტობრივი ხარჯი დაფიქსირდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function projectMaintenanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const projectId = String(formData.get("projectId") ?? "");
    const contract = await createMaintenanceFromProject(actor, {
      projectId,
      startOn: String(formData.get("startOn") ?? ""),
      percent: String(formData.get("percent") ?? "") || undefined,
    });
    revalidatePath(`/projects/${projectId}`);
    redirect(`/maintenance/${contract.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createDeliveryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const sourceType = String(formData.get("sourceType") ?? "order");
    await createDeliveryTask(actor, {
      sourceType: sourceType === "rental" || sourceType === "replacement" || sourceType === "project" ? sourceType : "order",
      sourceId: String(formData.get("sourceId") ?? ""),
      customerId: String(formData.get("customerId") ?? "") || undefined,
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      mapsUrl: String(formData.get("mapsUrl") ?? ""),
      quantityNote: String(formData.get("quantityNote") ?? ""),
      instructions: String(formData.get("instructions") ?? ""),
      windowNote: String(formData.get("windowNote") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/delivery");
    return done("მიწოდების დავალება შეიქმნა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function deliveryStatusAction(taskId: string, status: "planned" | "scheduled" | "in_transit" | "done" | "failed"): Promise<void> {
  const actor = await getActor();
  await setDeliveryStatus(actor, taskId, status);
  revalidatePath("/delivery");
}

export async function saveRouteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const route = await upsertRoute(actor, {
      date: String(formData.get("date") ?? ""),
      driverId: String(formData.get("driverId") ?? "") || undefined,
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    const taskIds = formData.getAll("taskId").map(String).filter(Boolean);
    if (taskIds.length) await setRouteStops(actor, route.id, taskIds);
    revalidatePath("/delivery");
    return done("მარშრუტი შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function returnGoodsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const orderId = String(formData.get("orderId") ?? "");
    const condition = String(formData.get("condition") ?? "healthy") === "damaged" ? "damaged" : "healthy";
    await returnSoldGoods(actor, {
      orderId,
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      reason: String(formData.get("reason") ?? "დაბრუნება"),
      lines: [
        {
          orderLineId: String(formData.get("orderLineId") ?? ""),
          quantity: String(formData.get("quantity") ?? ""),
          condition,
        },
      ],
    });
    revalidatePath(`/sales/orders/${orderId}`);
    revalidatePath("/inventory");
    return done("დაბრუნება გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function creditNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await issueCreditNote(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      description: String(formData.get("description") ?? "კრედიტი"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/finance/invoices");
    return done("კრედიტ-ნოტა შეიქმნა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function customerCreditAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await grantCustomerCredit(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      reason: String(formData.get("reason") ?? "კრედიტი"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    return done("კრედიტი დაერიცხა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function refundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await refundPayment(actor, {
      paymentId: String(formData.get("paymentId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      paidOn: String(formData.get("paidOn") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/finance/invoices");
    return done("თანხა დაბრუნდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function bankImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new BusinessError("ფაილი ატვირთეთ", "validation");
    const batch = await importBankFile(actor, {
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      mapping: {
        date: String(formData.get("dateColumn") ?? "date"),
        amount: String(formData.get("amountColumn") ?? "amount"),
        purpose: String(formData.get("purposeColumn") ?? "purpose"),
        reference: String(formData.get("referenceColumn") ?? "") || undefined,
      },
    });
    revalidatePath("/finance/bank");
    redirect(`/finance/bank/${batch.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function confirmBankRowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await confirmBankRow(actor, {
      rowId: String(formData.get("rowId") ?? ""),
      customerId: String(formData.get("customerId") ?? ""),
      invoiceId: String(formData.get("invoiceId") ?? "") || undefined,
    });
    revalidatePath("/finance/bank");
    return done("გადახდა დადასტურდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function skipBankRowAction(rowId: string): Promise<void> {
  const actor = await getActor();
  await skipBankRow(actor, rowId);
  revalidatePath("/finance/bank");
}

export async function createCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await createCampaign(actor, {
      name: String(formData.get("name") ?? ""),
      goal: String(formData.get("goal") ?? ""),
      startOn: String(formData.get("startOn") ?? ""),
      endOn: String(formData.get("endOn") ?? ""),
      budgetAmount: String(formData.get("budgetAmount") ?? "0"),
      notes: String(formData.get("notes") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/marketing");
    return done("კამპანია შეიქმნა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function campaignActualsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await setCampaignActuals(actor, {
      campaignId: String(formData.get("campaignId") ?? ""),
      spendAmount: String(formData.get("spendAmount") ?? ""),
      attributedRevenue: String(formData.get("attributedRevenue") ?? ""),
    });
    revalidatePath("/marketing");
    return done("ფაქტი შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function templateLogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await logCampaignTemplate(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    return done("შაბლონი კომუნიკაციის ჟურნალშია. მასობრივი გაგზავნა გამორთულია.");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function bookEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await bookEvent(actor, {
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? "other"),
      customerId: String(formData.get("customerId") ?? "") || undefined,
      resourceId: String(formData.get("resourceId") ?? ""),
      startsAt: zonedDateTime(String(formData.get("date") ?? ""), String(formData.get("startTime") ?? "13:00")),
      endsAt: zonedDateTime(String(formData.get("date") ?? ""), String(formData.get("endTime") ?? "16:00")),
      guestCount: String(formData.get("guestCount") ?? "0"),
      budgetAmount: String(formData.get("budgetAmount") ?? "0"),
      sponsorAmount: String(formData.get("sponsorAmount") ?? "0"),
      ticketAmount: String(formData.get("ticketAmount") ?? "0"),
      staffUserIds: formData.getAll("staffUserId").map(String).filter(Boolean),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    revalidatePath("/events");
    return done("ღონისძიება ჩაიწერა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}
