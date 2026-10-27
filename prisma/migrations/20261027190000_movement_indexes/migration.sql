-- CreateIndex
CREATE INDEX "stock_movements_organization_id_occurred_at_idx" ON "stock_movements"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_source_type_source_id_idx" ON "stock_movements"("organization_id", "source_type", "source_id");
