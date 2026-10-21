import { isMasterAdmin, type Actor } from "@/server/auth/permissions";
import { verifyPassword } from "@/server/auth/password";
import { getDb, type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { ADMIN_COPY } from "@/server/features/admin/admin-copy";
import { seedPlaceTerms } from "@/server/features/crm/place-terms";
import { ensureTeamThread } from "@/server/features/chat/chat-service";
import { provisionOrganization } from "@/server/org";

export const PURGE_GROUPS = [
  "customers",
  "tasks",
  "sales",
  "finance",
  "catalog",
  "places",
  "stock",
  "purchases",
  "operations",
  "marketing",
  "chat",
  "sequences",
] as const;

export type PurgeGroup = (typeof PURGE_GROUPS)[number];

function requireMasterAdmin(actor: Actor) {
  if (!isMasterAdmin(actor)) throw new BusinessError(ADMIN_COPY.purgeForbidden, "forbidden");
}

export async function countPurgeGroups(actor: Actor): Promise<Record<PurgeGroup, number>> {
  requireMasterAdmin(actor);
  const db = getDb();
  const org = { organizationId: actor.organizationId };
  const [
    customers,
    tasks,
    quotes,
    orders,
    invoices,
    payments,
    expenses,
    products,
    places,
    stock,
    purchases,
    rentals,
    contracts,
    excursions,
    events,
    deliveries,
    batches,
    projects,
    campaigns,
    chats,
    sequences,
  ] = await Promise.all([
    db.customer.count({ where: org }),
    db.task.count({ where: org }),
    db.quote.count({ where: org }),
    db.salesOrder.count({ where: org }),
    db.invoice.count({ where: org }),
    db.payment.count({ where: org }),
    db.expense.count({ where: org }),
    db.product.count({ where: org }),
    db.placeTerm.count({ where: org }),
    db.stockBalance.count({ where: org }),
    db.purchaseOrder.count({ where: org }),
    db.rentalBooking.count({ where: org }),
    db.maintenanceContract.count({ where: org }),
    db.excursionBooking.count({ where: org }),
    db.eventBooking.count({ where: org }),
    db.deliveryTask.count({ where: org }),
    db.growthBatch.count({ where: org }),
    db.greeningProject.count({ where: org }),
    db.campaign.count({ where: org }),
    db.chatThread.count({ where: org }),
    db.documentSequence.count({ where: org }),
  ]);
  return {
    customers,
    tasks,
    sales: quotes + orders,
    finance: invoices + payments + expenses,
    catalog: products,
    places,
    stock,
    purchases,
    operations: rentals + contracts + excursions + events + deliveries + batches + projects,
    marketing: campaigns,
    chat: chats,
    sequences,
  };
}

export async function purgeMasterData(
  actor: Actor,
  input: { groups: string[]; password: string; confirm: string },
) {
  requireMasterAdmin(actor);
  if (input.confirm.trim() !== ADMIN_COPY.purgeConfirmValue) {
    throw new BusinessError(ADMIN_COPY.purgeNeedConfirm, "validation");
  }
  const user = await getDb().user.findUniqueOrThrow({ where: { id: actor.userId } });
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) throw new BusinessError(ADMIN_COPY.purgeNeedPassword, "auth");
  const groups = new Set(PURGE_GROUPS.filter((group) => input.groups.includes(group)));
  if (groups.size === 0) throw new BusinessError(ADMIN_COPY.purgeNeedConfirm, "validation");
  await assertDependencies(actor.organizationId, groups);
  const db = getDb();
  await db.$transaction(
    async (tx) => {
      if (groups.has("chat")) await purgeChat(tx, actor.organizationId);
      if (groups.has("tasks")) await purgeTasks(tx, actor.organizationId);
      if (groups.has("operations")) await purgeOperations(tx, actor.organizationId);
      if (groups.has("finance")) await purgeFinance(tx, actor.organizationId);
      if (groups.has("sales")) await purgeSales(tx, actor.organizationId);
      if (groups.has("stock")) await purgeStock(tx, actor.organizationId);
      if (groups.has("purchases")) await purgePurchases(tx, actor.organizationId);
      if (groups.has("catalog")) await purgeCatalog(tx, actor.organizationId);
      if (groups.has("places")) await tx.placeTerm.deleteMany({ where: { organizationId: actor.organizationId } });
      if (groups.has("customers")) await purgeCustomers(tx, actor.organizationId);
      if (groups.has("marketing")) await tx.campaign.deleteMany({ where: { organizationId: actor.organizationId } });
      if (groups.has("sequences")) await tx.documentSequence.deleteMany({ where: { organizationId: actor.organizationId } });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: "master.purge",
          entityType: "organization",
          entityId: actor.organizationId,
          after: { groups: [...groups] },
        },
      });
      if (groups.has("catalog") || groups.has("places")) {
        await provisionOrganization(tx, actor.organizationId);
      }
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 60_000 },
  );
  if (groups.has("places") && !groups.has("catalog")) {
    await getDb().$transaction((tx) => seedPlaceTerms(tx, actor.organizationId));
  }
  if (groups.has("chat")) await ensureTeamThread(actor);
}

