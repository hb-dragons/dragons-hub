import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { SdkFetcher } from "./sdk-fetcher";
import { endpoints, type DiscoveredIds } from "./endpoint-registry";
import { extractShape, mergeShapes, diffShapes, type ShapeNode } from "./shape-diff";
import { printReport } from "./report";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(__dirname, "../samples");
const SDK_ROOT = resolve(__dirname, "../..");

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../../../.env") });

interface CliArgs {
  updateSamples: boolean;
  endpointFilter: string | null;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { updateSamples: false, endpointFilter: null, verbose: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--update-samples":
        result.updateSamples = true;
        break;
      case "--endpoint":
        result.endpointFilter = args[++i] ?? null;
        break;
      case "--verbose":
        result.verbose = true;
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        console.error("Usage: check-types [--update-samples] [--endpoint <name>] [--verbose]");
        process.exit(2);
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  const username = process.env.SDK_USERNAME;
  const password = process.env.SDK_PASSWORD;

  const fetcher = new SdkFetcher(username, password);

  if (!fetcher.hasCredentials) {
    console.warn(
      "Warning: SDK_USERNAME/SDK_PASSWORD not set. Authenticated endpoints will be skipped.",
    );
  }

  // Filter endpoints
  let activeEndpoints = endpoints;
  if (args.endpointFilter) {
    activeEndpoints = endpoints.filter((e) => e.name === args.endpointFilter);
    if (activeEndpoints.length === 0) {
      console.error(`Unknown endpoint: ${args.endpointFilter}`);
      console.error(`Available: ${endpoints.map((e) => e.name).join(", ")}`);
      process.exit(2);
    }
  }

  // Discover test IDs
  console.log("Discovering test IDs...");
  let ids: DiscoveredIds;
  try {
    ids = await fetcher.discoverTestIds();
    console.log(`  competitionId: ${ids.competitionId}, matchId: ${ids.matchId ?? "none"}`);
  } catch (err) {
    console.error("Failed to discover test IDs:", err);
    process.exit(1);
  }

  // Process each endpoint
  const results: Array<{
    name: string;
    diffs: Awaited<ReturnType<typeof diffShapes>>;
    error?: string;
    skipped?: boolean;
    baselineShape?: ReturnType<typeof extractShape>;
    liveShape?: ReturnType<typeof extractShape>;
  }> = [];

  for (const ep of activeEndpoints) {
    console.log(`\nChecking ${ep.name}...`);

    // Skip authenticated endpoints if no credentials
    if (ep.requiresAuth && !fetcher.hasCredentials) {
      results.push({
        name: ep.name,
        diffs: [],
        skipped: true,
        error: "No credentials — skipping authenticated endpoint",
      });
      continue;
    }

    // Skip getGameDetails if no matchId discovered
    if (ep.requiresAuth && ids.matchId === null) {
      results.push({
        name: ep.name,
        diffs: [],
        skipped: true,
        error: "No matchId discovered from spielplan",
      });
      continue;
    }

    try {
      // Fetch live data
      console.log(`  Fetching live data...`);
      const liveData = await ep.fetch(fetcher, ids);

      // Load sample
      const samplePath = resolve(SAMPLES_DIR, ep.sampleFile);
      let sampleData: unknown;
      try {
        sampleData = JSON.parse(readFileSync(samplePath, "utf-8"));
      } catch {
        console.warn(`  Warning: Could not read sample file ${ep.sampleFile}`);
        sampleData = null;
      }

      // Load accumulated shape, or derive from sample JSON
      const shapePath = resolve(SAMPLES_DIR, ep.sampleFile.replace(/\.json$/, ".shape.json"));
      let baselineShape: ShapeNode | null = null;
      try {
        if (existsSync(shapePath)) {
          baselineShape = JSON.parse(readFileSync(shapePath, "utf-8")) as ShapeNode;
        } else if (sampleData !== null) {
          baselineShape = extractShape(sampleData);
        }
      } catch {
        if (sampleData !== null) {
          baselineShape = extractShape(sampleData);
        }
      }

      // Extract live shape and merge with baseline to accumulate knowledge
      const liveShape = extractShape(liveData);
      const mergedShape = baselineShape ? mergeShapes(baselineShape, liveShape) : liveShape;

      // Diff baseline against merged: shows what new info this run discovered
      const diffs = baselineShape ? diffShapes(baselineShape, mergedShape) : [];

      results.push({
        name: ep.name,
        diffs,
        baselineShape: baselineShape ?? undefined,
        liveShape,
        error: baselineShape === null ? "No sample file to compare against" : undefined,
      });

      // Update samples if requested
      if (args.updateSamples) {
        const sorted = JSON.stringify(liveData, sortKeys, 2);
        writeFileSync(samplePath, sorted + "\n");
        writeFileSync(shapePath, JSON.stringify(mergedShape, null, 2) + "\n");
        console.log(`  Updated ${ep.sampleFile} + shape`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: ep.name, diffs: [], error: message });
    }
  }

  fetcher.logout();

  const hasDrift = printReport(results, args.verbose);
  process.exit(hasDrift ? 1 : 0);
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
