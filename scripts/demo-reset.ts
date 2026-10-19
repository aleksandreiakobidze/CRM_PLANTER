import "dotenv/config";
import { getDb } from "@/server/db";

if (process.env.NODE_ENV === "production") {
  console.error("production-ში demo reset დაბლოკილია");
  process.exit(1);
}

void (async () => {
  const db = getDb();
  const demos = await db.organization.findMany({ where: { isDemo: true }, select: { id: true } });
  if (demos.length === 0) {
    console.log("სატესტო ორგანიზაცია არ არის");
    process.exit(0);
  }
  console.log("სატესტო ორგანიზაციების წაშლა ამ სკრიპტში ჯერ არ არის სრული cascade. წაშალეთ მხოლოდ is_demo=true ბაზა სატესტო გარემოში.");
  process.exit(0);
})();
