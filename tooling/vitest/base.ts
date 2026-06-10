import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";

export function createConfig(overrides: UserConfig = {}): UserConfig {
  return mergeConfig(
    defineConfig({
      test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        coverage: {
          provider: "v8",
          include: ["src/**/*.ts"],
        },
      },
    }),
    overrides,
  );
}
