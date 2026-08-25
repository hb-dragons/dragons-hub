import * as Application from "expo-application";
import type { AppVersionInfo } from "./links";

/**
 * What the installed binary reports about itself. Kept apart from `links.ts`
 * so the mailto/label helpers stay free of native modules in tests. Under EAS
 * the build number comes from the remote counter, so `app.json` cannot know
 * it — only the binary can.
 */
export function readAppVersion(): AppVersionInfo {
  return {
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
  };
}
