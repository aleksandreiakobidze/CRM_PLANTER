import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ROLE_PRESETS, type Actor } from "@/server/auth/permissions";
import { addAddress, addContact, cancelTask, completeAssignment, createCustomer, createTask, findDuplicateCustomers, mergeCustomers, myDay, readTaskFile, reopenTask, rescheduleTask, setTaskStatus, updateCustomer } from "@/server/features/crm/customer-service";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";
import { createQuote } from "@/server/features/sales/order-service";
import { makeSellable, makeWorld } from "../helpers";

async function addMember(organizationId: string, roleCode: keyof typeof ROLE_PRESETS, name: string): Promise<Actor> {
  const role = await getDb().role.findUniqueOrThrow({ where: { organizationId_code: { organizationId, code: roleCode } } });
  const user = await getDb().user.create({
    data: { email: `extra-${randomUUID()}@planter.test`, name, passwordHash: "test" },
  });
  await getDb().membership.create({ data: { organizationId, userId: user.id, roleId: role.id } });
  return {
    userId: user.id,
    organizationId,
    email: user.email,
    permissions: new Set(ROLE_PRESETS[roleCode].permissions),
  };
}

describe("CRM", () => {
  it("ინახავს კლიენტს, სტატუსს და ფილტრს", async () => {
    const { actor } = await makeWorld();
    const school = await createCustomer(actor, {
      kind: "company",
      name: "სატესტო სკოლა A",
      segment: "school",
      relationshipStatus: "to_contact",
      phone: "599112233",
      nextContactOn: "2020-01-01",
    });
    const found = await getDb().customer.findMany({ where: { organizationId: actor.organizationId, relationshipStatus: "to_contact" } });
    expect(found.map((item) => item.id)).toContain(school.id);
    expect(school.phoneNormalized).toBe("+995599112233");
    const day = await myDay(actor, new Date("2026-10-19T08:00:00.000Z"));
    expect(day.contacts.some((item) => item.id === school.id)).toBe(true);
  });

  it("დუბლიკატს აფრთხილებს და შერწყმა ისტორიას ინახავს", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-CRM-${actor.userId.slice(-4)}`, "1");
    const first = await createCustomer(actor, { kind: "company", name: "სატესტო ალფა", identificationCode: "999888777" });
    await expect(createCustomer(actor, { kind: "company", name: "სატესტო ბეტა", identificationCode: "999888777" })).rejects.toThrow(/მსგავსი/);
    const duplicates = await findDuplicateCustomers(actor.organizationId, { identificationCode: "999888777" });
    expect(duplicates).toHaveLength(1);
    const second = await createCustomer(actor, { kind: "company", name: "სატესტო ბეტა", phone: "555000111", confirmDuplicate: true });
    const quote = await createQuote(actor, { customerId: second.id, lines: [{ variantId: variant.id, quantity: "1" }] });
    await mergeCustomers(actor, first.id, second.id);
    const moved = await getDb().quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(moved.customerId).toBe(first.id);
    const source = await getDb().customer.findUniqueOrThrow({ where: { id: second.id } });
    expect(source.mergedIntoId).toBe(first.id);
  });

  it("რედაქტირება ინახავს ტელეფონს და სხვის კოდს ბლოკავს", async () => {
    const { actor } = await makeWorld();
    const first = await createCustomer(actor, { kind: "company", name: "სატესტო ალფა", identificationCode: "111222333" });
    const second = await createCustomer(actor, { kind: "person", name: "სატესტო გიორგი", phone: "599000222" });
    const updated = await updateCustomer(actor, second.id, { kind: "person", name: "გიორგი განახლებული", phone: "599000333" });
    expect(updated.phoneNormalized).toBe("+995599000333");
    expect(updated.name).toBe("გიორგი განახლებული");
    await expect(updateCustomer(actor, second.id, { kind: "person", name: "გიორგი განახლებული", identificationCode: "111222333" })).rejects.toThrow(/მსგავსი/);
    const untouched = await getDb().customer.findUniqueOrThrow({ where: { id: first.id } });
    expect(untouched.name).toBe("სატესტო ალფა");
  });

  it("მისამართი და რამდენიმე კონტაქტი ერთ კლიენტზე ინახება", async () => {
    const { actor } = await makeWorld();
    const school = await createCustomer(actor, { kind: "company", name: "სატესტო სკოლა B", identificationCode: "404505606" });
    const address = await addAddress(actor, { customerId: school.id, line1: "რუსთაველის 1", city: "თბილისი", region: "თბილისი" });
    const loaded = await getDb().customer.findUniqueOrThrow({ where: { id: school.id }, include: { addresses: true } });
    expect(loaded.identificationCode).toBe("404505606");
    expect(loaded.addresses.map((item) => item.id)).toContain(address.id);
    expect(loaded.addresses[0]?.line1).toBe("რუსთაველის 1");
    const first = await addContact(actor, { customerId: school.id, name: "ნინო", phone: "599111222", email: "Nino@School.test", isPrimary: true });
    const second = await addContact(actor, { customerId: school.id, name: "გიორგი", title: "დირექტორი", email: "giorgi@school.test", isPrimary: true });
    const contacts = await getDb().contact.findMany({ where: { customerId: school.id }, orderBy: { name: "asc" } });
    expect(contacts).toHaveLength(2);
    expect(contacts.find((item) => item.id === first.id)?.isPrimary).toBe(false);
    expect(contacts.find((item) => item.id === second.id)?.isPrimary).toBe(true);
    expect(first.phoneNormalized).toBe("+995599111222");
    expect(first.email).toBe("nino@school.test");
    await expect(addAddress(actor, { customerId: school.id, line1: "   " })).rejects.toThrow(/ქუჩა/);
  });

  it("შესრულებული დავალება ჩემი დღიდან ქრება", async () => {
    const { actor } = await makeWorld();
    const task = await createTask(actor, { title: "დარეკე სკოლას", dueOn: "2026-10-19" });
    const before = await myDay(actor, new Date("2026-10-19T08:00:00.000Z"));
    expect(before.tasks.some((item) => item.id === task.id)).toBe(true);
    await setTaskStatus(actor, task.id, "done");
    const after = await myDay(actor, new Date("2026-10-19T08:00:00.000Z"));
    expect(after.tasks.some((item) => item.id === task.id)).toBe(false);
  });

  it("ვადის შეცვლა მხოლოდ საკუთარ დავალებას ეხება", async () => {
    const { actor } = await makeWorld();
    const other = await makeWorld();
    const task = await createTask(actor, { title: "გადატანა", dueOn: "2026-10-19" });
    const moved = await rescheduleTask(actor, task.id, "2026-10-21");
    expect(formatDateOnly(moved.dueOn!)).toBe("2026-10-21");
    const cleared = await rescheduleTask(actor, task.id, null);
    expect(cleared.dueOn).toBeNull();
    await expect(rescheduleTask(other.actor, task.id, "2026-10-22")).rejects.toThrow(/ვერ მოიძებნა/);
    const stored = await getDb().task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.dueOn).toBeNull();
  });

  it("ორი შემსრულებელი ნაწილ-ნაწილ ასრულებს და გაუქმება ჩანაწერს ტოვებს", async () => {
    const { actor, organizationId } = await makeWorld();
    const driver = await addMember(organizationId, "driver", "სატესტო მძღოლი");
    const outsider = await addMember(organizationId, "driver", "სატესტო მესამე");
    const otherOrg = await makeWorld();
    const task = await createTask(actor, {
      title: "მიიტანე ქოთნები",
      description: "სკოლამდე",
      assigneeIds: [actor.userId, driver.userId],
      files: [{ name: "სია.txt", bytes: Buffer.from("ქოთანი 4") }],
    });
    expect(task.status).toBe("open");
    const afterDriver = await completeAssignment(driver, task.id);
    expect(afterDriver.status).toBe("doing");
    const assignments = await getDb().taskAssignment.findMany({ where: { taskId: task.id } });
    expect(assignments.find((item) => item.userId === driver.userId)?.status).toBe("done");
    expect(assignments.find((item) => item.userId === actor.userId)?.status).toBe("open");
    await expect(completeAssignment(outsider, task.id)).rejects.toThrow(/თქვენზე არ არის/);
    const finished = await completeAssignment(actor, task.id);
    expect(finished.status).toBe("done");
    const cancelled = await cancelTask(actor, task.id);
    expect(cancelled.status).toBe("cancelled");
    const kept = await getDb().task.findUniqueOrThrow({
      where: { id: task.id },
      include: { assignments: true, attachments: true },
    });
    expect(kept.assignments).toHaveLength(2);
    expect(kept.attachments).toHaveLength(1);
    const file = await readTaskFile(driver, kept.attachments[0]!.id);
    expect(file.bytes.toString()).toBe("ქოთანი 4");
    await expect(readTaskFile(otherOrg.actor, kept.attachments[0]!.id)).rejects.toThrow(/ვერ მოიძებნა/);
    const reopened = await reopenTask(actor, task.id);
    expect(reopened.status).toBe("done");
  });
});
