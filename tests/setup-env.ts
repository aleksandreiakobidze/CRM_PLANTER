import { readFileSync } from "fs";

const env = JSON.parse(readFileSync("tests/.test-env.json", "utf8")) as { DATABASE_URL: string };
const mutableEnv = process.env as Record<string, string | undefined>;
mutableEnv.DATABASE_URL = env.DATABASE_URL;
mutableEnv.SESSION_SECRET = "test-secret";
mutableEnv.NODE_ENV = "test";
mutableEnv.SEED_DEMO = "false";
