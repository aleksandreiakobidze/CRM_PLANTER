import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: "./tests/global-setup.ts",
    setupFiles: ["./tests/setup-env.ts"],
    hookTimeout: 180000,
    testTimeout: 60000,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
