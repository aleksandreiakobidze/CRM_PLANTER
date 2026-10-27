export type BadgeTone = "light" | "warning" | "primary" | "success" | "error";

export const RELATIONSHIP: Record<string, { label: string; color: string; tone: BadgeTone }> = {
  fresh: { label: "ახალი", color: "#667085", tone: "light" },
  to_contact: { label: "უნდა დავაკონტაქტო", color: "#dc6803", tone: "warning" },
  quote_sent: { label: "შეთავაზება გავაგზავნე", color: "#465fff", tone: "primary" },
  customer: { label: "მომხმარებელი გახდა", color: "#039855", tone: "success" },
  declined: { label: "არ სურს", color: "#d92d20", tone: "error" },
};

export const PHOTO_ALLOWED_FIELD = "\u10e4\u10dd\u10e2\u10dd\u10d2\u10d0\u10d3\u10d0\u10e6\u10d4\u10d1\u10d0 \u10e8\u10d4\u10d8\u10eb\u10da\u10d4\u10d1\u10d0";
export const PHOTO_ALLOWED_SHORT = "\u10e4\u10dd\u10e2\u10dd";

export function photoAllowedLabel(allowed: boolean): string {
  return allowed
    ? "\u10e4\u10dd\u10e2\u10dd \u10e8\u10d4\u10d8\u10eb\u10da\u10d4\u10d1\u10d0"
    : "\u10e4\u10dd\u10e2\u10dd \u10d0\u10e0 \u10e8\u10d4\u10d8\u10eb\u10da\u10d4\u10d1\u10d0";
}

export function excursionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "\u10db\u10dd\u10d7\u10ee\u10dd\u10d5\u10dc\u10d8\u10da\u10d8",
    confirmed: "\u10d3\u10d0\u10d3\u10d0\u10e1\u10e2\u10e3\u10e0\u10d4\u10d1\u10e3\u10da\u10d8",
    completed: "\u10d3\u10d0\u10e1\u10e0\u10e3\u10da\u10d4\u10d1\u10e3\u10da\u10d8",
    cancelled: "\u10d2\u10d0\u10e3\u10e5\u10db\u10d4\u10d1\u10e3\u10da\u10d8",
  };
  return labels[status] ?? status;
}

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

export type DocKind = "purchase" | "quote" | "invoice" | "order" | "receipt";

const DOC_STATUS: Record<DocKind, Record<string, { label: string; tone: BadgeTone }>> = {
  purchase: {
    draft: { label: "დრაფტი", tone: "light" },
    ordered: { label: "გაგზავნილი", tone: "primary" },
    partial: { label: "ნაწილობრივ მიღებული", tone: "warning" },
    received: { label: "მიღებული", tone: "success" },
    cancelled: { label: "გაუქმებული", tone: "error" },
  },
  quote: {
    draft: { label: "დრაფტი", tone: "light" },
    sent: { label: "გაგზავნილი", tone: "primary" },
    accepted: { label: "მიღებული", tone: "success" },
    declined: { label: "უარყოფილი", tone: "error" },
    converted: { label: "შეკვეთა გახდა", tone: "success" },
  },
  invoice: {
    draft: { label: "დრაფტი", tone: "light" },
    posted: { label: "გატარებული", tone: "primary" },
    paid: { label: "გადახდილი", tone: "success" },
    cancelled: { label: "გაუქმებული", tone: "error" },
  },
  order: {
    open: { label: "ღია", tone: "light" },
    draft: { label: "ღია", tone: "light" },
    authorized: { label: "ავტორიზებული", tone: "primary" },
    confirmed: { label: "ავტორიზებული", tone: "primary" },
    completed: { label: "დასრულებული", tone: "success" },
    fulfilled: { label: "დასრულებული", tone: "success" },
    rs_error: { label: "RS შეცდომა", tone: "error" },
    cancelled: { label: "გაუქმებული", tone: "error" },
  },
  receipt: {
    posted: { label: "გატარებული", tone: "success" },
  },
};

export function docStatus(kind: DocKind, code: string): { label: string; tone: BadgeTone } {
  return DOC_STATUS[kind][code] ?? { label: code, tone: "light" };
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
