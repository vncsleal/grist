import { createConfig } from "../../tooling/vitest/base.js";

export default createConfig({
  test: {
    testTimeout: 15_000,
    coverage: {
      thresholds: { statements: 40, branches: 35, functions: 50, lines: 42 },
    },
  },
});
