import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["apps", "packages"];

function hasTestFile(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (hasTestFile(full)) return true;
    } else if (/\.test\.(ts|tsx)$/.test(entry)) {
      return true;
    }
  }
  return false;
}

const offenders = [];
for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const pkg of readdirSync(root)) {
    const pkgDir = join(root, pkg);
    const pkgJsonPath = join(pkgDir, "package.json");
    const srcDir = join(pkgDir, "src");
    if (!existsSync(pkgJsonPath)) continue;
    const dirToScan = existsSync(srcDir) ? srcDir : pkgDir;
    if (!hasTestFile(dirToScan)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (!pkgJson.scripts?.coverage) {
      offenders.push(pkgJson.name ?? pkgDir);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "These packages have *.test.* files but no `coverage` script:\n  " +
      offenders.join("\n  "),
  );
  process.exit(1);
}
console.log("Coverage-script check passed.");
