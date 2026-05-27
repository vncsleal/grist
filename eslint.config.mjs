import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.heroui-docs/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: sharedGlobals,
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["apps/app/**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["apps/*/astro.config.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
      globals: sharedGlobals,
    },
  },
  // ── Architecture boundary: core packages must not import framework packages ──
  {
    files: ["packages/*/src/**/*.{js,ts,jsx,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@modelcontextprotocol/sdk",
              message: "Core packages must not import MCP SDK types. Map at the boundary in apps/mcp-server.",
            },
            {
              name: "@modelcontextprotocol/sdk/server/index.js",
              message: "Core packages must not import MCP SDK types. Map at the boundary in apps/mcp-server.",
            },
          ],
          patterns: [
            {
              group: ["@heroui/*"],
              message: "Core packages must not import HeroUI components. React UI belongs in apps/app.",
            },
          ],
        },
      ],
    },
  },
);
