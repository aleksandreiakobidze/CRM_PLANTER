import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { nextInternalCode } from "@/server/features/catalog/internal-code";
import { D } from "@/server/money";

export async function createVariant(
  actor: Actor,
  input: {
    category: string;
    productName: string;
    speciesId?: string;
    sku: string;
    variantName: string;
    listPrice: string;
    potVolumeLiters?: string;
    sellable?: boolean;
    rentable?: boolean;
    careNotes?: string;
  },
) {
  requirePermission(actor, "catalog.write");
  if (!input.variantName.trim()) throw new BusinessError("სახელი სავალდებულოა", "validation");
  const price = D(input.listPrice);
  if (price.lt(0)) throw new BusinessError("ფასი უარყოფითი ვერ იქნება", "validation");
  return getDb().$transaction(async (tx) => {
    const internalCode = await nextInternalCode(tx, actor.organizationId, "variant");
    const sku = input.sku.trim() || internalCode;
    if (await tx.productVariant.findFirst({ where: { organizationId: actor.organizationId, sku }, select: { id: true } })) {
      throw new BusinessError("ეს SKU უკვე არსებობს", "validation");
    }
    const product = await tx.product.create({
      data: {
        organizationId: actor.organizationId,
        category: input.category,
        nameKa: input.productName,
        speciesId: input.speciesId || null,
        careNotes: input.careNotes || null,
      },
    });
    return tx.productVariant.create({
      data: {
        organizationId: actor.organizationId,
        productId: product.id,
        sku,
        internalCode,
        nameKa: input.variantName.trim(),
        listPrice: price.toFixed(4),
        potVolumeLiters: input.potVolumeLiters ? D(input.potVolumeLiters).toFixed(3) : null,
        sellable: input.sellable ?? true,
        rentable: input.rentable ?? false,
      },
    });
  });
}

export async function updateListPrice(actor: Actor, variantId: string, listPrice: string) {
  requirePermission(actor, "catalog.write");
  const variant = await getDb().productVariant.findFirst({ where: { id: variantId, organizationId: actor.organizationId } });
  if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
  return getDb().productVariant.update({
    where: { id: variant.id },
    data: { listPrice: D(listPrice).toFixed(4) },
  });
}

export async function setPriceListEntry(actor: Actor, input: { variantId: string; unitPrice: string; minQty?: string }) {
  requirePermission(actor, "catalog.write");
  const list = await getDb().priceList.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: actor.organizationId, code: "retail" } },
  });
  return getDb().priceListEntry.create({
    data: {
      priceListId: list.id,
      variantId: input.variantId,
      unitPrice: D(input.unitPrice).toFixed(4),
      minQty: D(input.minQty ?? "1").toFixed(3),
    },
  });
}

export async function publicCare(sku: string) {
  const variant = await getDb().productVariant.findFirst({
    where: { sku, active: true },
    include: { product: { include: { species: true } } },
  });
  if (!variant) return null;
  return {
    name: variant.product.nameKa,
    sku: variant.sku,
    species: variant.product.species?.nameKa ?? null,
    light: variant.product.light,
    water: variant.product.water,
    humidity: variant.product.humidity,
    careNotes: variant.product.careNotes,
    videoUrl: variant.product.videoUrl,
    frostHardiness: variant.product.frostHardiness,
  };
}
