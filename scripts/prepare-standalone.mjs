import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next/standalone");
if (!existsSync(standalone)) {
  throw new Error("Hostinger build: .next/standalone missing");
}

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

const staticDir = join(root, ".next/static");
if (existsSync(staticDir)) {
  cpSync(staticDir, join(standalone, ".next/static"), { recursive: true });
}

console.log("standalone output ready");
