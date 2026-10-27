import { describe, expect, it } from "vitest";
import { createCustomer, createTask, setTaskStatus } from "@/server/features/crm/customer-service";
import { crmReport } from "@/server/features/reports/crm-report";
import { convertQuoteToOrder, createQuote, setQuoteStatus } from "@/server/features/sales/order-service";
import { getDb } from "@/server/db";
import { addDaysIso, parseDateOnly, tbilisiDateString } from "@/server/time";
import { makeSellable, makeWorld } from "../helpers";

describe("CRM report", () => {
  it("counts customers, overdue contacts, team tasks and the quote funnel", async () => {
    const { actor } = await makeWorld();
    const today = tbilisiDateString();
    const { variant } = await makeSellable(actor, `SKU-CRM-${actor.userId.slice(-4)}`, "10", "4");
    const late = await createCustomer(actor, { kind: "company", name: "დაგვიანებული", segment: "horeca" });
    const fine = await createCustomer(actor, { kind: "company", name: "დროული", segment: "school" });
    await getDb().customer.update({ where: { id: late.id }, data: { nextContactOn: parseDateOnly(addDaysIso(today, -3)), relationshipStatus: "to_contact" } });
    await getDb().customer.update({ where: { id: fine.id }, data: { nextContactOn: parseDateOnly(addDaysIso(today, 5)), relationshipStatus: "customer" } });

    const done = await createTask(actor, { title: "დარეკვა", dueOn: addDaysIso(today, -1), customerId: late.id });
    await createTask(actor, { title: "შეხვედრა", dueOn: addDaysIso(today, -2) });
    await setTaskStatus(actor, done.id, "done");

    const line = [{ variantId: variant.id, quantity: "1", unitPrice: "50" }];
    await createQuote(actor, { customerId: late.id, lines: line });
    const won = await createQuote(actor, { customerId: fine.id, lines: line });
    const lost = await createQuote(actor, { customerId: late.id, lines: line });
    await setQuoteStatus(actor, won.id, "sent");
    await setQuoteStatus(actor, won.id, "accepted");
    await convertQuoteToOrder(actor, won.id);
    await setQuoteStatus(actor, lost.id, "sent");
    await setQuoteStatus(actor, lost.id, "declined");

    const report = await crmReport(actor, { from: today, to: today });
    expect(report.totals.customers).toBe(2);
    expect(report.totals.newCustomers).toBe(2);
    expect(report.totals.active).toBe(1);
    expect(report.overdue.map((row) => [row.name, row.days])).toEqual([["დაგვიანებული", 3]]);
    expect(report.funnel.map((row) => row.count)).toEqual([3, 2, 1, 1]);
    expect(report.funnel[3].value?.toFixed(2)).toBe("50.00");
    expect(report.totals.declined).toBe(1);
    expect(report.totals.tasksCreated).toBe(2);
    expect(report.totals.tasksDone).toBe(1);
    expect(report.totals.tasksOverdue).toBe(1);
    const me = report.team.find((row) => row.id === actor.userId);
    expect(me).toMatchObject({ created: 2, assigned: 2, done: 1, open: 1, overdue: 1 });

    const schools = await crmReport(actor, { from: today, to: today, segment: "school" });
    expect(schools.totals.customers).toBe(1);
    expect(schools.funnel[0].count).toBe(1);
  });
});
