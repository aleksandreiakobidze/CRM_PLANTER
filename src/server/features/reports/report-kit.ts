import { formatInTimeZone } from "date-fns-tz";
import { D, Decimal } from "@/server/money";
import { addDaysIso, BUSINESS_TIME_ZONE, parseDateOnly, periodBounds, tbilisiDateString, zonedDateTime } from "@/server/time";

export const MONTH_LABEL = [
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

export type ReportPeriod = { from: string; to: string; start: Date; end: Date };

function validIso(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    parseDateOnly(value);
    return value;
  } catch {
    return null;
  }
}

export function reportPeriod(input: { from?: string | null; to?: string | null }): ReportPeriod {
  const month = periodBounds(tbilisiDateString().slice(0, 7));
  const today = tbilisiDateString();
  let from = validIso(input.from) ?? month.start;
  let to = validIso(input.to) ?? (validIso(input.from) ? (from > today ? from : today) : month.end);
  if (to < from) [from, to] = [to, from];
  return { from, to, start: zonedDateTime(from, "00:00"), end: zonedDateTime(addDaysIso(to, 1), "00:00") };
}

export function monthOf(value: Date) {
  return formatInTimeZone(value, BUSINESS_TIME_ZONE, "yyyy-MM");
}

export function monthLabel(key: string) {
  const index = Number(key.slice(5, 7)) - 1;
  return `${MONTH_LABEL[index] ?? key} ${key.slice(0, 4)}`;
}

export function dayOf(value: Date) {
  return formatInTimeZone(value, BUSINESS_TIME_ZONE, "dd.MM.yyyy");
}

export type Bucket = { key: string; label: string; count: number; quantity: Decimal; amount: Decimal };

export class Groups {
  private map = new Map<string, Bucket>();

  add(key: string, label: string, values: { count?: number; quantity?: Decimal.Value; amount?: Decimal.Value } = {}) {
    const bucket = this.map.get(key) ?? { key, label, count: 0, quantity: D(0), amount: D(0) };
    bucket.count += values.count ?? 1;
    bucket.quantity = bucket.quantity.plus(values.quantity ?? 0);
    bucket.amount = bucket.amount.plus(values.amount ?? 0);
    this.map.set(key, bucket);
  }

  sorted(by: "count" | "quantity" | "amount" | "key" = "count", limit?: number): Bucket[] {
    const rows = [...this.map.values()].sort((a, b) => {
      if (by === "key") return a.key.localeCompare(b.key);
      if (by === "count") return b.count - a.count || a.label.localeCompare(b.label);
      return b[by].comparedTo(a[by]) || a.label.localeCompare(b.label);
    });
    return limit ? rows.slice(0, limit) : rows;
  }
}

export function percent(part: Decimal.Value, whole: Decimal.Value) {
  const total = D(whole);
  if (total.lte(0)) return null;
  return D(part).div(total).mul(100).toDecimalPlaces(1).toNumber();
}

export function searchString(params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}
