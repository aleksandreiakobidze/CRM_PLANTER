ALTER TABLE "tasks" ADD COLUMN "description" TEXT;
ALTER TABLE "tasks" ADD COLUMN "created_by_id" TEXT;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tasks_organization_id_created_by_id_idx" ON "tasks"("organization_id", "created_by_id");

CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_assignments_task_id_user_id_key" ON "task_assignments"("task_id", "user_id");
CREATE INDEX "task_assignments_user_id_status_idx" ON "task_assignments"("user_id", "status");

ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "task_assignments" ("id", "task_id", "user_id", "status", "completed_at")
SELECT gen_random_uuid()::text, "id", "assignee_id",
       CASE WHEN "status" = 'done' THEN 'done' ELSE 'open' END,
       CASE WHEN "status" = 'done' THEN "created_at" ELSE NULL END
FROM "tasks"
WHERE "assignee_id" IS NOT NULL;

CREATE TABLE "task_attachments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_attachments_storage_key_key" ON "task_attachments"("storage_key");
CREATE INDEX "task_attachments_organization_id_task_id_idx" ON "task_attachments"("organization_id", "task_id");

ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
