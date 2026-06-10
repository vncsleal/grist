import { createConfig } from "../../tooling/vitest/base.js";

export default createConfig({
  test: {
    coverage: {
      exclude: ["src/index.ts"],
      thresholds: { statements: 80, branches: 65, functions: 70, lines: 80 },
    },
  },
});
