import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const BUSINESS_TIME_ZONE = "Asia/Tbilisi";

export function tbilisiDateString(now = new Date()): string {
  return formatInTimeZone(now, BUSINESS_TIME_ZONE, "yyyy-MM-dd");
}

export function tbilisiYear(now = new Date()): number {
  return Number(formatInTimeZone(now, BUSINESS_TIME_ZONE, "yyyy"));
}

export function parseDateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("თარიღის ფორმატი უნდა იყოს YYYY-MM-DD");
  }
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const GEORGIAN_MONTHS = [
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

export function formatGeorgianLongDate(iso: string): string {
  parseDateOnly(iso);
  const [year, month, day] = iso.split("-");
  return `${Number(day)} ${GEORGIAN_MONTHS[Number(month) - 1]} ${year}`;
}

export function formatGeorgianShortDate(iso: string): string {
  parseDateOnly(iso);
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseDateOnly(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function inclusiveDays(startIso: string, endIso: string): number {
  const start = parseDateOnly(startIso).getTime();
  const end = parseDateOnly(endIso).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days < 1) {
    throw new Error("დასრულება დაწყებაზე ადრე ვერ იქნება");
  }
  return days;
}

export function zonedDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date} ${time}:00`, BUSINESS_TIME_ZONE);
}

export function minutesOfDay(value: Date, timeZone = BUSINESS_TIME_ZONE): number {
  const hours = Number(formatInTimeZone(value, timeZone, "H"));
  const minutes = Number(formatInTimeZone(value, timeZone, "m"));
  return hours * 60 + minutes;
}

export function parseHm(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("საათის ფორმატი უნდა იყოს HH:MM");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function sameLocalDay(start: Date, end: Date, timeZone = BUSINESS_TIME_ZONE): boolean {
  return formatInTimeZone(start, timeZone, "yyyy-MM-dd") === formatInTimeZone(end, timeZone, "yyyy-MM-dd");
}

export function withinWindow(start: Date, end: Date, windowStart: string, windowEnd: string): boolean {
  if (!sameLocalDay(start, end)) return false;
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  return startMinutes >= parseHm(windowStart) && endMinutes <= parseHm(windowEnd) && endMinutes > startMinutes;
}

export function rentalOccupancy(startOn: string, endOn: string, bufferHours: number): {
  occupancyStart: Date;
  occupancyEnd: Date;
} {
  const start = zonedDateTime(startOn, "00:00");
  const endExclusive = zonedDateTime(addDaysIso(endOn, 1), "00:00");
  const bufferMs = bufferHours * 3_600_000;
  return {
    occupancyStart: new Date(start.getTime() - bufferMs),
    occupancyEnd: new Date(endExclusive.getTime() + bufferMs),
  };
}

export function monthKey(now = new Date()): string {
  return formatInTimeZone(now, BUSINESS_TIME_ZONE, "yyyy-MM");
}

export function periodBounds(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("პერიოდი უნდა იყოს YYYY-MM");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return { start: `${match[1]}-${match[2]}-01`, end: formatDateOnly(last) };
}