async function assertDependencies(organizationId: string, groups: Set<PurgeGroup>) {
  const db = getDb();
  const org = { organizationId };
  if (groups.has("customers") && !groups.has("sales")) {
    const blockers = (await db.quote.count({ where: org })) + (await db.salesOrder.count({ where: org }));
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ გაყიდვა", "validation");
  }
  if (groups.has("customers") && !groups.has("finance")) {
    const blockers = (await db.invoice.count({ where: org })) + (await db.payment.count({ where: org }));
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ ფინანსები", "validation");
  }
  if (groups.has("customers") && !groups.has("operations")) {
    const blockers =
      (await db.rentalBooking.count({ where: org })) +
      (await db.maintenanceContract.count({ where: org })) +
      (await db.excursionBooking.count({ where: org })) +
      (await db.eventBooking.count({ where: { ...org, customerId: { not: null } } })) +
      (await db.deliveryTask.count({ where: org })) +
      (await db.greeningProject.count({ where: org }));
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ ოპერაციები", "validation");
  }
  if (groups.has("sales") && !groups.has("finance")) {
    const blockers = await db.invoice.count({ where: { ...org, orderId: { not: null } } });
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ ფინანსები", "validation");
  }
  if (groups.has("catalog") && !groups.has("stock")) {
    const blockers = await db.stockBalance.count({ where: org });
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ მარაგი", "validation");
  }
  if (groups.has("catalog") && !groups.has("sales")) {
    const blockers = await db.quoteLine.count({ where: { quote: org } });
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ გაყიდვა", "validation");
  }
  if (groups.has("purchases") && !groups.has("operations")) {
    const blockers = await db.growthBatch.count({ where: { ...org, supplierId: { not: null } } });
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ ოპერაციები", "validation");
  }
  if (groups.has("catalog") && !groups.has("operations")) {
    const blockers = await db.growthBatch.count({ where: org });
    if (blockers) throw new BusinessError("ჯერ აირჩიეთ ოპერაციები", "validation");
  }
}

async function purgeChat(tx: Tx, organizationId: string) {
  const threads = await tx.chatThread.findMany({ where: { organizationId }, select: { id: true } });
  const ids = threads.map((item) => item.id);
  if (ids.length) {
    await tx.chatMessage.deleteMany({ where: { threadId: { in: ids } } });
    await tx.chatParticipant.deleteMany({ where: { threadId: { in: ids } } });
    await tx.chatThread.deleteMany({ where: { organizationId } });
  }
}

async function purgeTasks(tx: Tx, organizationId: string) {
  const tasks = await tx.task.findMany({ where: { organizationId }, select: { id: true } });
  const ids = tasks.map((item) => item.id);
  if (ids.length) {
    await tx.calendarSyncLink.deleteMany({ where: { taskId: { in: ids } } });
    await tx.taskAttachment.deleteMany({ where: { taskId: { in: ids } } });
    await tx.taskAssignment.deleteMany({ where: { taskId: { in: ids } } });
    await tx.task.deleteMany({ where: { organizationId } });
  }
  await tx.outboxEvent.deleteMany({
    where: { organizationId, type: { startsWith: "microsoft." } },
  });
  const taskThreads = await tx.chatThread.findMany({
    where: { organizationId, kind: "task" },
    select: { id: true },
  });
  if (taskThreads.length) {
    const ids = taskThreads.map((item) => item.id);
    await tx.chatMessage.deleteMany({ where: { threadId: { in: ids } } });
    await tx.chatParticipant.deleteMany({ where: { threadId: { in: ids } } });
    await tx.chatThread.deleteMany({ where: { id: { in: ids } } });
  }
}

