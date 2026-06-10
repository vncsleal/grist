import { createConfig } from "../../tooling/vitest/base.js";

export default createConfig({
  test: {
    testTimeout: 30_000,
    coverage: {
      exclude: ["src/mcp/server.ts"],
      thresholds: { statements: 55, branches: 50, functions: 50, lines: 55 },
    },
  },
});
