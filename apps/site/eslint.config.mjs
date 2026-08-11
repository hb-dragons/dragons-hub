import { base } from "../../eslint.config.base.mjs";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  {
    ignores: ["**/.astro/**", "**/dist/**", "**/*.astro"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
