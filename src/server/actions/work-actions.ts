"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { addCustomerFiles, deleteCustomerFile } from "@/server/features/crm/customer-files";
import { addPlaceTerm, deletePlaceTerm } from "@/server/features/crm/place-terms";
import { setMemberRole } from "@/server/features/admin/team-service";
import { addActivity, addAddress, addContact, cancelTask, completeAssignment, createCustomer, createTask, reopenTask, rescheduleTask, setTaskStatus, updateCustomer } from "@/server/features/crm/customer-service";
import { bookExcursion, cancelExcursion, completeExcursion, rescheduleExcursion, rescheduleExcursionToDate } from "@/server/features/excursions/excursion-service";
import { createInvoiceFromOrder, createInvoiceFromRental } from "@/server/features/finance/invoice-service";
import { recordPayment } from "@/server/features/finance/payment-service";
import { confirmOpeningStock, confirmCustomerImport, dryRunCustomers, dryRunOpeningStock, dryRunProducts } from "@/server/features/import/import-service";
import { postOpeningStock } from "@/server/features/inventory/stock-service";
import { amendContract, billMaintenancePeriod, createMaintenanceContract, replaceCoveredPlant, setContractStatus } from "@/server/features/maintenance/maintenance-service";
import { bookRental, createRentalAsset, deliverRental, returnRentalAssets } from "@/server/features/rental/rental-service";
import { cancelOrder, confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder } from "@/server/features/sales/order-service";
import { BusinessError, publicMessage } from "@/server/errors";
import { getDb } from "@/server/db";
import { rethrowRedirect, type ActionState } from "@/server/actions/state";
import { zonedDateTime } from "@/server/time";

function done(message: string, id?: string): ActionState {
  return { ok: true, message, id };
}

