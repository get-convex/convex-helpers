import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import convexPlugin from "@convex-dev/eslint-plugin";

export default [
  { files: ["src/**/*.{js,mjs,cjs,ts,tsx}", "convex/**/*.{ts,tsx}"] },
  {
    ignores: [
      "dist/**",
      "packages/convex-helpers/dist/**",
      "packages/convex-helpers/generate-exports.mjs",
      "src/fakeConvexClient/fakeConvexClient.js",
      "backendHarness.js",
      "eslint.config.mjs",
      "convex/vitest.config.mts",
      "setup.cjs",
      "**/_generated/",
      "vite.config.mts",
      "vitest.workspace.ts",
    ],
  },
  {
    files: ["convex/**/*.ts", "packages/convex-helpers/server/**/*.ts"],
    ignores: ["packages/convex-helpers/server/_generated/**/*"],
    plugins: {
      "@convex-dev": convexPlugin,
    },
    rules: convexPlugin.configs.recommended[0].rules,
  },
  {
    languageOptions: {
      globals: globals.worker,
      parser: tseslint.parser,

      parserOptions: {
        project: ["./tsconfig.json", "./packages/convex-helpers/tsconfig.json"],
        tsconfigRootDir: ".",
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "src/react/**/*.{jsx,tsx}",
      "src/react/**/*.js",
      "src/react/**/*.ts",
    ],
    plugins: { react: reactPlugin, "react-hooks": reactHooks },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs["recommended"].rules,
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "eslint-comments/no-unused-disable": "off",
      "@typescript-eslint/no-explicit-any": "off",

      // allow (_arg: number) => {} and const _foo = 1;
      "no-unused-vars": "off",
      "no-unused-private-class-members": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
