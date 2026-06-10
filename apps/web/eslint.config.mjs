import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import { base } from "../../eslint.config.base.mjs";

export default defineConfig([
  ...base,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test files are excluded from tsconfig (vitest env); skip typed linting for them.
    "src/**/*.test.{ts,tsx}",
    "vitest.config.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Ban raw `fetch` in web source: every data call must go through the shared
  // typed client. `src/lib/**` is exempt (it wraps fetch to build the client and
  // SWR fetcher); test files are exempt. The only sanctioned call-site exceptions
  // are non-JSON (blob/multipart) requests, which must carry an inline
  // eslint-disable with a reason.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use the typed client: `api`/`getServerApi()` from @/lib/api(.server), or `apiFetcher` for SWR. Raw fetch is only for non-JSON (blob/multipart) and must carry an eslint-disable with a reason.",
        },
      ],
    },
  },
]);
