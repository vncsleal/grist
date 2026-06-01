import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 85,
        branches: 65,
        functions: 80,
        lines: 85,
      },
    },
  },
});