async function purgeOperations(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const routes = await tx.route.findMany({ where: org, select: { id: true } });
  if (routes.length) await tx.routeStop.deleteMany({ where: { routeId: { in: routes.map((item) => item.id) } } });
  await tx.route.deleteMany({ where: org });
  await tx.deliveryTask.deleteMany({ where: org });
  const projects = await tx.greeningProject.findMany({ where: org, select: { id: true } });
  if (projects.length) {
    await tx.greeningProjectLine.deleteMany({ where: { projectId: { in: projects.map((item) => item.id) } } });
  }
  await tx.greeningProject.deleteMany({ where: org });
  await tx.greenhouseTask.deleteMany({ where: org });
  await tx.growthBatch.deleteMany({ where: org });
  const events = await tx.eventBooking.findMany({ where: org, select: { id: true } });
  const excursions = await tx.excursionBooking.findMany({ where: org, select: { id: true } });
  const eventIds = events.map((item) => item.id);
  const excursionIds = excursions.map((item) => item.id);
  if (eventIds.length) {
    await tx.staffAssignment.deleteMany({ where: { eventBookingId: { in: eventIds } } });
    await tx.resourceReservation.deleteMany({ where: { eventBookingId: { in: eventIds } } });
  }
  if (excursionIds.length) {
    await tx.staffAssignment.deleteMany({ where: { bookingId: { in: excursionIds } } });
    await tx.materialUsage.deleteMany({ where: { bookingId: { in: excursionIds } } });
    await tx.resourceReservation.deleteMany({ where: { bookingId: { in: excursionIds } } });
  }
  await tx.eventBooking.deleteMany({ where: org });
  await tx.excursionBooking.deleteMany({ where: org });
  const programs = await tx.excursionProgram.findMany({ where: org, select: { id: true } });
  if (programs.length) {
    await tx.excursionProgramMaterial.deleteMany({ where: { programId: { in: programs.map((item) => item.id) } } });
  }
  await tx.excursionProgram.deleteMany({ where: org });
  const plants = await tx.customerPlant.findMany({ where: org, select: { id: true } });
  if (plants.length) await tx.replacementCase.deleteMany({ where: { customerPlantId: { in: plants.map((item) => item.id) } } });
  await tx.customerPlant.deleteMany({ where: org });
  const contracts = await tx.maintenanceContract.findMany({ where: org, select: { id: true } });
  if (contracts.length) {
    const ids = contracts.map((item) => item.id);
    await tx.contractAmendment.deleteMany({ where: { contractId: { in: ids } } });
    await tx.contractPlantLine.deleteMany({ where: { contractId: { in: ids } } });
  }
  await tx.maintenanceContract.deleteMany({ where: org });
  const bookings = await tx.rentalBooking.findMany({ where: org, select: { id: true } });
  if (bookings.length) {
    await tx.rentalBookingLine.deleteMany({ where: { bookingId: { in: bookings.map((item) => item.id) } } });
    await tx.assetReservation.deleteMany({ where: { bookingId: { in: bookings.map((item) => item.id) } } });
  }
  await tx.rentalBooking.deleteMany({ where: org });
  await tx.rentalAsset.deleteMany({ where: org });
}

async function purgeFinance(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const invoices = await tx.invoice.findMany({ where: org, select: { id: true } });
  const payments = await tx.payment.findMany({ where: org, select: { id: true } });
  const invoiceIds = invoices.map((item) => item.id);
  const paymentIds = payments.map((item) => item.id);
  if (invoiceIds.length || paymentIds.length) {
    await tx.paymentAllocation.deleteMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { paymentId: { in: paymentIds } }],
      },
    });
  }
  await tx.payment.updateMany({ where: org, data: { refundOfId: null } });
  await tx.payment.deleteMany({ where: org });
  await tx.customerCredit.deleteMany({ where: org });
  await tx.depositTransaction.deleteMany({ where: org });
  await tx.expense.deleteMany({ where: org });
  if (invoiceIds.length) await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await tx.invoice.deleteMany({ where: org });
  const batches = await tx.bankImportBatch.findMany({ where: org, select: { id: true } });
  if (batches.length) await tx.bankImportRow.deleteMany({ where: { batchId: { in: batches.map((item) => item.id) } } });
  await tx.bankImportBatch.deleteMany({ where: org });
}

