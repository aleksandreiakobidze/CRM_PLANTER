export const LINE_KINDS = ["item", "excursion", "greening", "repot", "maintenance", "service"] as const;

export type LineKind = (typeof LINE_KINDS)[number];

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  item: "აითემი",
  excursion: "ექსკურსია",
  greening: "გამწვანება",
  repot: "გადარგვა",
  maintenance: "მოვლა",
  service: "სხვა სერვისი",
};

export const SERVICE_KINDS = LINE_KINDS.filter((kind) => kind !== "item");

export function isLineKind(value: string): value is LineKind {
  return (LINE_KINDS as readonly string[]).includes(value);
}

export function isStockLine(kind: string): boolean {
  return kind === "item";
}
