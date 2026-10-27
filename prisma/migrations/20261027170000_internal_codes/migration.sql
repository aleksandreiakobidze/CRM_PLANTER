ALTER TABLE "product_variants" ADD COLUMN "internal_code" TEXT;
ALTER TABLE "rental_assets" ADD COLUMN "internal_code" TEXT;

CREATE UNIQUE INDEX "product_variants_organization_id_internal_code_key" ON "product_variants"("organization_id", "internal_code");
CREATE UNIQUE INDEX "rental_assets_organization_id_internal_code_key" ON "rental_assets"("organization_id", "internal_code");