async function purgeSales(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const returns = await tx.salesReturn.findMany({ where: org, select: { id: true } });
  if (returns.length) await tx.salesReturnLine.deleteMany({ where: { returnId: { in: returns.map((item) => item.id) } } });
  await tx.salesReturn.deleteMany({ where: org });
  const fulfillments = await tx.fulfillment.findMany({ where: org, select: { id: true } });
  if (fulfillments.length) {
    await tx.fulfillmentLine.deleteMany({ where: { fulfillmentId: { in: fulfillments.map((item) => item.id) } } });
  }
  await tx.fulfillment.deleteMany({ where: org });
  const orders = await tx.salesOrder.findMany({ where: org, select: { id: true } });
  if (orders.length) await tx.salesOrderLine.deleteMany({ where: { orderId: { in: orders.map((item) => item.id) } } });
  await tx.salesOrder.deleteMany({ where: org });
  const quotes = await tx.quote.findMany({ where: org, select: { id: true } });
  if (quotes.length) await tx.quoteLine.deleteMany({ where: { quoteId: { in: quotes.map((item) => item.id) } } });
  await tx.quote.deleteMany({ where: org });
}

async function purgeStock(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const counts = await tx.inventoryCount.findMany({ where: org, select: { id: true } });
  if (counts.length) await tx.inventoryCountLine.deleteMany({ where: { countId: { in: counts.map((item) => item.id) } } });
  await tx.inventoryCount.deleteMany({ where: org });
  const shipments = await tx.internalShipment.findMany({ where: org, select: { id: true } });
  if (shipments.length) {
    await tx.internalShipmentLine.deleteMany({ where: { shipmentId: { in: shipments.map((item) => item.id) } } });
  }
  await tx.internalShipment.deleteMany({ where: org });
  await tx.reservation.deleteMany({ where: org });
  await tx.stockMovement.deleteMany({ where: org });
  await tx.stockBalance.deleteMany({ where: org });
}

async function purgePurchases(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const costs = await tx.landedCost.findMany({ where: org, select: { id: true } });
  if (costs.length) await tx.landedCostAllocation.deleteMany({ where: { landedCostId: { in: costs.map((item) => item.id) } } });
  await tx.landedCost.deleteMany({ where: org });
  const receipts = await tx.goodsReceipt.findMany({ where: org, select: { id: true } });
  if (receipts.length) {
    await tx.goodsReceiptLine.deleteMany({ where: { receiptId: { in: receipts.map((item) => item.id) } } });
  }
  await tx.goodsReceipt.deleteMany({ where: org });
  const orders = await tx.purchaseOrder.findMany({ where: org, select: { id: true } });
  if (orders.length) {
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: orders.map((item) => item.id) } } });
  }
  await tx.purchaseOrder.deleteMany({ where: org });
  await tx.supplier.deleteMany({ where: org });
}

async function purgeCatalog(tx: Tx, organizationId: string) {
  const org = { organizationId };
  const lists = await tx.priceList.findMany({ where: org, select: { id: true } });
  if (lists.length) await tx.priceListEntry.deleteMany({ where: { priceListId: { in: lists.map((item) => item.id) } } });
  await tx.priceList.deleteMany({ where: org });
  await tx.productVariant.deleteMany({ where: org });
  await tx.product.deleteMany({ where: org });
  await tx.species.deleteMany({ where: org });
}

async function purgeCustomers(tx: Tx, organizationId: string) {
  const org = { organizationId };
  await tx.customerPortalAccount.deleteMany({ where: org });
  await tx.customerAttachment.deleteMany({ where: org });
  await tx.activity.deleteMany({ where: org });
  await tx.contact.deleteMany({ where: { customer: org } });
  await tx.address.deleteMany({ where: { customer: org } });
  await tx.customer.updateMany({ where: org, data: { mergedIntoId: null } });
  await tx.customer.deleteMany({ where: org });
}
