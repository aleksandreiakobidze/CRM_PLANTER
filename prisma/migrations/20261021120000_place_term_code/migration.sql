ALTER TABLE "place_terms" ADD COLUMN IF NOT EXISTS "code" TEXT;
UPDATE "place_terms"
SET "code" = 'p-' || replace("id", '-', '')
WHERE "code" IS NULL OR btrim("code") = '';
ALTER TABLE "place_terms" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "place_terms_organization_id_code_key" ON "place_terms"("organization_id", "code");
