ALTER TABLE "organizations" ADD COLUMN "portal_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "staff_assignments" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "staff_assignments" ADD COLUMN "event_booking_id" TEXT;

ALTER TABLE "resource_reservations" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "resource_reservations" ADD COLUMN "event_booking_id" TEXT;

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'GE',
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "contact" TEXT,
    "lead_days" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "expected_on" DATE,
    "notes" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,
    "received_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "purchase_line_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "returned_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "landed_costs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "fx_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "note" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "landed_costs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "landed_cost_allocations" (
    "id" TEXT NOT NULL,
    "landed_cost_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "posting_key" TEXT NOT NULL,
    CONSTRAINT "landed_cost_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "growth_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'received',
    "quantity" DECIMAL(18,3) NOT NULL,
    "expected_ready_on" DATE,
    "received_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "growth_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "greenhouse_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "done_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "actor_id" TEXT,
    CONSTRAINT "greenhouse_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "posting_key" TEXT NOT NULL,
    "counted_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_count_lines" (
    "id" TEXT NOT NULL,
    "count_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "counted_qty" DECIMAL(18,3) NOT NULL,
    "difference" DECIMAL(18,3) NOT NULL,
    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "greening_projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "site_notes" TEXT,
    "light_notes" TEXT,
    "budget_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "greening_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "greening_project_lines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "greening_project_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "driver_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "maps_url" TEXT,
    "quantity_note" TEXT,
    "instructions" TEXT,
    "window_note" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "driver_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "delivery_task_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "start_on" DATE NOT NULL,
    "end_on" DATE NOT NULL,
    "budget_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "spend_amount" DECIMAL(18,2),
    "attributed_revenue" DECIMAL(18,2),
    "notes" TEXT,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_bookings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "resource_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'booked',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "guest_count" INTEGER NOT NULL DEFAULT 0,
    "budget_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sponsor_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ticket_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_import_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mapping" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "purpose" TEXT NOT NULL,
    "reference" TEXT,
    "customer_id" TEXT,
    "invoice_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "posting_key" TEXT,
    CONSTRAINT "bank_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_portal_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disabled',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_portal_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suppliers_organization_id_name_idx" ON "suppliers"("organization_id", "name");
CREATE UNIQUE INDEX "purchase_orders_posting_key_key" ON "purchase_orders"("posting_key");
CREATE UNIQUE INDEX "purchase_orders_organization_id_number_key" ON "purchase_orders"("organization_id", "number");
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");
CREATE UNIQUE INDEX "goods_receipts_posting_key_key" ON "goods_receipts"("posting_key");
CREATE UNIQUE INDEX "goods_receipts_organization_id_number_key" ON "goods_receipts"("organization_id", "number");
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");
CREATE UNIQUE INDEX "landed_costs_posting_key_key" ON "landed_costs"("posting_key");
CREATE UNIQUE INDEX "landed_cost_allocations_posting_key_key" ON "landed_cost_allocations"("posting_key");
CREATE UNIQUE INDEX "growth_batches_posting_key_key" ON "growth_batches"("posting_key");
CREATE UNIQUE INDEX "growth_batches_organization_id_number_key" ON "growth_batches"("organization_id", "number");
CREATE INDEX "greenhouse_tasks_batch_id_idx" ON "greenhouse_tasks"("batch_id");
CREATE UNIQUE INDEX "inventory_counts_posting_key_key" ON "inventory_counts"("posting_key");
CREATE UNIQUE INDEX "inventory_counts_organization_id_number_key" ON "inventory_counts"("organization_id", "number");
CREATE INDEX "inventory_count_lines_count_id_idx" ON "inventory_count_lines"("count_id");
CREATE UNIQUE INDEX "greening_projects_posting_key_key" ON "greening_projects"("posting_key");
CREATE UNIQUE INDEX "greening_projects_organization_id_number_key" ON "greening_projects"("organization_id", "number");
CREATE INDEX "greening_project_lines_project_id_idx" ON "greening_project_lines"("project_id");
CREATE UNIQUE INDEX "delivery_tasks_posting_key_key" ON "delivery_tasks"("posting_key");
CREATE UNIQUE INDEX "delivery_tasks_organization_id_number_key" ON "delivery_tasks"("organization_id", "number");
CREATE UNIQUE INDEX "routes_posting_key_key" ON "routes"("posting_key");
CREATE UNIQUE INDEX "routes_organization_id_date_driver_id_key" ON "routes"("organization_id", "date", "driver_id");
CREATE UNIQUE INDEX "route_stops_route_id_delivery_task_id_key" ON "route_stops"("route_id", "delivery_task_id");
CREATE INDEX "route_stops_route_id_sort_idx" ON "route_stops"("route_id", "sort");
CREATE UNIQUE INDEX "campaigns_posting_key_key" ON "campaigns"("posting_key");
CREATE INDEX "campaigns_organization_id_start_on_idx" ON "campaigns"("organization_id", "start_on");
CREATE UNIQUE INDEX "event_bookings_posting_key_key" ON "event_bookings"("posting_key");
CREATE UNIQUE INDEX "event_bookings_organization_id_number_key" ON "event_bookings"("organization_id", "number");
CREATE UNIQUE INDEX "bank_import_batches_organization_id_file_hash_key" ON "bank_import_batches"("organization_id", "file_hash");
CREATE UNIQUE INDEX "bank_import_rows_posting_key_key" ON "bank_import_rows"("posting_key");
CREATE INDEX "bank_import_rows_batch_id_status_idx" ON "bank_import_rows"("batch_id", "status");
CREATE UNIQUE INDEX "customer_portal_accounts_organization_id_email_key" ON "customer_portal_accounts"("organization_id", "email");

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_event_booking_id_fkey" FOREIGN KEY ("event_booking_id") REFERENCES "event_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_event_booking_id_fkey" FOREIGN KEY ("event_booking_id") REFERENCES "event_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "landed_costs" ADD CONSTRAINT "landed_costs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "landed_costs" ADD CONSTRAINT "landed_costs_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "landed_cost_allocations" ADD CONSTRAINT "landed_cost_allocations_landed_cost_id_fkey" FOREIGN KEY ("landed_cost_id") REFERENCES "landed_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "landed_cost_allocations" ADD CONSTRAINT "landed_cost_allocations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_batches" ADD CONSTRAINT "growth_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_batches" ADD CONSTRAINT "growth_batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_batches" ADD CONSTRAINT "growth_batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "growth_batches" ADD CONSTRAINT "growth_batches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "greenhouse_tasks" ADD CONSTRAINT "greenhouse_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "greenhouse_tasks" ADD CONSTRAINT "greenhouse_tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "growth_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "inventory_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "greening_projects" ADD CONSTRAINT "greening_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "greening_projects" ADD CONSTRAINT "greening_projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "greening_project_lines" ADD CONSTRAINT "greening_project_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "greening_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_delivery_task_id_fkey" FOREIGN KEY ("delivery_task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_import_rows" ADD CONSTRAINT "bank_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "bank_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_import_rows" ADD CONSTRAINT "bank_import_rows_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accounts" ADD CONSTRAINT "customer_portal_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_portal_accounts" ADD CONSTRAINT "customer_portal_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code")
SELECT 'perm_purchase_write', 'purchase.write'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'purchase.write');
INSERT INTO "permissions" ("id", "code")
SELECT 'perm_delivery_read', 'delivery.read'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'delivery.read');
INSERT INTO "permissions" ("id", "code")
SELECT 'perm_delivery_write', 'delivery.write'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'delivery.write');
