export type BadgeTone = "light" | "warning" | "primary" | "success" | "error";

export const RELATIONSHIP: Record<string, { label: string; color: string; tone: BadgeTone }> = {
  fresh: { label: "ახალი", color: "#667085", tone: "light" },
  to_contact: { label: "უნდა დავაკონტაქტო", color: "#dc6803", tone: "warning" },
  quote_sent: { label: "შეთავაზება გავაგზავნე", color: "#465fff", tone: "primary" },
  customer: { label: "მომხმარებელი გახდა", color: "#039855", tone: "success" },
  declined: { label: "არ სურს", color: "#d92d20", tone: "error" },
};

export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: "ღია",
    draft: "ღია",
    authorized: "ავტორიზებული",
    confirmed: "ავტორიზებული",
    completed: "დასრულებული",
    fulfilled: "დასრულებული",
    rs_error: "RS შეცდომა",
    cancelled: "გაუქმებული",
  };
  return labels[status] ?? status;
}

export function statusBadge(code: string) {
  return RELATIONSHIP[code] ?? { label: code, color: "#667085", tone: "light" as const };
}

export const PRIORITY: Record<string, { label: string; short: string; hint: string; color: string }> = {
  A: { label: "A · მაღალი", short: "A", hint: "დამოუკიდებელი რესტორანი — მცენარის შანსი მაღალია", color: "#027a48" },
  B: { label: "B · საშუალო", short: "B", hint: "კაფე, საცხობი ან ქსელის ფილიალი", color: "#dc6803" },
  C: { label: "C · დაბალი", short: "C", hint: "სწრაფი კვება ან კიოსკი — გადაწყვეტილება იშვიათად ადგილზეა", color: "#475467" },
};

export const VERIFICATION: Record<string, { label: string; color: string }> = {
  verified: { label: "დადასტურებული", color: "#465fff" },
};

export const SEGMENT_LABEL: Record<string, string> = {
  horeca: "HoReCa",
  person: "კერძო პირი",
  office: "ოფისი",
  school: "სკოლა",
  other: "სხვა",
};

export function externalHref(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function hostLabel(value: string): string {
  try {
    return new URL(externalHref(value)).hostname.replace(/^www\./, "");
  } catch {
    return "ბმული";
  }
}
