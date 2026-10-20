ALTER TABLE "organizations" ADD COLUMN "auto_invoice_after_waybill" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sales_orders" ADD COLUMN "notes" TEXT;
ALTER TABLE "sales_orders" ALTER COLUMN "status" SET DEFAULT 'open';
UPDATE "sales_orders" SET "status" = 'open' WHERE "status" = 'draft';
UPDATE "sales_orders" SET "status" = 'authorized' WHERE "status" = 'confirmed';
UPDATE "sales_orders" SET "status" = 'completed' WHERE "status" = 'fulfilled';

ALTER TABLE "fulfillments" ADD COLUMN "waybill_type" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "fulfillments" ADD COLUMN "driver_tin" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "driver_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "car_number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "transport_text" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "start_address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "end_address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fulfillments" ADD COLUMN "begin_on" DATE;
ALTER TABLE "fulfillments" ADD COLUMN "rs_waybill_id" TEXT;
ALTER TABLE "fulfillments" ADD COLUMN "rs_waybill_number" TEXT;
ALTER TABLE "fulfillments" ADD COLUMN "rs_error" TEXT;

ALTER TABLE "integration_connections" ADD COLUMN "secret_cipher" TEXT;

CREATE TABLE "internal_shipments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "from_location_id" TEXT NOT NULL,
    "to_location_id" TEXT NOT NULL,
    "driver_tin" TEXT NOT NULL DEFAULT '',
    "driver_name" TEXT NOT NULL DEFAULT '',
    "car_number" TEXT NOT NULL DEFAULT '',
    "transport_text" TEXT NOT NULL DEFAULT '',
    "start_address" TEXT NOT NULL DEFAULT '',
    "end_address" TEXT NOT NULL DEFAULT '',
    "begin_on" DATE,
    "rs_waybill_id" TEXT,
    "rs_waybill_number" TEXT,
    "rs_error" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_shipment_lines" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT "internal_shipment_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_shipments_organization_id_number_key" ON "internal_shipments"("organization_id", "number");
CREATE UNIQUE INDEX "internal_shipments_posting_key_key" ON "internal_shipments"("posting_key");
CREATE INDEX "internal_shipment_lines_shipment_id_idx" ON "internal_shipment_lines"("shipment_id");

ALTER TABLE "internal_shipments" ADD CONSTRAINT "internal_shipments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_shipments" ADD CONSTRAINT "internal_shipments_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_shipments" ADD CONSTRAINT "internal_shipments_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_shipment_lines" ADD CONSTRAINT "internal_shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "internal_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_shipment_lines" ADD CONSTRAINT "internal_shipment_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
