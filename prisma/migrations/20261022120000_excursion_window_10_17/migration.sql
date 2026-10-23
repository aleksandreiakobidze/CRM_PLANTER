ALTER TABLE "organizations" ALTER COLUMN "excursion_window_start" SET DEFAULT '10:00';
ALTER TABLE "organizations" ALTER COLUMN "excursion_window_end" SET DEFAULT '17:00';
UPDATE "organizations"
SET "excursion_window_start" = '10:00', "excursion_window_end" = '17:00';
ALTER TABLE "excursion_programs" ALTER COLUMN "window_start" SET DEFAULT '10:00';
ALTER TABLE "excursion_programs" ALTER COLUMN "window_end" SET DEFAULT '17:00';
UPDATE "excursion_programs"
SET "window_start" = '10:00', "window_end" = '17:00';
