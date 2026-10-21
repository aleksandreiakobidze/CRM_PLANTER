import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { CustomerBoard } from "@/components/customer-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { customerFilterOptions, customerListFilters, customerListWhere, type CustomerListFilters, type CustomerListParams } from "@/server/features/crm/customer-list";
import { placeOption } from "@/server/features/crm/place-terms";
import { statusBadge } from "@/server/labels";
import { displayPhone } from "@/server/phone";

const STATUSES = [
  { value: "", label: "ყველა" },
  { value: "fresh", label: "ახალი" },
  { value: "to_contact", label: "უნდა დავაკონტაქტო" },
  { value: "quote_sent", label: "შეთავაზება გავაგზავნე" },
  { value: "customer", label: "მომხმარებელი გახდა" },
  { value: "declined", label: "არ სურს" },
];
const PRIORITY_FILTER = [
  { value: "", label: "ყველა" },
  { value: "A", label: "A · მაღალი" },
  { value: "B", label: "B · საშუალო" },
  { value: "C", label: "C · დაბალი" },
];
const PRESENCE = [
  { value: "", label: "ყველა" },
  { value: "yes", label: "აქვს" },
  { value: "no", label: "არ აქვს" },
];
const VERIFIED = [
  { value: "", label: "ყველა" },
  { value: "yes", label: "დადასტურებული" },
  { value: "no", label: "დაუდასტურებელი" },
];

function exportHref(filters: CustomerListFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/export/customers?${query}` : "/export/customers";
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<CustomerListParams> }) {
  const actor = await getActor();
  const params = await searchParams;
  const options = await customerFilterOptions(actor.organizationId);
  const filters = customerListFilters(params, options.types, options.zones, options.cities, options.regions);
  const { typeChoices, zoneChoices, cityChoices, regionChoices, total } = options;
  const customers = await getDb().customer.findMany({
    where: customerListWhere(actor.organizationId, filters),
    include: { addresses: { take: 1, orderBy: { line1: "asc" } } },
    orderBy: [{ priority: "asc" }, { name: "asc" }, { district: "asc" }],
  });
  const active = Object.values(filters).some(Boolean);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">კლიენტები</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {active ? `${customers.length} ნაჩვენებია, სულ ${total}` : `${total} ობიექტი`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={exportHref(filters)}>Excel</Link>
          </Button>
          <Button asChild>
            <Link href="/crm/customers/new">ახალი კლიენტი</Link>
          </Button>
        </div>
      </div>
      <Card className="p-5">
        <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="search" aria-label="კლიენტების ფილტრი">
          <div className="min-w-0">
            <Label htmlFor="customer-q">ძებნა</Label>
            <Input id="customer-q" name="q" defaultValue={filters.q} placeholder="სახელი, ს/კ, ტელეფონი, მისამართი" />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-type">ტიპი</Label>
            <ComboBox name="type" options={[{ value: "", label: "ყველა" }, ...typeChoices.map(placeOption)]} defaultValue={filters.type} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-zone">ზონა</Label>
            <ComboBox name="zone" options={[{ value: "", label: "ყველა" }, ...zoneChoices.map(placeOption)]} defaultValue={filters.zone} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-city">ქალაქი</Label>
            <ComboBox name="city" options={[{ value: "", label: "ყველა" }, ...cityChoices.map(placeOption)]} defaultValue={filters.city} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-region">რეგიონი</Label>
            <ComboBox name="region" options={[{ value: "", label: "ყველა" }, ...regionChoices.map(placeOption)]} defaultValue={filters.region} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-priority">პრიორიტეტი</Label>
            <ComboBox name="priority" options={PRIORITY_FILTER} defaultValue={filters.priority} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-status">სტატუსი</Label>
            <ComboBox name="status" options={STATUSES} defaultValue={filters.status} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-phone">ტელეფონი</Label>
            <ComboBox name="phone" options={PRESENCE} defaultValue={filters.phone} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-web">ვებგვერდი</Label>
            <ComboBox name="web" options={PRESENCE} defaultValue={filters.web} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-verified">ვერიფიკაცია</Label>
            <ComboBox name="verified" options={VERIFIED} defaultValue={filters.verified} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit">ჩვენება</Button>
            {active ? (
              <Button asChild variant="secondary">
                <Link href="/crm/customers">გასუფთავება</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
      {customers.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">{active ? "ამ ფილტრს არაფერი ემთხვევა." : "კლიენტი ჯერ არ არის."}</p>
        </Card>
      ) : (
        <CustomerBoard
          key={JSON.stringify(filters)}
          customers={customers.map((customer) => {
            const status = statusBadge(customer.relationshipStatus);
            return {
              id: customer.id,
              name: customer.name,
              type: customer.venueType || "",
              zone: customer.district || "",
              phone: displayPhone(customer.phone, customer.phoneNormalized),
              status: status.label,
              statusTone: status.tone,
              lat: customer.latitude == null ? null : Number(customer.latitude),
              lng: customer.longitude == null ? null : Number(customer.longitude),
            };
          })}
        />
      )}
    </section>
  );
}
