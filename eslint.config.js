import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "docs/", "eval/results.csv"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-shadow": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-implicit-globals": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
      // Pages are rendered with textContent only; page-derived text must never reach HTML.
      "no-restricted-properties": ["error",
        { property: "innerHTML", message: "Use textContent or DOM methods." },
        { property: "insertAdjacentHTML", message: "Use DOM methods." }]
    }
  },
  {
    // Content scripts are classic scripts (no import/export).
    files: ["extension/content/**/*.js", "extension/shared/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions }
    }
  },
  {
    files: ["extension/background/**/*.js"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.webextensions } }
  },
  {
    files: ["extension/popup/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } }
  },
  {
    // Node, plus browser and extension globals inside page.evaluate() callbacks.
    files: ["test/**/*.js", "eval/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.webextensions } }
  }
];
