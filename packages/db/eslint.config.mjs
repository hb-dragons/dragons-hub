import tseslint from "typescript-eslint";
import { base } from "../../eslint.config.base.mjs";

export default [
  ...base,
  // Plain node scripts (the db:push guard) live outside the TS project, so
  // type-aware rules cannot run on them.
  { files: ["scripts/**/*.mjs"], ...tseslint.configs.disableTypeChecked },
];
