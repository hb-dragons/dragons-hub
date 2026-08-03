import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from "payload";

// Fires a repository_dispatch against dragons-hub so the deploy workflow
// (plan Task D2) rebuilds the static site. No debounce: the workflow's
// concurrency group coalesces bursts. A failed dispatch must never fail a
// save — the daily deploy cron is the safety net — so failures only log.
// Without GH_DISPATCH_TOKEN (dev, CI) this is a silent no-op.
async function dispatch(reason: string): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return;
  try {
    const res = await fetch("https://api.github.com/repos/hb-dragons/dragons-hub/dispatches", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      body: JSON.stringify({ event_type: "cms-publish", client_payload: { reason } }),
    });
    if (!res.ok) {
      console.error(`rebuild dispatch failed: GitHub responded ${res.status} (${reason})`);
    }
  } catch (err) {
    console.error("rebuild dispatch failed", err);
  }
}

/**
 * The migration script (issue #165) writes over REST, and Payload's REST layer
 * hard-sets `req.context` to `{}` — `createPayloadRequest` offers no way to
 * pass context in. So a bulk import cannot reach the `context.skipRebuild`
 * guard below and would fire one repository_dispatch per document.
 *
 * `?skipRebuild=true` is the documented workaround (Payload's own
 * test/hooks/collections/ContextHooks fixture lifts query params into context;
 * this is the same idea narrowed to one known flag). Writes require
 * authentication, so only editors and the build user can set it, and the daily
 * deploy cron remains the safety net.
 */
export function shouldSkipRebuild(req: {
  context?: { skipRebuild?: unknown };
  searchParams?: URLSearchParams;
}): boolean {
  if (req.context?.skipRebuild) return true;
  return req.searchParams?.get("skipRebuild") === "true";
}

export const dispatchOnPublish: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  collection,
}) => {
  if (shouldSkipRebuild(req)) return doc;
  const was = previousDoc?._status;
  const is = doc?._status;
  // Drafted collections (posts, pages): a save is live when it lands published
  // or pulls a published doc back to draft. Draftless collections carry no
  // _status — every change is live.
  const liveChanged = is === "published" || (was === "published" && is !== "published");
  const draftless = is === undefined;
  if (liveChanged || draftless) await dispatch(`${collection.slug} change`);
  return doc;
};

export const dispatchOnDelete: CollectionAfterDeleteHook = async ({ doc, req, collection }) => {
  if (!shouldSkipRebuild(req)) await dispatch(`${collection.slug} delete`);
  return doc;
};

export const dispatchGlobalOnChange: GlobalAfterChangeHook = async ({ doc, req, global }) => {
  // Globals are draftless singletons — every change is live.
  if (!shouldSkipRebuild(req)) await dispatch(`${global.slug} change`);
  return doc;
};
