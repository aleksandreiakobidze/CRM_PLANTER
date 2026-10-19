import "dotenv/config";
import { PERMISSIONS, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { addActivity, addAddress, addContact, createCustomer, createTask, setTaskStatus } from "@/server/features/crm/customer-service";
import { bookExcursion, createProgram } from "@/server/features/excursions/excursion-service";
import { createInvoiceFromOrder } from "@/server/features/finance/invoice-service";
import { recordPayment } from "@/server/features/finance/payment-service";
import { postOpeningStock } from "@/server/features/inventory/stock-service";
import { createMaintenanceContract, setContractStatus } from "@/server/features/maintenance/maintenance-service";
import { bookRental, createRentalAsset } from "@/server/features/rental/rental-service";
import { confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder } from "@/server/features/sales/order-service";
import { D } from "@/server/money";
import { addDaysIso, parseDateOnly, zonedDateTime } from "@/server/time";

const TARGET = 10;

const CUSTOMERS = [
  { name: "სატესტო სკოლა ბათუმი", kind: "company" as const, segment: "school", city: "ბათუმი", region: "აჭარა", status: "to_contact" },
  { name: "სატესტო ოფისი ვერა", kind: "company" as const, segment: "office", city: "თბილისი", region: "თბილისი", status: "quote_sent" },
  { name: "სატესტო ბაღი ვარკეთილი", kind: "company" as const, segment: "school", city: "თბილისი", region: "თბილისი", status: "customer" },
  { name: "ნინო ბერიძე", kind: "person" as const, segment: "person", city: "თბილისი", region: "თბილისი", status: "fresh" },
  { name: "გიორგი კაპანაძე", kind: "person" as const, segment: "person", city: "ქუთაისი", region: "იმერეთი", status: "to_contact" },
  { name: "სატესტო კაფე სოლოლაკი", kind: "company" as const, segment: "other", city: "თბილისი", region: "თბილისი", status: "customer" },
  { name: "სატესტო სკოლა რუსთავი", kind: "company" as const, segment: "school", city: "რუსთავი", region: "ქვემო ქართლი", status: "quote_sent" },
  { name: "მარიამ გელაშვილი", kind: "person" as const, segment: "person", city: "ბათუმი", region: "აჭარა", status: "fresh" },
  { name: "სატესტო ოფისი საბურთალო", kind: "company" as const, segment: "office", city: "თბილისი", region: "თბილისი", status: "declined" },
  { name: "ლევან მელაძე", kind: "person" as const, segment: "person", city: "თბილისი", region: "თბილისი", status: "customer" },
  { name: "სატესტო სასტუმრო მთაწმინდა", kind: "company" as const, segment: "other", city: "თბილისი", region: "თბილისი", status: "to_contact" },
  { name: "სატესტო ბაღი წყალტუბო", kind: "company" as const, segment: "school", city: "წყალტუბო", region: "იმერეთი", status: "fresh" },
];

const PLANTS = ["ფიკუსი", "მონსტერა", "სანსევიერია", "ზამიოკულკასი", "პოთოსი", "დრაცენა", "კალათეა", "სპატიფილუმი", "ალოე", "ოლეანდრი", "პალმა", "ფილოდენდრონი"];
const RENTALS = ["დიდი პალმა", "ზეთისხილი", "ფიკუსი ლირატა", "ბამბუკი", "კაქტუსი სვეტი", "იუკა", "კროტონი", "აგავა", "ციკასი", "ფილოდენდრონი დიდი"];
const STREETS = ["რუსთაველის 12", "ჭავჭავაძის 24", "აღმაშენებლის 8", "ვაჟა-ფშაველას 41", "პეკინის 15", "კოსტავას 67", "ბარათაშვილის 3", "თამარ მეფის 19", "ყაზბეგის 10", "ნუცუბიძის 4"];
const PEOPLE = ["ნინო", "გიორგი", "მარიამ", "ლევან", "თამარი", "დავითი", "ანა", "სალომე", "ირაკლი", "ქეთევან"];
const TITLES = ["დირექტორი", "მასწავლებელი", "მენეჯერი", "ადმინისტრატორი", "კოორდინატორი"];
const CALLS = [
  { result: "interested", body: "მცენარეები აინტერესებს, ფასს ელოდება" },
  { result: "no_answer", body: "ვერ გავიგე, ხვალ გადავრეკავ" },
  { result: "needs_time", body: "ბიუჯეტს ამ თვეში ამტკიცებენ" },
  { result: "refused", body: "ამ ეტაპზე არ სჭირდებათ" },
];
const TASKS = ["დარეკე სკოლას", "გაუგზავნე შეთავაზება", "შეამოწმე მისამართი", "დაადასტურე მიწოდება", "შეხვედრა ოფისში", "გადაამოწმე გადახდა", "მოამზადე კატალოგი", "დაგეგმე ვიზიტი", "გააგზავნე ინვოისი", "დააზუსტე რაოდენობა"];
const PROGRAMS = ["მწვანე კლასი", "ნიადაგის საიდუმლო", "ფოთლის ლაბორატორია", "ბაღის დღე", "თესლის გზა", "წყლის ციკლი", "მწერების მეგობრები", "ხის ამბავი", "ფერადი ქოთნები", "სათბურის ტური"];

if (process.env.NODE_ENV === "production") {
  throw new BusinessError("სატესტო შევსება production-ში გამორთულია", "seed");
}

async function main() {
  const db = getDb();
  const organization = await db.organization.findFirst({ where: { isDemo: true, name: "Planter სატესტო" } });
  if (!organization) throw new BusinessError("სატესტო ორგანიზაცია ვერ მოიძებნა. ჯერ demo:seed გაუშვით.", "seed");
  const membership = await db.membership.findFirst({
    where: { organizationId: organization.id, user: { email: "demo-admin@planter.test" } },
    include: { user: true },
  });
  if (!membership) throw new BusinessError("სატესტო ადმინი ვერ მოიძებნა", "seed");
  const actor: Actor = {
    userId: membership.userId,
    organizationId: organization.id,
    email: membership.user.email,
    permissions: new Set(PERMISSIONS),
  };
  const sales = await db.location.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: "sales" } },
  });

  let customers = await db.customer.findMany({ where: { organizationId: organization.id, mergedIntoId: null }, orderBy: { createdAt: "asc" } });
  for (let index = customers.length; index < TARGET; index += 1) {
    const sample = CUSTOMERS[index % CUSTOMERS.length];
    const phone = `599${String(310000 + index).padStart(6, "0")}`;
    await createCustomer(actor, {
      kind: sample.kind,
      name: customers.some((item) => item.name === sample.name) ? `${sample.name} ${index + 1}` : sample.name,
      segment: sample.segment,
      relationshipStatus: sample.status,
      city: sample.city,
      region: sample.region,
      phone,
      email: `demo${index + 1}@planter.test`,
      identificationCode: `407${String(100000 + index)}`,
    });
  }
  customers = await db.customer.findMany({ where: { organizationId: organization.id, mergedIntoId: null }, orderBy: { createdAt: "asc" } });
  for (let index = 0; index < customers.length; index += 1) {
    if (customers[index].nextContactOn) continue;
    await db.customer.update({
      where: { id: customers[index].id },
      data: { nextContactOn: parseDateOnly(addDaysIso("2026-10-10", index)) },
    });
  }

  let contactCount = await db.contact.count({ where: { organizationId: organization.id } });
  for (let index = contactCount; index < TARGET; index += 1) {
    const customer = customers[index % customers.length];
    await addContact(actor, {
      customerId: customer.id,
      name: PEOPLE[index % PEOPLE.length],
      title: TITLES[index % TITLES.length],
      phone: `555${String(200000 + index).padStart(6, "0")}`,
      email: `contact${index + 1}@planter.test`,
      isPrimary: index < customers.length,
    });
  }

  let addressCount = await db.address.count({ where: { organizationId: organization.id } });
  for (let index = addressCount; index < TARGET; index += 1) {
    const customer = customers[index % customers.length];
    await addAddress(actor, {
      customerId: customer.id,
      label: index % 2 === 0 ? "მთავარი" : "ობიექტი",
      line1: STREETS[index % STREETS.length],
      city: customer.city ?? "თბილისი",
      region: customer.region ?? "თბილისი",
      district: "ცენტრი",
    });
  }

  let activityCount = await db.activity.count({ where: { organizationId: organization.id } });
  for (let index = activityCount; index < TARGET; index += 1) {
    const call = CALLS[index % CALLS.length];
    await addActivity(actor, { customerId: customers[index % customers.length].id, type: "call", result: call.result, body: call.body });
  }

  let taskCount = await db.task.count({ where: { organizationId: organization.id } });
  const taskStatuses = ["open", "open", "open", "open", "doing", "doing", "doing", "done", "done", "done"];
  for (let index = taskCount; index < TARGET; index += 1) {
    const task = await createTask(actor, {
      title: TASKS[index % TASKS.length],
      dueOn: addDaysIso("2026-10-19", index - 4),
      customerId: customers[index % customers.length].id,
    });
    const status = taskStatuses[index % taskStatuses.length];
    if (status !== "open") await setTaskStatus(actor, task.id, status);
  }

  let variants = await db.productVariant.findMany({ where: { organizationId: organization.id, sellable: true }, orderBy: { sku: "asc" } });
  for (let index = variants.length; index < TARGET; index += 1) {
    const name = PLANTS[index % PLANTS.length];
    await createVariant(actor, {
      category: "plant",
      productName: name,
      sku: `DEMO-PLANT-${String(index + 1).padStart(2, "0")}`,
      variantName: `${name} ქოთანში`,
      listPrice: String(18 + index * 4),
      potVolumeLiters: String(1 + (index % 5)),
      sellable: true,
    });
  }
  variants = await db.productVariant.findMany({ where: { organizationId: organization.id, sellable: true }, orderBy: { sku: "asc" } });
  for (const variant of variants) {
    await postOpeningStock(actor, {
      variantId: variant.id,
      locationId: sales.id,
      quantity: "200",
      unitCost: "8",
      postingKey: `demo-opening:${variant.id}`,
      reason: "სატესტო საწყისი ნაშთი",
    });
  }

  let rentable = await db.productVariant.findMany({ where: { organizationId: organization.id, rentable: true } });
  for (let index = rentable.length; index < TARGET; index += 1) {
    const name = RENTALS[index % RENTALS.length];
    await createVariant(actor, {
      category: "plant",
      productName: name,
      sku: `DEMO-RENT-${String(index + 1).padStart(2, "0")}`,
      variantName: name,
      listPrice: "0",
      rentable: true,
      sellable: false,
    });
  }
  rentable = await db.productVariant.findMany({ where: { organizationId: organization.id, rentable: true }, orderBy: { sku: "asc" } });
  for (const variant of rentable) {
    await postOpeningStock(actor, {
      variantId: variant.id,
      locationId: sales.id,
      quantity: "5",
      unitCost: "40",
      postingKey: `demo-opening:${variant.id}`,
      reason: "სატესტო გასაქირავებელი ნაშთი",
    });
  }

  let quoteCount = await db.quote.count({ where: { organizationId: organization.id, status: "draft" } });
  for (let index = quoteCount; index < TARGET; index += 1) {
    const variant = variants[index % variants.length];
    await createQuote(actor, {
      customerId: customers[index % customers.length].id,
      notes: "სატესტო შეთავაზება",
      lines: [{ variantId: variant.id, quantity: "2" }],
    });
  }

  let orderCount = await db.salesOrder.count({ where: { organizationId: organization.id } });
  for (let index = orderCount; index < TARGET; index += 1) {
    const variant = variants[index % variants.length];
    const quote = await createQuote(actor, {
      customerId: customers[(index + 3) % customers.length].id,
      lines: [{ variantId: variant.id, quantity: "1" }],
    });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
  }

  const fulfilled = await db.salesOrder.findMany({
    where: { organizationId: organization.id, status: "fulfilled", invoices: { none: {} } },
    orderBy: { createdAt: "asc" },
  });
  let invoiceCount = await db.invoice.count({ where: { organizationId: organization.id } });
  for (const order of fulfilled) {
    if (invoiceCount >= TARGET) break;
    await createInvoiceFromOrder(actor, order.id);
    invoiceCount += 1;
  }

  const invoices = await db.invoice.findMany({
    where: { organizationId: organization.id, status: "posted" },
    include: { allocations: true },
    orderBy: { createdAt: "asc" },
  });
  let paymentCount = await db.payment.count({ where: { organizationId: organization.id, kind: "payment" } });
  for (const invoice of invoices) {
    if (paymentCount >= TARGET) break;
    const allocated = invoice.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D(0));
    const remaining = D(invoice.total).minus(allocated);
    if (remaining.lte(0)) continue;
    const amount = remaining.gt(15) ? "15.00" : remaining.toFixed(2);
    await recordPayment(actor, {
      customerId: invoice.customerId,
      amount,
      method: paymentCount % 2 === 0 ? "bank" : "cash",
      paidOn: "2026-10-19",
      reference: `სატესტო ${paymentCount + 1}`,
      postingKey: `demo-pay:${invoice.id}`,
      allocations: [{ invoiceId: invoice.id, amount }],
    });
    paymentCount += 1;
  }

  let assets = await db.rentalAsset.findMany({ where: { organizationId: organization.id }, orderBy: { code: "asc" } });
  for (let index = assets.length; index < TARGET; index += 1) {
    await createRentalAsset(actor, { variantId: rentable[index % rentable.length].id, code: `DEMO-A${String(index + 1).padStart(2, "0")}` });
  }
  assets = await db.rentalAsset.findMany({ where: { organizationId: organization.id, status: "available" }, orderBy: { code: "asc" } });
  let bookingCount = await db.rentalBooking.count({ where: { organizationId: organization.id } });
  for (let index = bookingCount; index < TARGET && index < assets.length; index += 1) {
    const start = addDaysIso("2026-11-02", index * 5);
    await bookRental(actor, {
      customerId: customers[index % customers.length].id,
      assetIds: [assets[index].id],
      startOn: start,
      endOn: addDaysIso(start, 2),
      priceModel: "daily",
      dailyRate: "25",
      depositAmount: "50",
      postingKey: `demo-rent:${assets[index].code}`,
    });
  }

  let contracts = await db.maintenanceContract.count({ where: { organizationId: organization.id } });
  for (let index = contracts; index < TARGET; index += 1) {
    const contract = await createMaintenanceContract(actor, {
      customerId: customers[index % customers.length].id,
      percent: "10",
      startOn: "2026-10-01",
      lines: [{ description: `${PLANTS[index % PLANTS.length]} ობიექტზე`, quantity: "10", referenceUnitPrice: "40" }],
    });
    await setContractStatus(actor, contract.id, "active");
  }

  let programs = await db.excursionProgram.findMany({ where: { organizationId: organization.id }, orderBy: { nameKa: "asc" } });
  for (let index = programs.length; index < TARGET; index += 1) {
    await createProgram(actor, {
      nameKa: PROGRAMS[index % PROGRAMS.length],
      durationMinutes: 90,
      pricePerChild: "25",
      maxCapacity: 25,
      variantId: variants[0].id,
      qtyPerChild: "1",
    });
  }
  programs = await db.excursionProgram.findMany({ where: { organizationId: organization.id }, orderBy: { nameKa: "asc" } });

  let resourceCount = await db.resource.count({ where: { organizationId: organization.id } });
  for (let index = resourceCount; index < TARGET; index += 1) {
    await db.resource.create({ data: { organizationId: organization.id, nameKa: `სათბური ${index + 1}`, capacity: 1 } });
  }
  const resources = await db.resource.findMany({ where: { organizationId: organization.id }, orderBy: { nameKa: "asc" } });
  let excursionCount = await db.excursionBooking.count({ where: { organizationId: organization.id } });
  for (let index = excursionCount; index < TARGET; index += 1) {
    const day = addDaysIso("2026-11-03", index);
    await bookExcursion(actor, {
      customerId: customers[index % customers.length].id,
      programId: programs[index % programs.length].id,
      resourceId: resources[index % resources.length].id,
      startsAt: zonedDateTime(day, "13:00"),
      endsAt: zonedDateTime(day, "16:00"),
      plannedChildren: 8,
      postingKey: `demo-ex:${organization.id}:${index + 1}`,
    });
  }

  const summary = {
    customers: await db.customer.count({ where: { organizationId: organization.id, mergedIntoId: null } }),
    contacts: await db.contact.count({ where: { organizationId: organization.id } }),
    addresses: await db.address.count({ where: { organizationId: organization.id } }),
    activities: await db.activity.count({ where: { organizationId: organization.id } }),
    tasks: await db.task.count({ where: { organizationId: organization.id } }),
    products: await db.product.count({ where: { organizationId: organization.id } }),
    quotes: await db.quote.count({ where: { organizationId: organization.id } }),
    orders: await db.salesOrder.count({ where: { organizationId: organization.id } }),
    invoices: await db.invoice.count({ where: { organizationId: organization.id } }),
    payments: await db.payment.count({ where: { organizationId: organization.id } }),
    rentals: await db.rentalAsset.count({ where: { organizationId: organization.id } }),
    rentalBookings: await db.rentalBooking.count({ where: { organizationId: organization.id } }),
    maintenance: await db.maintenanceContract.count({ where: { organizationId: organization.id } }),
    programs: await db.excursionProgram.count({ where: { organizationId: organization.id } }),
    excursions: await db.excursionBooking.count({ where: { organizationId: organization.id } }),
  };
  console.log(summary);
}

void main();
