export function variantLabel(variant: { internalCode?: string | null; sku: string; nameKa: string }): string {
  const codes = [variant.internalCode, variant.sku !== variant.internalCode ? variant.sku : null].filter(Boolean).join(" · ");
  return codes ? `${codes} — ${variant.nameKa}` : variant.nameKa;
}
