import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readExpoConfig } from "@/test/expo-config";
import { GET } from "./route";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const MAIN_TF = path.join(REPO_ROOT, "infra/environments/production/main.tf");
const VARIABLES_TF = path.join(REPO_ROOT, "infra/environments/production/variables.tf");
const OPENTOFU_WORKFLOW = path.join(REPO_ROOT, ".github/workflows/opentofu.yml");

const { android } = readExpoConfig();

/** A syntactically valid Play app-signing fingerprint (not the real one). */
const VALID_FINGERPRINT = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, "0").toUpperCase(),
).join(":");

/** Every shape the route must refuse, reused as the drift fixture for Terraform. */
const REJECTED_FINGERPRINTS: [label: string, value: string][] = [
  ["empty", ""],
  ["a placeholder", "REPLACE_ME"],
  ["colon-less hex", VALID_FINGERPRINT.replaceAll(":", "")],
  ["one byte short", VALID_FINGERPRINT.split(":").slice(0, 31).join(":")],
  ["one byte long", `${VALID_FINGERPRINT}:FF`],
  ["a non-hex digit", `ZZ${VALID_FINGERPRINT.slice(2)}`],
  ["a SHA-1 fingerprint", VALID_FINGERPRINT.split(":").slice(0, 20).join(":")],
];

interface Statement {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
}

const readStatements = async (response: Response): Promise<Statement[]> =>
  (await response.json()) as Statement[];

let savedFingerprint: string | undefined;

beforeEach(() => {
  savedFingerprint = process.env.ANDROID_APP_SIGNING_SHA256;
});

afterEach(() => {
  if (savedFingerprint === undefined) delete process.env.ANDROID_APP_SIGNING_SHA256;
  else process.env.ANDROID_APP_SIGNING_SHA256 = savedFingerprint;
});

/**
 * Android app links (#249): `autoVerify: true` on the intent filter makes the
 * OS fetch this file, and a wrong or missing fingerprint fails verification
 * silently — links then open the browser instead of the app. The fingerprint
 * is Play's *app signing* key, which only exists after the first upload
 * (#247), so it arrives as an env var rather than a committed constant: a
 * config change publishes it without a code deploy, and until then the route
 * serves nothing rather than a statement that is wrong.
 */
describe("GET /.well-known/assetlinks.json", () => {
  it("is only needed because the native app declares autoVerify for the web host", () => {
    const filter = android.intentFilters.find((f) =>
      f.data.some((d) => d.host === "app.hbdragons.de"),
    );
    expect(filter?.autoVerify).toBe(true);
  });

  it("serves the statement list as JSON when the fingerprint is configured", async () => {
    process.env.ANDROID_APP_SIGNING_SHA256 = VALID_FINGERPRINT;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await readStatements(response)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: android.package,
          sha256_cert_fingerprints: [VALID_FINGERPRINT],
        },
      },
    ]);
  });

  it("names the package the native binary is built with", async () => {
    process.env.ANDROID_APP_SIGNING_SHA256 = VALID_FINGERPRINT;

    const [statement] = await readStatements(await GET());

    // Read from app.json rather than typed twice: an Android package rename
    // would otherwise leave this file pointing at an app that no longer exists.
    expect(statement?.target.package_name).toBe(android.package);
    expect(android.package).toBe("de.hbdragons.app");
  });

  it("upper-cases a lower-case fingerprint", async () => {
    process.env.ANDROID_APP_SIGNING_SHA256 = VALID_FINGERPRINT.toLowerCase();

    const [statement] = await readStatements(await GET());

    expect(statement?.target.sha256_cert_fingerprints).toEqual([VALID_FINGERPRINT]);
  });

  it("tolerates surrounding whitespace from a copy-paste out of Play Console", async () => {
    process.env.ANDROID_APP_SIGNING_SHA256 = `  ${VALID_FINGERPRINT}\n`;

    const [statement] = await readStatements(await GET());

    expect(statement?.target.sha256_cert_fingerprints).toEqual([VALID_FINGERPRINT]);
  });

  it("serves nothing until the fingerprint is configured", async () => {
    delete process.env.ANDROID_APP_SIGNING_SHA256;

    expect((await GET()).status).toBe(404);
  });

  it.each(REJECTED_FINGERPRINTS)(
    "serves nothing when the fingerprint is %s",
    async (_label, value) => {
      process.env.ANDROID_APP_SIGNING_SHA256 = value;

      expect((await GET()).status).toBe(404);
    },
  );
});

/**
 * The route is inert unless the deployment actually passes the variable, and a
 * dropped line reverts it to a silent 404 with CI green — the same failure
 * mode the file exists to prevent. `apps/web/src/aasa.test.ts` guards its own
 * wiring (the `next.config.ts` header rule) for the same reason.
 */
describe("assetlinks deployment wiring", () => {
  it("passes the fingerprint from the GitHub repository variable into Terraform", () => {
    const workflow = fs.readFileSync(OPENTOFU_WORKFLOW, "utf8");
    expect(workflow).toMatch(
      /TF_VAR_android_app_signing_sha256:\s*\$\{\{\s*vars\.ANDROID_APP_SIGNING_SHA256\s*\}\}/,
    );
  });

  it("threads it into the web service's env_vars", () => {
    const mainTf = fs.readFileSync(MAIN_TF, "utf8");
    const webModule = /module "web" \{[\s\S]*?\n\}/.exec(mainTf)?.[0];
    expect(webModule).toBeDefined();
    expect(webModule).toMatch(/ANDROID_APP_SIGNING_SHA256\s*=\s*var\.android_app_signing_sha256/);
    // Omitted rather than passed as "": an empty value would make the route
    // serve a statement list with an empty fingerprint array.
    expect(webModule).toMatch(/var\.android_app_signing_sha256 == "" \? \{\} :/);
  });

  it("validates the fingerprint in Terraform the same way the route does", () => {
    const source = fs.readFileSync(VARIABLES_TF, "utf8");
    const pattern = /can\(regex\("(\^\[0-9A-Fa-f\][^"]*)",\s*var\.android_app_signing_sha256\)\)/
      .exec(source)?.[1];
    expect(pattern).toBeDefined();

    // Same fixtures as the route, so the two validators cannot drift into
    // disagreeing about what a fingerprint is — a value TF accepts and the
    // route rejects would deploy green and still serve a 404.
    const terraform = new RegExp(pattern!);
    expect(terraform.test(VALID_FINGERPRINT)).toBe(true);
    expect(terraform.test(VALID_FINGERPRINT.toLowerCase())).toBe(true);
    for (const [, value] of REJECTED_FINGERPRINTS) {
      // TF treats "" as "unset" before the regex ever runs, so it is the one
      // rejected fixture the pattern itself is not asked to catch.
      if (value === "") continue;
      expect(terraform.test(value), `Terraform accepts ${value}`).toBe(false);
    }
  });
});
