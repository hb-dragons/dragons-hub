/**
 * Fails the build when a source file uses a Tailwind colour utility whose token
 * does not exist.
 *
 * Tailwind emits no rule for an undefined token and reports no error, so
 * `text-mint-shade` type-checks, lints, renders and tests green while showing
 * the user nothing at all. This check compiles every colour-utility candidate
 * found in source against the real design system (`packages/ui/src/styles/globals.css`)
 * and fails on any candidate Tailwind cannot resolve.
 */
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

/**
 * Stylesheet that defines the design system's `@theme` tokens. The site theme
 * (site.css) is not loaded separately: site-css-parity.test.ts pins its token
 * vocabulary to globals.css name-for-name, so resolving every surface against
 * globals.css is exact.
 */
const themeEntry = path.join(rootDir, "packages/ui/src/styles/globals.css");

/** Trees whose class names must resolve against the design system. */
const scannedDirs = [
  path.join(rootDir, "apps/site/src"),
  path.join(rootDir, "apps/web/src"),
  path.join(rootDir, "packages/ui/src"),
];

// `.astro` templates carry class attributes exactly like `.tsx` does, and the
// colour-utility-root restriction below keeps frontmatter/`<style>` noise out
// of the candidate set, so they scan with the same rules.
const sourceExtensions = new Set([".astro", ".ts", ".tsx"]);
const ignoredDirs = new Set([".next", ".turbo", "coverage", "dist", "node_modules"]);

/**
 * Utility roots that take a colour from the theme. Restricting the scan to
 * these keeps non-class strings (import specifiers, test ids, i18n keys) out of
 * the candidate set — they are the only realistic source of false positives.
 */
const colourUtilityRoots = [
  "accent",
  "bg",
  "border",
  "caret",
  "decoration",
  "divide",
  "fill",
  "from",
  "outline",
  "placeholder",
  "ring",
  "shadow",
  "stroke",
  "text",
  "to",
  "via",
];

// Optional leading variants (`hover:`, `md:`, `dark:`…), the utility root, and
// an optional single sub-segment (`border-l-`, `divide-x-`, `ring-offset-`).
const colourUtilityPattern = new RegExp(
  `^(?:[\\w-]+:)*-?(?:${colourUtilityRoots.join("|")})(?:-[a-z]+)?-`,
);

// A conservative shape for "this could be a Tailwind class": lowercase start,
// a value after the final hyphen, and no characters that only appear in prose,
// paths or template interpolation.
const candidateShape = /^-?[a-z][a-z0-9:./[\]()_,%#-]*[a-z0-9\])%]$/i;

/**
 * Tailwind's design-system loader is only exposed from the ESM build, and
 * `tailwindcss` is a dependency of `@dragons/ui`, not of the workspace root.
 */
async function loadDesignSystem() {
  const uiRequire = createRequire(path.join(rootDir, "packages/ui/package.json"));
  const tailwindDir = path.dirname(uiRequire.resolve("tailwindcss/package.json"));
  const { __unstable__loadDesignSystem: loadTailwindDesignSystem } = await import(
    pathToFileURL(path.join(tailwindDir, "dist/lib.mjs")).href
  );

  const uiDir = path.join(rootDir, "packages/ui");
  const stylesheets = {
    tailwindcss: path.join(tailwindDir, "index.css"),
    "tw-animate-css": path.join(uiDir, "node_modules/tw-animate-css/dist/tw-animate.css"),
  };

  return loadTailwindDesignSystem(await readFile(themeEntry, "utf8"), {
    base: path.dirname(themeEntry),
    async loadStylesheet(id) {
      const resolved = stylesheets[id];
      if (!resolved) {
        // An unknown @import contributes no tokens; ignore it rather than fail.
        return { path: id, base: uiDir, content: "" };
      }
      return {
        path: resolved,
        base: path.dirname(resolved),
        content: await readFile(resolved, "utf8"),
      };
    },
    async loadModule() {
      return { base: uiDir, module: {} };
    },
  });
}

async function collectSourceFiles(dir, into) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectSourceFiles(fullPath, into);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      into.push(fullPath);
    }
  }

  return into;
}

/** Maps every colour-utility candidate to the `file:line` sites that use it. */
async function collectCandidates(files) {
  const candidates = new Map();

  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);

    lines.forEach((line, index) => {
      // Split on quotes and braces as well as whitespace: class names are just
      // as often inside a template literal (`a b ${cond ? "c" : ""}`) as inside
      // a plain string, and pairing up quotes would skip the interpolated arms.
      for (const token of line.split(/[\s"'`{}]+/)) {
        if (!token || !candidateShape.test(token) || !colourUtilityPattern.test(token)) {
          continue;
        }

        const site = `${path.relative(rootDir, file)}:${index + 1}`;
        const sites = candidates.get(token);
        if (sites) {
          sites.add(site);
        } else {
          candidates.set(token, new Set([site]));
        }
      }
    });
  }

  return candidates;
}

const designSystem = await loadDesignSystem();
const files = [];
for (const dir of scannedDirs) {
  await collectSourceFiles(dir, files);
}

const candidates = await collectCandidates(files);
const names = [...candidates.keys()];
const compiled = designSystem.candidatesToCss(names);
const undefinedTokens = names.filter((_, index) => compiled[index] === null);

if (undefinedTokens.length > 0) {
  console.error(
    "Design token check failed. These classes reference tokens that do not exist,",
  );
  console.error(
    `so Tailwind emits no rule and they render as nothing. Define them in ${path.relative(rootDir, themeEntry)} or use an existing token:`,
  );

  for (const token of undefinedTokens) {
    console.error(`- ${token}`);
    for (const site of candidates.get(token)) {
      console.error(`  at ${site}`);
    }
  }

  process.exit(1);
}

console.log(
  `Design token check passed (${names.length} colour utilities resolved across ${files.length} files).`,
);
