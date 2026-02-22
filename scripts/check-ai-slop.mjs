import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

const textExtensions = new Set([".md", ".mdx", ".txt"]);
const ignoredDirs = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

const suspiciousPhrases = [
  /\bdelve into\b/i,
  /\bgame[- ]changer\b/i,
  /\bin today'?s fast-paced\b/i,
  /\bleverage\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bunlock the power of\b/i,
  /\bcutting-edge\b/i,
  /\brobust\b/i,
  /\bin conclusion\b/i,
  /\bat the end of the day\b/i,
];

const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      if (entry.name !== ".github") {
        continue;
      }
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }

      await walk(fullPath);
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!textExtensions.has(extension)) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (line.includes("ai-slop-ignore-line")) {
        continue;
      }

      for (const pattern of suspiciousPhrases) {
        if (pattern.test(line)) {
          findings.push({
            file: path.relative(rootDir, fullPath),
            line: index + 1,
            value: line.trim(),
            pattern: pattern.source,
          });
          break;
        }
      }
    }
  }
}

await walk(rootDir);

if (findings.length > 0) {
  console.error("AI slop check failed. Remove or rewrite these lines:");

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}`);
    console.error(`  pattern: /${finding.pattern}/`);
    console.error(`  text: ${finding.value}`);
  }

  process.exit(1);
}

console.log("AI slop check passed.");
