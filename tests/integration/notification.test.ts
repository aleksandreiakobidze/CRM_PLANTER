import { describe, expect, it } from "vitest";
import { createCustomer, createTask } from "@/server/features/crm/customer-service";
import { bookExcursion, rescheduleExcursionToDate } from "@/server/features/excursions/excursion-service";
import { listNotifications, markNotificationRead } from "@/server/features/notifications/notification-service";
import { getDb } from "@/server/db";
import { zonedDateTime } from "@/server/time";
import { makeWorld } from "../helpers";

describe("notifications", () => {
  it("lights up for other members when a task or excursion is added", async () => {
    const { actor } = await makeWorld();
    const role = await getDb().role.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "owner" } },
    });
    const otherUser = await getDb().user.create({
      data: {
        email: `peer-${actor.organizationId}@planter.test`,
        name: "peer",
        passwordHash: "x",
      },
    });
    await getDb().membership.create({
      data: { organizationId: actor.organizationId, userId: otherUser.id, roleId: role.id },
    });
    const other = { ...actor, userId: otherUser.id, email: otherUser.email };

    const task = await createTask(actor, { title: "call the school" });
    expect((await listNotifications(actor)).unread).toBe(0);
    const afterTask = await listNotifications(other);
    expect(afterTask.unread).toBe(1);
    expect(afterTask.items[0]?.href).toBe(`/work/${task.id}`);
    expect(afterTask.items[0]?.kind).toBe("task");
    await markNotificationRead(other, afterTask.items[0].id);
    expect((await listNotifications(other)).unread).toBe(0);

    const school = await createCustomer(actor, { kind: "company", name: "Notice School", segment: "school" });
    const resource = await getDb().resource.findFirstOrThrow({ where: { organizationId: actor.organizationId } });
    const booking = await bookExcursion(actor, {
      customerId: school.id,
      resourceId: resource.id,
      startsAt: zonedDateTime("2026-12-10", "13:00"),
      endsAt: zonedDateTime("2026-12-10", "15:00"),
      plannedChildren: 8,
      note: "visit",
      price: "40",
      postingKey: `notice-${resource.id}`,
    });
    const afterBook = await listNotifications(other);
    expect(afterBook.unread).toBe(1);
    expect(afterBook.items[0]?.href).toBe(`/excursions/${booking.id}`);
    expect(afterBook.items[0]?.kind).toBe("excursion");
    await rescheduleExcursionToDate(actor, booking.id, "2026-12-11");
    expect((await listNotifications(other)).unread).toBe(1);
    expect((await listNotifications(actor)).unread).toBe(0);
  });
});
