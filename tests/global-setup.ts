import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.resolve("data/pg-test");
const port = 55432;
const databaseUrl = `postgresql://planter:planter@127.0.0.1:${port}/planter_test`;

export default async function setup() {
  if (process.env.USE_EXISTING_TEST_DB === "1" && process.env.DATABASE_URL) {
    writeFileSync("tests/.test-env.json", JSON.stringify({ DATABASE_URL: process.env.DATABASE_URL }));
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env,
    });
    return async () => {};
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "planter",
    password: "planter",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  let started = false;
  try {
    await pg.initialise();
    await pg.start();
    started = true;
    await pg.createDatabase("planter_test");
    writeFileSync("tests/.test-env.json", JSON.stringify({ DATABASE_URL: databaseUrl }));
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  } catch (error) {
    if (started) await pg.stop().catch(() => undefined);
    throw error;
  }
  return async () => {
    await pg.stop();
  };
}
