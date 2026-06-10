import tseslint from "typescript-eslint";

/** Shared base for every package. Packages re-export or extend this. */
export const base = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/*.config.{js,mjs,ts}",
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // --- bug-class: errors ---
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // --- stylistic / lower-value: warnings on first rollout ---
      // `no-explicit-any` stays a warning: CLAUDE.md forbids `any`, and there
      // are few enough that the warnings are actionable.
      "@typescript-eslint/no-explicit-any": "warn",
      // `no-non-null-assertion` intentionally OFF: `!` is used deliberately
      // across the codebase under strict mode + noUncheckedIndexedAccess, so
      // warning on ~1.2k call sites is noise that buries actionable warnings.
      // Reducing `!` usage, if desired, is a separate dedicated effort.
    },
  },
);
