import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { assertStaffFree } from "@/server/features/excursions/excursion-service";
import { addActivity } from "@/server/features/crm/customer-service";
import { D, Decimal, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { parseDateOnly } from "@/server/time";
import { withTx } from "@/server/tx";

export async function createCampaign(
  actor: Actor,
  input: {
    name: string;
    goal?: string;
    startOn: string;
    endOn: string;
    budgetAmount: string;
    notes?: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "crm.write");
  const name = input.name.trim();
  if (!name) throw new BusinessError("კამპანიის სახელი სავალდებულოა", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.campaign.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      return tx.campaign.create({
        data: {
          organizationId: actor.organizationId,
          name,
          goal: input.goal?.trim() || null,
          startOn: parseDateOnly(input.startOn),
          endOn: parseDateOnly(input.endOn),
          budgetAmount: roundMoney(D(input.budgetAmount || "0")).toFixed(2),
          notes: input.notes?.trim() || null,
          postingKey: input.postingKey,
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().campaign.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function setCampaignActuals(
  actor: Actor,
  input: { campaignId: string; spendAmount?: string; attributedRevenue?: string },
) {
  requirePermission(actor, "crm.write");
  const campaign = await getDb().campaign.findFirst({
    where: { id: input.campaignId, organizationId: actor.organizationId },
  });
  if (!campaign) throw new BusinessError("კამპანია ვერ მოიძებნა", "not_found");
  return getDb().campaign.update({
    where: { id: campaign.id },
    data: {
      spendAmount: input.spendAmount == null || input.spendAmount === "" ? campaign.spendAmount : roundMoney(D(input.spendAmount)).toFixed(2),
      attributedRevenue:
        input.attributedRevenue == null || input.attributedRevenue === ""
          ? campaign.attributedRevenue
          : roundMoney(D(input.attributedRevenue)).toFixed(2),
    },
  });
}

export function campaignRoas(spend: Decimal | null, revenue: Decimal | null): string | null {
  if (!spend || !revenue || spend.lte(0)) return null;
  return revenue.div(spend).toFixed(4);
}

export async function logCampaignTemplate(
  actor: Actor,
  input: { customerId: string; body: string },
) {
  return addActivity(actor, { customerId: input.customerId, type: "template", body: input.body });
}

export async function bookEvent(
  actor: Actor,
  input: {
    name: string;
    kind?: string;
    customerId?: string;
    resourceId: string;
    startsAt: Date;
    endsAt: Date;
    guestCount?: string;
    budgetAmount?: string;
    sponsorAmount?: string;
    ticketAmount?: string;
    staffUserIds?: string[];
    postingKey: string;
  },
) {
  requirePermission(actor, "excursion.write");
  if (input.endsAt <= input.startsAt) throw new BusinessError("დროის ინტერვალი არასწორია", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.eventBooking.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      await tx.$queryRaw`SELECT id FROM resources WHERE id = ${input.resourceId} FOR UPDATE`;
      const resource = await tx.resource.findFirst({
        where: { id: input.resourceId, organizationId: actor.organizationId },
      });
      if (!resource) throw new BusinessError("სივრცე ვერ მოიძებნა", "not_found");
      const overlapping = await tx.resourceReservation.count({
        where: {
          resourceId: resource.id,
          status: { in: ["held", "confirmed"] },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
      });
      if (overlapping >= resource.capacity) throw new BusinessError("ამ დროს სივრცე დაკავებულია", "capacity");
      for (const userId of input.staffUserIds ?? []) {
        await assertStaffFree(tx, userId, input.startsAt, input.endsAt);
      }
      const number = await nextNumber(tx, actor.organizationId, "event", "EV");
      const event = await tx.eventBooking.create({
        data: {
          organizationId: actor.organizationId,
          customerId: input.customerId || null,
          resourceId: resource.id,
          number,
          name: input.name.trim(),
          kind: input.kind?.trim() || "other",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          guestCount: Number(input.guestCount ?? "0") || 0,
          budgetAmount: roundMoney(D(input.budgetAmount ?? "0")).toFixed(2),
          sponsorAmount: roundMoney(D(input.sponsorAmount ?? "0")).toFixed(2),
          ticketAmount: roundMoney(D(input.ticketAmount ?? "0")).toFixed(2),
          postingKey: input.postingKey,
          staff: {
            create: (input.staffUserIds ?? []).map((userId) => ({
              userId,
              roleCode: "host",
              startsAt: input.startsAt,
              endsAt: input.endsAt,
            })),
          },
          holds: {
            create: [{ resourceId: resource.id, status: "confirmed", startsAt: input.startsAt, endsAt: input.endsAt }],
          },
        },
      });
      const sponsor = D(event.sponsorAmount);
      if (sponsor.gt(0)) {
        await tx.expense.create({
          data: {
            organizationId: actor.organizationId,
            category: "event_sponsor",
            amount: sponsor.toFixed(2),
            sourceType: "event_sponsor",
            sourceId: event.id,
            postingKey: `${input.postingKey}:sponsor`,
          },
        });
      }
      const tickets = D(event.ticketAmount);
      if (tickets.gt(0)) {
        await tx.expense.create({
          data: {
            organizationId: actor.organizationId,
            category: "event_ticket",
            amount: tickets.toFixed(2),
            sourceType: "event_ticket",
            sourceId: event.id,
            postingKey: `${input.postingKey}:ticket`,
          },
        });
      }
      return event;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().eventBooking.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}
