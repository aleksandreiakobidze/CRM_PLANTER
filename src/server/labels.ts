export const RELATIONSHIP: Record<string, { label: string; color: string }> = {
  fresh: { label: "ახალი", color: "#6b7280" },
  to_contact: { label: "უნდა დავაკონტაქტო", color: "#a16207" },
  quote_sent: { label: "შეთავაზება გავაგზავნე", color: "#2563eb" },
  customer: { label: "მომხმარებელი გახდა", color: "#15803d" },
  declined: { label: "არ სურს", color: "#dc2626" },
};

export function statusBadge(code: string) {
  return RELATIONSHIP[code] ?? { label: code, color: "#6b7280" };
}

export const PRIORITY: Record<string, { label: string; short: string; hint: string; color: string }> = {
  A: { label: "A · მაღალი", short: "A", hint: "დამოუკიდებელი რესტორანი — მცენარის შანსი მაღალია", color: "#14532d" },
  B: { label: "B · საშუალო", short: "B", hint: "კაფე, საცხობი ან ქსელის ფილიალი", color: "#a16207" },
  C: { label: "C · დაბალი", short: "C", hint: "სწრაფი კვება ან კიოსკი — გადაწყვეტილება იშვიათად ადგილზეა", color: "#4b5563" },
};

export const VERIFICATION: Record<string, { label: string; color: string }> = {
  verified: { label: "დადასტურებული", color: "#0f766e" },
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
