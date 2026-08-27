import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_APP_JSON = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../native/app.json",
);

/**
 * The parts of `apps/native/app.json` the web app-links files have to agree
 * with. Both `/.well-known` documents name identifiers that are compiled into
 * the native binary — Apple's `TeamID.bundleId`, Android's package — and a
 * rename on the native side has to fail the web tests rather than leave the
 * two claiming an app that no longer exists.
 */
export interface ExpoConfig {
  ios: { appleTeamId: string; bundleIdentifier: string };
  android: {
    package: string;
    intentFilters: { autoVerify?: boolean; data: { scheme: string; host: string }[] }[];
  };
}

export function readExpoConfig(): ExpoConfig {
  const { expo } = JSON.parse(fs.readFileSync(NATIVE_APP_JSON, "utf8")) as { expo: ExpoConfig };
  return expo;
}
