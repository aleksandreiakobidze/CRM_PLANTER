export class BusinessError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, "P2002") || textOf(error).includes("23505");
}

export function isExclusionViolation(error: unknown): boolean {
  const text = textOf(error);
  return text.includes("23P01") || text.includes("asset_reservations_no_overlap");
}

export function isRetryableTransaction(error: unknown): boolean {
  const text = textOf(error);
  return (
    hasCode(error, "P2034") ||
    text.includes("40001") ||
    text.includes("40P01") ||
    text.includes("could not serialize") ||
    text.includes("deadlock detected")
  );
}

export function publicMessage(error: unknown): string {
  if (error instanceof BusinessError) return error.message;
  if (isExclusionViolation(error)) return "ეს რესურსი არჩეულ პერიოდში უკვე დაკავებულია";
  const id = crypto.randomUUID();
  console.error(`[${id}]`, error);
  return "ოპერაცია ვერ შესრულდა. სცადეთ თავიდან.";
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === code;
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${JSON.stringify(error)}`;
  return String(error);
}
