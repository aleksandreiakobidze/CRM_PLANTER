ALTER TABLE "excursion_bookings" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "excursion_bookings" ADD COLUMN "price" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "excursion_bookings" ALTER COLUMN "program_id" DROP NOT NULL;