export async function createCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const customer = await createCustomer(actor, {
      kind: String(formData.get("kind")) === "person" ? "person" : "company",
      name: String(formData.get("name") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      directorName: String(formData.get("directorName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      identificationCode: String(formData.get("identificationCode") ?? ""),
      segment: String(formData.get("segment") ?? "other"),
      relationshipStatus: String(formData.get("relationshipStatus") ?? "fresh"),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      district: String(formData.get("district") ?? ""),
      venueType: String(formData.get("venueType") ?? ""),
      website: String(formData.get("website") ?? ""),
      mapsUrl: String(formData.get("mapsUrl") ?? ""),
      source: String(formData.get("source") ?? ""),
      priority: String(formData.get("priority") ?? ""),
      verification: String(formData.get("verification") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      nextContactOn: String(formData.get("nextContactOn") ?? "") || undefined,
      confirmDuplicate: formData.get("confirmDuplicate") === "yes",
    });
    revalidatePath("/crm/customers");
    redirect(`/crm/customers/${customer.id}`);
  } catch (error) {
    rethrowRedirect(error);
    if (error instanceof BusinessError && error.code === "duplicate") {
      return { ok: false, message: `${error.message}. დუბლიკატის მიუხედავად შესაქმნელად მონიშნეთ დადასტურება.` };
    }
    return { ok: false, message: publicMessage(error) };
  }
}

export async function updateCustomerAction(customerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await updateCustomer(actor, customerId, {
      kind: String(formData.get("kind")) === "person" ? "person" : "company",
      name: String(formData.get("name") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      directorName: String(formData.get("directorName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      identificationCode: String(formData.get("identificationCode") ?? ""),
      segment: String(formData.get("segment") ?? "other"),
      relationshipStatus: String(formData.get("relationshipStatus") ?? "fresh"),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      district: String(formData.get("district") ?? ""),
      venueType: String(formData.get("venueType") ?? ""),
      website: String(formData.get("website") ?? ""),
      mapsUrl: String(formData.get("mapsUrl") ?? ""),
      source: String(formData.get("source") ?? ""),
      priority: String(formData.get("priority") ?? ""),
      verification: String(formData.get("verification") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      nextContactOn: String(formData.get("nextContactOn") ?? "") || undefined,
      doNotContact: formData.get("doNotContact") === "yes",
      confirmDuplicate: formData.get("confirmDuplicate") === "yes",
    });
    revalidatePath("/crm/customers");
    revalidatePath(`/crm/customers/${customerId}`);
    redirect(`/crm/customers/${customerId}`);
  } catch (error) {
    rethrowRedirect(error);
    if (error instanceof BusinessError && error.code === "duplicate") {
      return { ok: false, message: `${error.message}. დუბლიკატის მიუხედავად შესანახად მონიშნეთ დადასტურება.` };
    }
    return { ok: false, message: publicMessage(error) };
  }
}

export async function addPlaceTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await addPlaceTerm(
      actor,
      String(formData.get("kind") ?? ""),
      String(formData.get("name") ?? ""),
      String(formData.get("code") ?? ""),
    );
    revalidatePath("/settings");
    revalidatePath("/crm/customers");
    revalidatePath("/crm/customers/new");
    return done("ჩანაწერი დაემატა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function deletePlaceTermAction(id: string) {
  const actor = await getActor();
  await deletePlaceTerm(actor, id);
  revalidatePath("/settings");
  revalidatePath("/crm/customers");
  revalidatePath("/crm/customers/new");
}

export async function addContactAction(customerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await addContact(actor, {
      customerId,
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      title: String(formData.get("title") ?? ""),
      isPrimary: formData.get("isPrimary") === "yes",
    });
    revalidatePath(`/crm/customers/${customerId}`);
    return done("კონტაქტი დაემატა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function addAddressAction(customerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await addAddress(actor, {
      customerId,
      label: String(formData.get("label") ?? ""),
      line1: String(formData.get("line1") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      district: String(formData.get("district") ?? ""),
    });
    revalidatePath(`/crm/customers/${customerId}`);
    return done("მისამართი დაემატა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

async function uploadedFiles(formData: FormData) {
  return Promise.all(
    formData.getAll("files").flatMap((entry) => {
      if (!(entry instanceof File) || entry.size === 0) return [];
      return [entry.arrayBuffer().then((buffer) => ({ name: entry.name, bytes: Buffer.from(buffer) }))];
    }),
  );
}

export async function addCustomerFilesAction(customerId: string, kind: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await addCustomerFiles(actor, { customerId, kind, files: await uploadedFiles(formData) });
    revalidatePath(`/crm/customers/${customerId}`);
    return done(kind === "contract" ? "ხელშეკრულება აიტვირთა" : "სურათი აიტვირთა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function deleteCustomerFileAction(customerId: string, fileId: string) {
  const actor = await getActor();
  await deleteCustomerFile(actor, fileId);
  revalidatePath(`/crm/customers/${customerId}`);
}

export async function addActivityAction(customerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await addActivity(actor, { customerId, type: "call", result: String(formData.get("result") ?? ""), body: String(formData.get("body") ?? "") });
    revalidatePath(`/crm/customers/${customerId}`);
    return done("ზარი ჩაიწერა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const files = await Promise.all(
      formData.getAll("files").flatMap((entry) => {
        if (!(entry instanceof File) || entry.size === 0) return [];
        return [entry.arrayBuffer().then((buffer) => ({ name: entry.name, bytes: Buffer.from(buffer) }))];
      }),
    );
    const task = await createTask(actor, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      dueOn: String(formData.get("dueOn") ?? "") || undefined,
      customerId: String(formData.get("customerId") ?? "") || undefined,
      assigneeIds: formData.getAll("assigneeIds").map(String),
      files,
    });
    revalidatePath("/work");
    revalidatePath("/calendar");
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    return done("დავალება შეიქმნა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

async function refreshTask(task: { id: string; customerId: string | null }) {
  revalidatePath("/work");
  revalidatePath(`/work/${task.id}`);
  revalidatePath("/calendar");
  if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
}

export async function setTaskStatusAction(taskId: string, status: "open" | "doing" | "done"): Promise<void> {
  const actor = await getActor();
  const task = await setTaskStatus(actor, taskId, status);
  await refreshTask(task);
}

export async function completeAssignmentAction(taskId: string): Promise<void> {
  const actor = await getActor();
  const task = await completeAssignment(actor, taskId);
  await refreshTask(task);
}

export async function cancelTaskAction(taskId: string): Promise<void> {
  const actor = await getActor();
  const task = await cancelTask(actor, taskId);
  await refreshTask(task);
}

export async function reopenTaskAction(taskId: string): Promise<void> {
  const actor = await getActor();
  const task = await reopenTask(actor, taskId);
  await refreshTask(task);
}

export async function rescheduleTaskAction(taskId: string, dueOn: string | null): Promise<void> {
  const actor = await getActor();
  await rescheduleTask(actor, taskId, dueOn);
  revalidatePath("/calendar");
  revalidatePath("/work");
}

export async function createVariantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const variant = await createVariant(actor, {
      category: String(formData.get("category") ?? "plant"),
      productName: String(formData.get("productName") ?? ""),
      speciesId: String(formData.get("speciesId") ?? "") || undefined,
      sku: String(formData.get("sku") ?? ""),
      variantName: String(formData.get("variantName") ?? ""),
      listPrice: String(formData.get("listPrice") ?? "0"),
      potVolumeLiters: String(formData.get("potVolumeLiters") ?? "") || undefined,
      careNotes: String(formData.get("careNotes") ?? "") || undefined,
    });
    revalidatePath("/products");
    redirect(`/products?created=${variant.sku}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function openingStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await postOpeningStock(actor, {
      variantId: String(formData.get("variantId") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      unitCost: String(formData.get("unitCost") ?? "0"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      reason: "ხელით შეტანილი საწყისი ნაშთი",
    });
    revalidatePath("/inventory");
    return done("ნაშთი გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const rawLines = String(formData.get("lines") ?? "");
    const { parseDocumentLines } = await import("@/server/features/sales/order-service");
    const quote = await createQuote(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      lines: rawLines
        ? parseDocumentLines(rawLines)
        : [
            {
              variantId: String(formData.get("variantId") ?? ""),
              quantity: String(formData.get("quantity") ?? ""),
              unitPrice: String(formData.get("unitPrice") ?? "") || undefined,
              discountAmount: String(formData.get("discountAmount") ?? "0"),
            },
          ],
    });
    redirect(`/sales/quotes/${quote.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function convertQuoteAction(quoteId: string): Promise<void> {
  const actor = await getActor();
  const order = await convertQuoteToOrder(actor, quoteId);
  redirect(`/sales/orders/${order.id}`);
}

export async function confirmOrderAction(orderId: string): Promise<void> {
  const actor = await getActor();
  await confirmOrder(actor, orderId);
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function fulfillOrderAction(orderId: string): Promise<void> {
  const actor = await getActor();
  await fulfillOrder(actor, orderId);
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function cancelOrderAction(orderId: string): Promise<void> {
  const actor = await getActor();
  await cancelOrder(actor, orderId);
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function invoiceOrderAction(orderId: string): Promise<void> {
  const actor = await getActor();
  const invoice = await createInvoiceFromOrder(actor, orderId);
  redirect(`/finance/invoices/${invoice.id}`);
}

export async function invoiceRentalAction(bookingId: string): Promise<void> {
  const actor = await getActor();
  const invoice = await createInvoiceFromRental(actor, bookingId);
  redirect(`/finance/invoices/${invoice.id}`);
}

export async function paymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const method = String(formData.get("method") ?? "");
    if (!["cash", "bank", "online"].includes(method)) {
      throw new BusinessError("გადახდის მეთოდი არასწორია", "validation");
    }
    const invoice = await getDb().invoice.findFirstOrThrow({ where: { id: invoiceId, organizationId: actor.organizationId } });
    await recordPayment(actor, {
      customerId: invoice.customerId,
      amount: String(formData.get("amount") ?? ""),
      method,
      paidOn: String(formData.get("paidOn") ?? ""),
      postingKey: String(formData.get("postingKey") ?? ""),
      allocations: [{ invoiceId, amount: String(formData.get("amount") ?? "") }],
    });
    revalidatePath(`/finance/invoices/${invoiceId}`);
    return done("გადახდა დაფიქსირდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function bookRentalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const rawLines = String(formData.get("lines") ?? "");
    const { parseDocumentLines } = await import("@/server/features/sales/order-service");
    const priced = rawLines ? parseDocumentLines(rawLines) : [];
    const booking = await bookRental(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      assetIds: priced.length ? priced.map((line) => line.variantId) : [String(formData.get("assetId") ?? "")],
      lines: priced.length ? priced.map((line) => ({ assetId: line.variantId, unitPrice: line.unitPrice ?? "0" })) : undefined,
      startOn: String(formData.get("startOn") ?? ""),
      endOn: String(formData.get("endOn") ?? ""),
      priceModel: priced.length ? "line" : "fixed_total",
      total: priced.length ? undefined : String(formData.get("total") ?? ""),
      depositAmount: String(formData.get("depositAmount") ?? "0"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    redirect(`/rental/${booking.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function createAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await createRentalAsset(actor, { variantId: String(formData.get("variantId") ?? ""), code: String(formData.get("code") ?? "") });
    revalidatePath("/rental");
    return done("გასაქირავებელი მცენარე შეიქმნა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function deliverRentalAction(bookingId: string): Promise<void> {
  const actor = await getActor();
  await deliverRental(actor, bookingId);
  revalidatePath(`/rental/${bookingId}`);
}

export async function returnRentalAction(bookingId: string, assetId: string, condition: "healthy" | "damaged"): Promise<void> {
  const actor = await getActor();
  await returnRentalAssets(actor, { bookingId, assets: [{ assetId, condition }] });
  revalidatePath(`/rental/${bookingId}`);
}

export async function createContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const contract = await createMaintenanceContract(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      percent: String(formData.get("percent") ?? "10"),
      startOn: String(formData.get("startOn") ?? ""),
      lines: [
        {
          description: String(formData.get("description") ?? "მცენარე"),
          quantity: String(formData.get("quantity") ?? "1"),
          referenceUnitPrice: String(formData.get("referenceUnitPrice") ?? "0"),
        },
      ],
    });
    redirect(`/maintenance/${contract.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function activateContractAction(contractId: string): Promise<void> {
  const actor = await getActor();
  await setContractStatus(actor, contractId, "active");
  revalidatePath(`/maintenance/${contractId}`);
}

export async function billContractAction(contractId: string, month: string): Promise<void> {
  const actor = await getActor();
  await billMaintenancePeriod(actor, contractId, month);
  revalidatePath(`/maintenance/${contractId}`);
}

export async function amendContractAction(contractId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await amendContract(actor, contractId, {
      effectiveOn: String(formData.get("effectiveOn") ?? ""),
      percent: String(formData.get("percent") ?? ""),
      note: String(formData.get("note") ?? "პროცენტის ცვლილება"),
    });
    return done("ცვლილება შენახულია მომავალი პერიოდისთვის");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function replacePlantAction(plantId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await replaceCoveredPlant(actor, {
      customerPlantId: plantId,
      variantId: String(formData.get("variantId") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
    });
    return done("ჩანაცვლება გაიტარა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function bookExcursionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const date = String(formData.get("date") ?? "");
    const booking = await bookExcursion(actor, {
      customerId: String(formData.get("customerId") ?? ""),
      resourceId: String(formData.get("resourceId") ?? ""),
      startsAt: zonedDateTime(date, String(formData.get("startTime") ?? "10:00")),
      endsAt: zonedDateTime(date, String(formData.get("endTime") ?? "12:00")),
      plannedChildren: Number(formData.get("plannedChildren") ?? 1),
      note: String(formData.get("note") ?? ""),
      price: String(formData.get("price") ?? "0"),
      postingKey: String(formData.get("postingKey") ?? crypto.randomUUID()),
      windowException: formData.get("windowException") === "yes",
    });
    redirect(`/excursions/${booking.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
}

export async function rescheduleExcursionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const bookingId = String(formData.get("bookingId") ?? "");
    const date = String(formData.get("date") ?? "");
    await rescheduleExcursion(actor, bookingId, {
      startsAt: zonedDateTime(date, String(formData.get("startTime") ?? "10:00")),
      endsAt: zonedDateTime(date, String(formData.get("endTime") ?? "12:00")),
    });
    revalidatePath(`/excursions/${bookingId}`);
    revalidatePath("/excursions");
    revalidatePath("/calendar");
    return done("\u10d7\u10d0\u10e0\u10d8\u10e6\u10d8 \u10e8\u10d4\u10d8\u10ea\u10d5\u10d0\u10da\u10d0");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function rescheduleExcursionDayAction(bookingId: string, date: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const actor = await getActor();
    await rescheduleExcursionToDate(actor, bookingId, date);
    revalidatePath("/calendar");
    revalidatePath("/excursions");
    revalidatePath(`/excursions/${bookingId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function cancelExcursionAction(bookingId: string): Promise<void> {
  const actor = await getActor();
  await cancelExcursion(actor, bookingId);
  revalidatePath(`/excursions/${bookingId}`);
  revalidatePath("/excursions");
  revalidatePath("/calendar");
}

export async function completeExcursionAction(bookingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await completeExcursion(actor, bookingId, Number(formData.get("attended") ?? 0));
    revalidatePath(`/excursions/${bookingId}`);
    return done("ექსკურსია დასრულდა");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function importPreviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "customers");
    if (!(file instanceof File)) throw new BusinessError("ფაილი ატვირთეთ", "validation");
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = kind === "products" ? await dryRunProducts(actor, buffer) : kind === "opening" ? await dryRunOpeningStock(actor, buffer) : await dryRunCustomers(actor, buffer);
    return done(rows.map((row) => `${row.rowNumber}: ${row.status} ${row.message ?? ""}`).join(" | ") || "ცარიელი ფაილია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function importCustomersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new BusinessError("ფაილი ატვირთეთ", "validation");
    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = String(formData.get("kind") ?? "customers");
    if (kind === "opening") {
      const result = await confirmOpeningStock(actor, buffer);
      return done(result.created ? "საწყისი ნაშთი გაიტარა" : "ეს ფაილი უკვე გატარებულია");
    }
    const result = await confirmCustomerImport(actor, buffer);
    return done(result.created ? "კლიენტები შემოვიდა" : "ეს ფაილი უკვე გატარებულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function saveOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    if (!actor.permissions.has("admin.users")) throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
    await getDb().organization.update({
      where: { id: actor.organizationId },
      data: {
        legalName: String(formData.get("legalName") ?? ""),
        identificationCode: String(formData.get("identificationCode") ?? ""),
        address: String(formData.get("address") ?? ""),
        bankName: String(formData.get("bankName") ?? ""),
        iban: String(formData.get("iban") ?? ""),
        directorName: String(formData.get("directorName") ?? ""),
        autoInvoiceAfterWaybill: formData.get("autoInvoiceAfterWaybill") === "on",
      },
    });
    revalidatePath("/settings");
    return done("რეკვიზიტები შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function setMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await setMemberRole(actor, String(formData.get("membershipId") ?? ""), String(formData.get("roleId") ?? ""));
    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/reports");
    return done("როლი შენახულია");
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}
