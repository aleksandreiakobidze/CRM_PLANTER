import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const server = join(root, ".next/standalone/server.js");

if (existsSync(server)) {
  console.log("using prebuilt standalone");
} else {
  const nextBin = join(root, "node_modules/next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    stdio: "inherit",
    env: { ...process.env, PLANTER_HOSTINGER: "1", UV_THREADPOOL_SIZE: "2", NODE_ENV: "production" },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const prepared = spawnSync(process.execPath, [join(root, "scripts/prepare-standalone.mjs")], {
  stdio: "inherit",
});
if (prepared.status !== 0) {
  process.exit(prepared.status ?? 1);
}
