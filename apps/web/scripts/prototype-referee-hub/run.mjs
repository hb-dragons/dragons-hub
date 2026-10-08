// PROTOTYPE — starts the stub API and the web dev server pointed at it.
// `pnpm prototype:referee-hub`, then open the URL it prints. The layouts live
// in src/components/admin/referee-hub/open-slots/prototype/.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../..");
const STUB_PORT = "3091";
const apiUrl = `http://localhost:${STUB_PORT}`;

const children = [
  spawn(process.execPath, [path.join(here, "stub-api.mjs")], {
    stdio: "inherit",
    env: { ...process.env, STUB_PORT },
  }),
  spawn("pnpm", ["exec", "next", "dev", "--turbopack", "-p", "3000"], {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_API_URL: apiUrl, API_URL: apiUrl },
  }),
];

console.log(`
[prototype] Referee hub layout prototype
  1. Open http://localhost:3000/auth/sign-in and sign in with any email and a 12+ character password
  2. Then http://localhost:3000/admin/referees?variant=A   (A, B, C, or current)
  Flip variants with the bar at the bottom or the ← → keys. Data is in-memory; restart to reset.
`);

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", stop);
