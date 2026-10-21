import "dotenv/config";
import { readFileSync } from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!url.startsWith("postgres")) {
  console.log("skip local postgres apply");
  process.exit(0);
}

const sql = readFileSync("prisma/migrations/20261021120000_place_term_code/migration.sql", "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("place_terms.code applied");
} finally {
  await client.end();
}
