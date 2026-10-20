import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const server = join(root, ".next/standalone/server.js");

if (existsSync(server)) {
  console.log("using prebuilt standalone");
} else {
  const result = spawnSync("npx", ["next", "build", "--webpack"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, UV_THREADPOOL_SIZE: "2" },
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
