import js from "@eslint/js";
import astro from "eslint-plugin-astro";
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
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["packages/*/src/**/*.{js,ts,jsx,tsx}"],
    rules: {
      "no-console": "error",
    },
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
  // ── Architecture boundary: core domain packages must not import framework packages ──
  // packages/{auth,billing,database,storage-db,storage-fs} are adapter/implementation
  // packages and legitimately use their framework (better-auth, drizzle-orm, etc).
  {
    files: ["packages/{core,config,content,providers,workspace}/src/**/*.{js,ts,jsx,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@modelcontextprotocol/sdk", message: "Core packages must not import MCP SDK types. Map at the boundary in apps/mcp-server." },
            { name: "@modelcontextprotocol/sdk/server/index.js", message: "Core packages must not import MCP SDK types. Map at the boundary in apps/mcp-server." },
            { name: "hono", message: "Core packages must not import Hono. HTTP framework types belong in apps/api." },
            { name: "better-auth", message: "Core packages must not import Better Auth. Auth is a shell concern." },
            { name: "drizzle-orm", message: "Core packages must not import Drizzle ORM. Database types belong in packages/database." },
            { name: "astro", message: "Core packages must not import Astro. Site framework types belong in apps/site." },
          ],
          patterns: [
            { group: ["@astrojs/*"], message: "Core packages must not import Astro plugin types." },
            { group: ["@tailwindcss/*"], message: "Core packages must not import Tailwind types." },
            { group: ["@heroui/*"], message: "Core packages must not import HeroUI components." },
            { group: ["react", "react-dom"], message: "Core packages must not import React types." },
          ],
        },
      ],
    },
  },
);
