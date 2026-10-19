ALTER TABLE "customers" ADD COLUMN "venue_type" TEXT;
ALTER TABLE "customers" ADD COLUMN "website" TEXT;
ALTER TABLE "customers" ADD COLUMN "maps_url" TEXT;
ALTER TABLE "customers" ADD COLUMN "priority" TEXT;
ALTER TABLE "customers" ADD COLUMN "verification" TEXT;

CREATE INDEX "customers_organization_id_district_idx" ON "customers"("organization_id", "district");
CREATE INDEX "customers_organization_id_venue_type_idx" ON "customers"("organization_id", "venue_type");
CREATE INDEX "customers_organization_id_priority_idx" ON "customers"("organization_id", "priority");
