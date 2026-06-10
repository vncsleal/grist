import { createConfig } from "../../tooling/vitest/base.js";

export default createConfig({
  test: {
    coverage: {
      thresholds: { statements: 85, branches: 45, functions: 45, lines: 85 },
    },
  },
});
