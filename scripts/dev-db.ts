import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.resolve("data/pg");
const port = Number(process.env.PG_PORT ?? 5432);
const databaseUrl = `postgresql://planter:planter@127.0.0.1:${port}/planter`;

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "planter",
  password: "planter",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  mkdirSync(dir, { recursive: true });
  await pg.initialise().catch(() => undefined);
  await pg.start();
  await pg.createDatabase("planter").catch(() => undefined);
  writeFileSync(".env", `DATABASE_URL=${databaseUrl}\nSESSION_SECRET=dev-only-change-me\nSEED_DEMO=false\nNODE_ENV=development\n`);
  console.log(`PostgreSQL მუშაობს: ${databaseUrl}`);
  console.log("გაჩერებისთვის დახურეთ ეს პროცესი.");
  await new Promise(() => undefined);
}

void main();
