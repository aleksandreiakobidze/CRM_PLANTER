-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "identification_code" TEXT,
    "address" TEXT,
    "director_name" TEXT,
    "bank_name" TEXT,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
    "tax_mode" TEXT NOT NULL DEFAULT 'unset',
    "tax_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "rental_buffer_hours" INTEGER NOT NULL DEFAULT 4,
    "excursion_window_start" TEXT NOT NULL DEFAULT '13:00',
    "excursion_window_end" TEXT NOT NULL DEFAULT '16:00',
    "maintenance_default_percent" DECIMAL(6,2) NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "identification_code" TEXT,
    "segment" TEXT NOT NULL DEFAULT 'other',
    "relationship_status" TEXT NOT NULL DEFAULT 'fresh',
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT,
    "city" TEXT,
    "district" TEXT,
    "phone" TEXT,
    "phone_normalized" TEXT,
    "email" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "next_contact_on" DATE,
    "owner_id" TEXT,
    "merged_into_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "phone_normalized" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'მთავარი',
    "line1" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "district" TEXT,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" TEXT,
    "body" TEXT NOT NULL,
    "actor_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_on" DATE,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "type" TEXT NOT NULL DEFAULT 'follow_up',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignee_id" TEXT,
    "customer_id" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "result" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query_string" TEXT NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_latin" TEXT,
    "aliases" TEXT[],

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "species_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "light" TEXT,
    "water" TEXT,
    "humidity" TEXT,
    "care_notes" TEXT,
    "video_url" TEXT,
    "frost_hardiness" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "height_cm" DECIMAL(10,2),
    "pot_volume_liters" DECIMAL(10,3),
    "sellable" BOOLEAN NOT NULL DEFAULT true,
    "rentable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "list_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "barcode" TEXT,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_entries" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "min_qty" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "valid_from" DATE,
    "valid_to" DATE,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "on_hand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "movement_type" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "status" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_until" DATE,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "quote_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "posting_key" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "fulfilled_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "returned_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "posting_key" TEXT NOT NULL,
    "actor_id" TEXT,
    "fulfilled_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_lines" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "fulfillment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "condition" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,

    CONSTRAINT "sales_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issued_on" DATE,
    "due_on" DATE,
    "posting_key" TEXT NOT NULL,
    "snapshot" JSONB,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "draft_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "reference" TEXT,
    "posting_key" TEXT NOT NULL,
    "refund_of_id" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "posting_key" TEXT NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "posting_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "actor_id" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "row_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "entity_id" TEXT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "unit_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "rental_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_bookings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "start_on" DATE NOT NULL,
    "end_on" DATE NOT NULL,
    "billing_days" INTEGER NOT NULL,
    "occupancy_start" TIMESTAMPTZ(6) NOT NULL,
    "occupancy_end" TIMESTAMPTZ(6) NOT NULL,
    "price_model" TEXT NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "posting_key" TEXT NOT NULL,

    CONSTRAINT "rental_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_booking_lines" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "rental_booking_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_reservations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occupancy_start" TIMESTAMPTZ(6) NOT NULL,
    "occupancy_end" TIMESTAMPTZ(6) NOT NULL,
    "posting_key" TEXT NOT NULL,

    CONSTRAINT "asset_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_contracts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "percent" DECIMAL(6,2) NOT NULL,
    "partial_month_policy" TEXT NOT NULL DEFAULT 'full',
    "start_on" DATE NOT NULL,
    "end_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "maintenance_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_plant_lines" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reference_unit_price" DECIMAL(18,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "replaces_line_id" TEXT,

    CONSTRAINT "contract_plant_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_amendments" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "effective_on" DATE NOT NULL,
    "percent" DECIMAL(6,2),
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_plants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "contract_line_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "ownership" TEXT NOT NULL,
    "reference_unit_price" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "place_note" TEXT,

    CONSTRAINT "customer_plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_plant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "coverage" TEXT NOT NULL,
    "posting_key" TEXT NOT NULL,

    CONSTRAINT "replacement_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_programs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price_per_child" DECIMAL(18,2) NOT NULL,
    "min_billable" INTEGER NOT NULL DEFAULT 1,
    "max_capacity" INTEGER NOT NULL,
    "window_start" TEXT NOT NULL DEFAULT '13:00',
    "window_end" TEXT NOT NULL DEFAULT '16:00',

    CONSTRAINT "excursion_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_program_materials" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty_per_child" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "excursion_program_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_bookings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "planned_children" INTEGER NOT NULL,
    "attended_children" INTEGER,
    "billable_children" INTEGER,
    "billable_basis" TEXT NOT NULL DEFAULT 'attended',
    "window_exception" BOOLEAN NOT NULL DEFAULT false,
    "posting_key" TEXT NOT NULL,

    CONSTRAINT "excursion_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_code" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_reservations" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_usages" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "reserved" DECIMAL(18,3) NOT NULL,
    "consumed" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "material_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "last_checked_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_organization_id_relationship_status_idx" ON "customers"("organization_id", "relationship_status");

-- CreateIndex
CREATE INDEX "customers_organization_id_phone_normalized_idx" ON "customers"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "customers_organization_id_identification_code_idx" ON "customers"("organization_id", "identification_code");

-- CreateIndex
CREATE INDEX "contacts_organization_id_phone_normalized_idx" ON "contacts"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "contacts_customer_id_idx" ON "contacts"("customer_id");

-- CreateIndex
CREATE INDEX "addresses_customer_id_idx" ON "addresses"("customer_id");

-- CreateIndex
CREATE INDEX "activities_organization_id_customer_id_occurred_at_idx" ON "activities"("organization_id", "customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_assignee_id_status_idx" ON "tasks"("organization_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "saved_views_organization_id_user_id_page_idx" ON "saved_views"("organization_id", "user_id", "page");

-- CreateIndex
CREATE UNIQUE INDEX "species_organization_id_name_ka_key" ON "species"("organization_id", "name_ka");

-- CreateIndex
CREATE INDEX "products_organization_id_category_idx" ON "products"("organization_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "product_variants"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_organization_id_code_key" ON "price_lists"("organization_id", "code");

-- CreateIndex
CREATE INDEX "price_list_entries_price_list_id_variant_id_idx" ON "price_list_entries"("price_list_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organization_id_code_key" ON "locations"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_organization_id_variant_id_location_id_key" ON "stock_balances"("organization_id", "variant_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_posting_key_key" ON "stock_movements"("posting_key");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_variant_id_occurred_at_idx" ON "stock_movements"("organization_id", "variant_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_posting_key_key" ON "reservations"("posting_key");

-- CreateIndex
CREATE INDEX "reservations_organization_id_status_idx" ON "reservations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "reservations_source_type_source_id_idx" ON "reservations"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_organization_id_number_key" ON "quotes"("organization_id", "number");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_quote_id_key" ON "sales_orders"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_posting_key_key" ON "sales_orders"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_organization_id_number_key" ON "sales_orders"("organization_id", "number");

-- CreateIndex
CREATE INDEX "sales_order_lines_order_id_idx" ON "sales_order_lines"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_posting_key_key" ON "fulfillments"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_organization_id_number_key" ON "fulfillments"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_posting_key_key" ON "sales_returns"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_posting_key_key" ON "invoices"("posting_key");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_issued_on_idx" ON "invoices"("organization_id", "status", "issued_on");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_posting_key_key" ON "payments"("posting_key");

-- CreateIndex
CREATE INDEX "payments_organization_id_paid_on_idx" ON "payments"("organization_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_posting_key_key" ON "payment_allocations"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_credits_posting_key_key" ON "customer_credits"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_transactions_posting_key_key" ON "deposit_transactions"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_posting_key_key" ON "expenses"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_organization_id_doc_type_year_key" ON "document_sequences"("organization_id", "doc_type", "year");

-- CreateIndex
CREATE INDEX "import_batches_organization_id_kind_file_hash_idx" ON "import_batches"("organization_id", "kind", "file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_key_key" ON "import_rows"("batch_id", "row_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "jobs_status_available_at_idx" ON "jobs"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_assets_organization_id_code_key" ON "rental_assets"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rental_bookings_posting_key_key" ON "rental_bookings"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "rental_bookings_organization_id_number_key" ON "rental_bookings"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "asset_reservations_posting_key_key" ON "asset_reservations"("posting_key");

-- CreateIndex
CREATE INDEX "asset_reservations_asset_id_status_idx" ON "asset_reservations"("asset_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_contracts_organization_id_number_key" ON "maintenance_contracts"("organization_id", "number");

-- CreateIndex
CREATE INDEX "contract_plant_lines_contract_id_active_idx" ON "contract_plant_lines"("contract_id", "active");

-- CreateIndex
CREATE INDEX "contract_amendments_contract_id_effective_on_idx" ON "contract_amendments"("contract_id", "effective_on");

-- CreateIndex
CREATE INDEX "customer_plants_organization_id_status_idx" ON "customer_plants"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_cases_posting_key_key" ON "replacement_cases"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_bookings_posting_key_key" ON "excursion_bookings"("posting_key");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_bookings_organization_id_number_key" ON "excursion_bookings"("organization_id", "number");

-- CreateIndex
CREATE INDEX "staff_assignments_user_id_starts_at_ends_at_idx" ON "staff_assignments"("user_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "resource_reservations_resource_id_status_idx" ON "resource_reservations"("resource_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organization_id_provider_key" ON "integration_connections"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "species" ADD CONSTRAINT "species_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_of_id_fkey" FOREIGN KEY ("refund_of_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "rental_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_assets" ADD CONSTRAINT "rental_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_assets" ADD CONSTRAINT "rental_assets_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_assets" ADD CONSTRAINT "rental_assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_booking_lines" ADD CONSTRAINT "rental_booking_lines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "rental_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_booking_lines" ADD CONSTRAINT "rental_booking_lines_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "rental_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "rental_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "rental_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_plant_lines" ADD CONSTRAINT "contract_plant_lines_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_plant_lines" ADD CONSTRAINT "contract_plant_lines_replaces_line_id_fkey" FOREIGN KEY ("replaces_line_id") REFERENCES "contract_plant_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_plants" ADD CONSTRAINT "customer_plants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_plants" ADD CONSTRAINT "customer_plants_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_cases" ADD CONSTRAINT "replacement_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_cases" ADD CONSTRAINT "replacement_cases_customer_plant_id_fkey" FOREIGN KEY ("customer_plant_id") REFERENCES "customer_plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_programs" ADD CONSTRAINT "excursion_programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_program_materials" ADD CONSTRAINT "excursion_program_materials_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "excursion_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "excursion_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "excursion_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "excursion_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_usages" ADD CONSTRAINT "material_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "excursion_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_non_negative" CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand);

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "asset_reservations" ADD COLUMN "occupancy" tstzrange GENERATED ALWAYS AS (tstzrange(occupancy_start, occupancy_end, '[)')) STORED;

ALTER TABLE "asset_reservations" ADD CONSTRAINT "asset_reservations_no_overlap" EXCLUDE USING gist (
  asset_id WITH =,
  occupancy WITH &&
) WHERE (status IN ('held', 'confirmed'));

CREATE UNIQUE INDEX "import_batches_confirmed_file" ON "import_batches" (organization_id, kind, file_hash) WHERE status = 'confirmed';

