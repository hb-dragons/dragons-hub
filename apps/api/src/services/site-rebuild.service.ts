import { env } from "../config/env";
import { logger } from "../config/logger";
import { postRepositoryDispatch } from "./github-dispatch";

const log = logger.child({ service: "site-rebuild" });

const OWNER = "hb-dragons";
const REPO = "dragons-hub";

/**
 * Event type of the rebuild dispatch. `deploy-site.yml` listens for it
 * alongside `cms-publish` (Payload's own hook) — a separate type so the
 * workflow run says which side published, while both take the same path.
 */
export const SITE_REBUILD_EVENT_TYPE = "hub-content-change";

/**
 * Rebuilds the static Website after Hub-owned content the site reads at build
 * time changed — today the team staff the Website shows as coaches (ADR 0008).
 * The counterpart of `apps/cms/src/hooks/dispatch-rebuild.ts`, which does the
 * same for CMS publishes.
 *
 * Failure contract, same as that hook and as the `webhook` notification
 * channel: this never throws and never rejects. A missing `GH_DISPATCH_TOKEN`
 * is a logged skip (dev, CI), and a GitHub error or a network failure is
 * logged and swallowed — a save must not fail because a rebuild could not be
 * asked for, and the daily deploy cron is the safety net for a lost dispatch.
 * No debounce either: the workflow's concurrency group coalesces bursts.
 */
export async function dispatchSiteRebuild(reason: string): Promise<void> {
  const token = env.GH_DISPATCH_TOKEN;
  if (!token) {
    log.warn({ reason }, "GH_DISPATCH_TOKEN not configured, skipping site rebuild dispatch");
    return;
  }

  const result = await postRepositoryDispatch({
    owner: OWNER,
    repo: REPO,
    token,
    eventType: SITE_REBUILD_EVENT_TYPE,
    clientPayload: { reason },
  });

  if (!result.ok) {
    log.error(
      { status: result.status, errorText: result.error, reason },
      "Site rebuild dispatch failed",
    );
    return;
  }
  log.info({ reason }, "Site rebuild dispatch sent");
}
