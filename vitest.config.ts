import path from "node:path";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    // Isolated real-DB suites deliberately reset shared synthetic tables. Each
    // suite exercises its own concurrent connections/processes internally.
    fileParallelism: process.env.PHASE1_ISOLATED_DB !== "true",
    exclude: [...defaultExclude, "**/.claude/**"],
  },
});
