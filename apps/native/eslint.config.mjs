import { base } from "../../eslint.config.base.mjs";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Metro bundler requires require() calls for static asset references (fonts, images).
      // This is the idiomatic pattern in React Native and has no ESM equivalent in Metro.
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];
