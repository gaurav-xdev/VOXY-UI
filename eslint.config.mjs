import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";

export default tseslint.config(
  { ignores: ["dist", "dist-server", "node_modules", ".data", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The browser must never decide security-relevant state or hold tokens.
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "Never store auth/session data in web storage." },
        { name: "sessionStorage", message: "Never store auth/session data in web storage." },
      ],
      "no-restricted-properties": ["error", { object: "window", property: "localStorage", message: "Never store auth/session data in web storage." }],
      "no-restricted-syntax": ["error", { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "dangerouslySetInnerHTML is forbidden (XSS)." }],
    },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.{ts,mjs}", "shared/**/*.ts"],
    languageOptions: { globals: globals.node },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off", // too noisy for typed lookups; covered by tests (prototype pollution)
      "no-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "vitest.config.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
