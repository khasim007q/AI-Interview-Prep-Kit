import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "apps/**/*.test.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", ".next"]
    }
  },
  resolve: {
    alias: {
      "@ai-interview-prep/shared": path.resolve(__dirname, "packages/shared/src")
    }
  }
});
