import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests spawn child processes — needs more time
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/mcp/server.ts"],
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 50,
        lines: 55,
      },
    },
  },
});
