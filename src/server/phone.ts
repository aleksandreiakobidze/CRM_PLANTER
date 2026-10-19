export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("995") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith("5")) return `+995${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return digits;
}

export function phoneParts(input: string): string[] {
  return input.split(/[/|,;]+/).map((part) => part.trim()).filter(Boolean);
}

export function primaryPhone(input: string): string {
  const parts = phoneParts(input).map((part) => normalizePhone(part)).filter(Boolean);
  return parts.find((part) => part.startsWith("+9955")) || parts[0] || "";
}

export function displayPhone(phone?: string | null, normalized?: string | null): string {
  const raw = phone?.trim() || "";
  if (phoneParts(raw).length > 1) return raw;
  return normalized || raw || "—";
}
