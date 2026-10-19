import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { D, Decimal, roundMoney } from "@/server/money";
import { parseDateOnly } from "@/server/time";
import { withTx } from "@/server/tx";

export type AllocationInput = { invoiceId: string; amount: string };

async function lockInvoice(tx: Tx, invoiceId: string, organizationId: string) {
  await tx.$queryRaw`
    SELECT id FROM invoices WHERE id = ${invoiceId} AND organization_id = ${organizationId} FOR UPDATE
  `;
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { allocations: true },
  });
  if (!invoice) throw new BusinessError("ინვოისი ვერ მოიძებნა", "not_found");
  if (invoice.status !== "posted") throw new BusinessError("გადახდა მხოლოდ გატარებულ ინვოისზე ფიქსირდება", "invalid_state");
  const allocated = invoice.allocations.reduce((sum, row) => sum.plus(D(row.amount)), new Decimal(0));
  return { invoice, remaining: roundMoney(D(invoice.total).minus(allocated)) };
}

export async function recordPayment(
  actor: Actor,
  input: {
    customerId: string;
    amount: string;
    method: "cash" | "bank" | "online";
    paidOn: string;
    reference?: string;
    postingKey: string;
    allocations: AllocationInput[];
  },
) {
  requirePermission(actor, "finance.write");
  const amount = D(input.amount);
  if (amount.lte(0)) throw new BusinessError("თანხა ნულზე მეტი უნდა იყოს", "validation");
  const allocations = input.allocations.map((item) => ({ invoiceId: item.invoiceId, amount: D(item.amount) }));
  const allocatedSum = roundMoney(allocations.reduce((sum, item) => sum.plus(item.amount), new Decimal(0)));
  if (allocatedSum.gt(amount)) throw new BusinessError("განაწილება გადახდის თანხას აღემატება", "invalid_amount");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const sorted = [...allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
      for (const allocation of sorted) {
        const locked = await lockInvoice(tx, allocation.invoiceId, actor.organizationId);
        if (locked.invoice.customerId !== input.customerId) {
          throw new BusinessError("ინვოისი სხვა კლიენტისაა", "forbidden");
        }
        if (allocation.amount.lte(0) || allocation.amount.gt(locked.remaining)) {
          throw new BusinessError("განაწილება დარჩენილ დავალიანებას აღემატება", "invalid_amount");
        }
      }
      const payment = await tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          customerId: input.customerId,
          kind: "payment",
          amount: amount.toFixed(2),
          method: input.method,
          paidOn: parseDateOnly(input.paidOn),
          reference: input.reference,
          postingKey: input.postingKey,
          actorId: actor.userId,
          allocations: {
            create: sorted.map((allocation) => ({
              invoiceId: allocation.invoiceId,
              amount: allocation.amount.toFixed(2),
              postingKey: `${input.postingKey}:${allocation.invoiceId}`,
            })),
          },
        },
      });
      const unallocated = roundMoney(amount.minus(allocatedSum));
      if (unallocated.gt(0)) {
        await tx.customerCredit.create({
          data: {
            organizationId: actor.organizationId,
            customerId: input.customerId,
            amount: unallocated.toFixed(2),
            postingKey: `${input.postingKey}:credit`,
            reason: "გაუნაწილებელი გადახდა",
          },
        });
      }
      await audit(tx, actor, "payment.record", "payment", payment.id, undefined, { amount: amount.toFixed(2) });
      return payment;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().payment.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function refundPayment(actor: Actor, input: { paymentId: string; amount: string; postingKey: string; paidOn: string }) {
  requirePermission(actor, "finance.write");
  const amount = D(input.amount);
  if (amount.lte(0)) throw new BusinessError("დასაბრუნებელი თანხა ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const original = await tx.payment.findFirst({
        where: { id: input.paymentId, organizationId: actor.organizationId, kind: "payment" },
        include: { refunds: true },
      });
      if (!original) throw new BusinessError("საწყისი გადახდა ვერ მოიძებნა", "not_found");
      const already = original.refunds.reduce((sum, row) => sum.plus(D(row.amount)), new Decimal(0));
      if (already.plus(amount).gt(D(original.amount))) {
        throw new BusinessError("დაბრუნება საწყის გადახდას აღემატება", "invalid_amount");
      }
      return tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          customerId: original.customerId,
          kind: "refund",
          amount: amount.toFixed(2),
          method: original.method,
          paidOn: parseDateOnly(input.paidOn),
          postingKey: input.postingKey,
          refundOfId: original.id,
          actorId: actor.userId,
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().payment.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function recordDeposit(
  tx: Tx,
  input: { organizationId: string; bookingId: string; amount: Decimal; postingKey: string; kind: "hold" | "refund" | "deduct" },
) {
  const existing = await tx.depositTransaction.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  return tx.depositTransaction.create({
    data: {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      kind: input.kind,
      amount: input.amount.toFixed(2),
      postingKey: input.postingKey,
    },
  });
}
