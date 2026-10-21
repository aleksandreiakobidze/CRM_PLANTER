import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Clock, FileText, Leaf, Receipt, ShoppingCart, Truck, Warehouse } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AgingBucket } from "@/server/features/reports/ops-reports";
import { D, moneyPrint } from "@/server/money";

const MONTHS = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

const AGING_BUCKETS = [
  { key: "0–30", label: "0–30 დღე", bar: "bg-success-500", badge: "success" as const },
  { key: "31–60", label: "31–60 დღე", bar: "bg-brand-500", badge: "primary" as const },
  { key: "61–90", label: "61–90 დღე", bar: "bg-warning-500", badge: "warning" as const },
  { key: "90+", label: "90+ დღე", bar: "bg-error-500", badge: "error" as const },
];

type Sales = {
  sold: string;
  invoiced: string;
  received: string;
  cogs: string;
  grossMargin: string;
};

export function ReportsBoard({
  month,
  from,
  to,
  showSales,
  sales,
  overdue,
  aging,
  openPoCount,
  batchCount,
  deliveryStopCount,
}: {
  month: string;
  from: string;
  to: string;
  showSales: boolean;
  sales: Sales | null;
  overdue: string;
  aging: AgingBucket[];
  openPoCount: number;
  batchCount: number;
  deliveryStopCount: number;
}) {
  const monthName = MONTHS[Number(month.slice(5)) - 1] ?? month;
  const year = month.slice(0, 4);
  const agingGroups = AGING_BUCKETS.map((bucket) => {
    const rows = aging.filter((row) => row.bucket === bucket.key);
    const amount = rows.reduce((sum, row) => sum.plus(D(row.remaining)), D("0"));
    return { ...bucket, count: rows.length, amount };
  });
  const agingTotal = agingGroups.reduce((sum, group) => sum.plus(group.amount), D("0"));
  const moneyBars = sales
    ? [
        { label: "გაყიდული", value: sales.sold, bar: "bg-brand-500" },
        { label: "დარიცხული", value: sales.invoiced, bar: "bg-success-500" },
        { label: "შემოსული", value: sales.received, bar: "bg-warning-500" },
      ]
    : [];
  const moneyMax = Math.max(...moneyBars.map((row) => Number(row.value)), 0) || 1;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">რეპორტები</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {monthName} {year} · {from} — {to}
          </p>
        </div>
        {showSales ? (
          <Button asChild variant="secondary">
            <Link href={`/export/reports?from=${from}&to=${to}`}>
              <FileText size={16} />
              Excel
            </Link>
          </Button>
        ) : null}
      </div>

      <Card className="p-5">
        <form className="flex flex-wrap items-end gap-4" action="/reports" aria-label="პერიოდის არჩევა">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="report-month">პერიოდი</Label>
            <Input id="report-month" name="month" type="month" defaultValue={month} />
          </div>
          <Button type="submit">გახსნა</Button>
        </form>
      </Card>

      {showSales && sales ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="გაყიდული" value={sales.sold} hint="მიწოდებული შეკვეთა" icon={<ShoppingCart size={18} />} tone="brand" />
        <MetricCard title="დარიცხული" value={sales.invoiced} hint="გატარებული ინვოისი" icon={<Receipt size={18} />} tone="success" />
        <MetricCard title="შემოსული" value={sales.received} hint="რეალური გადახდა" icon={<FileText size={18} />} tone="warning" />
        <MetricCard title="ვადაგადაცილება" value={overdue} hint={`${aging.length} ღია ინვოისი`} icon={<Clock size={18} />} tone="error" />
      </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">გაყიდვების თანხას მხოლოდ ადმინი ხედავს.</p>
        </Card>
      )}

      {showSales && sales ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>თვიური ჯამები</CardTitle>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">გაყიდული, დარიცხული და შემოსული ცალკეა.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {moneyBars.map((row) => (
              <BarRow key={row.label} label={row.label} amount={row.value} percent={(Number(row.value) / moneyMax) * 100} bar={row.bar} />
            ))}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <MiniStat label="მთლიანი მარჟა" value={sales.grossMargin} />
              <MiniStat label="თვითღირებულება" value={sales.cogs} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ვადაგადაცილების ჯგუფები</CardTitle>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              სულ {moneyPrint(agingTotal)} ₾ დარჩენილი.
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5" role="img" aria-label="ვადაგადაცილების განაწილება">
              {agingGroups.map((group) => {
                const width = agingTotal.gt(0) ? Number(group.amount.div(agingTotal).mul(100).toFixed(2)) : 0;
                if (width <= 0) return null;
                return <span key={group.key} className={group.bar} style={{ width: `${width}%` }} title={`${group.label}: ${moneyPrint(group.amount)} ₾`} />;
              })}
            </div>
            <div className="space-y-3">
              {agingGroups.map((group) => (
                <div key={group.key} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${group.bar}`} aria-hidden />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{group.label}</span>
                    <Badge variant={group.badge}>{group.count}</Badge>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">{moneyPrint(group.amount)} ₾</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <OpsLink href="/purchases" title="ღია შესყიდვა" value={openPoCount} hint="შეკვეთილი ან ნაწილობრივ მიღებული" icon={<Warehouse size={18} />} />
        <OpsLink href="/greenhouse" title="სათბურის პარტია" value={batchCount} hint="ღია პარტია" icon={<Leaf size={18} />} />
        <OpsLink href="/delivery" title="დღის გაჩერება" value={deliveryStopCount} hint="მარშრუტის გაჩერება" icon={<Truck size={18} />} />
      </div>

      {showSales ? (
      <>
      <Card>
        <CardHeader className="mb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>ვადაგადაცილებული ინვოისები</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">დარჩენილი თანხა დღეების მიხედვით.</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/finance/invoices">
                ინვოისები
                <ChevronRight size={14} />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {aging.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">ვადაგადაცილებული ინვოისი არ არის.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ინვოისი</TableHead>
                    <TableHead>კლიენტი</TableHead>
                    <TableHead>დარჩენილი</TableHead>
                    <TableHead>ჯგუფი</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((row) => {
                    const tone = AGING_BUCKETS.find((bucket) => bucket.key === row.bucket);
                    return (
                      <TableRow key={row.invoiceId}>
                        <TableCell className="whitespace-nowrap">
                          <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/finance/invoices/${row.invoiceId}`}>
                            {row.number ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell className="whitespace-nowrap font-semibold tabular-nums">{moneyPrint(row.remaining)} ₾</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <Badge variant={tone?.badge ?? "light"}>{row.bucket}</Badge>
                            <span className="text-xs text-gray-500">{row.days} დღე</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          გაყიდული არის მიწოდებული შეკვეთის ხაზის ჯამი. დარიცხული — გატარებული ინვოისის ჯამი გამოწერის თარიღით. შემოსული — რეალური გადახდები გადახდის თარიღით. დეპოზიტი შემოსულში არ შედის. მარჟა თვითღირებულებას აკლებს, საოპერაციო ხარჯამდე.
        </p>
      </Card>
      </>
      ) : null}
    </section>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "brand" | "success" | "warning" | "error";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
    error: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-[26px] font-bold tracking-tight text-gray-800 tabular-nums dark:text-white/90">{moneyPrint(value)} ₾</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
    </Card>
  );
}

function BarRow({ label, amount, percent, bar }: { label: string; amount: string; percent: number; bar: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-semibold tabular-nums text-gray-800 dark:text-white/90">{moneyPrint(amount)} ₾</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
        <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-gray-800 dark:text-white/90">{moneyPrint(value)} ₾</p>
    </div>
  );
}

function OpsLink({ href, title, value, hint, icon }: { href: string; title: string; value: number; hint: string; icon: ReactNode }) {
  return (
    <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/10">
      <Card className="h-full p-5 transition-colors hover:border-brand-300 dark:hover:border-brand-400">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">{icon}</span>
          <ChevronRight className="text-gray-400" size={16} />
        </div>
        <p className="mt-4 text-[26px] font-bold tracking-tight text-gray-800 tabular-nums dark:text-white/90">{value}</p>
        <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      </Card>
    </Link>
  );
}
