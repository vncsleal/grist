import { createConfig } from "../../tooling/vitest/base.js";

export default createConfig({
  test: {
    coverage: {
      thresholds: { statements: 85, branches: 65, functions: 80, lines: 85 },
    },
  },
});
