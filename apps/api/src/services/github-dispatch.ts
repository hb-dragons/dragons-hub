/**
 * The one place the API POSTs a GitHub `repository_dispatch`. Two callers want
 * one: the `webhook` notification channel (a finished sync rebuilds the site)
 * and the site-rebuild service (a team staff change does the same). They
 * differ in what surrounds the call — the channel claims a `notification_log`
 * row first and reports a `DeliveryResult` — so what is shared is exactly the
 * request: the endpoint, the four headers GitHub needs, and the body shape.
 *
 * Never throws: a network error comes back as a failed result, so both callers
 * decide what a failure means rather than guarding a rejection.
 */

const API_BASE = "https://api.github.com";

/** GitHub is on the far side of the internet; a save must not wait on it. */
const TIMEOUT_MS = 10_000;

export interface RepositoryDispatch {
  owner: string;
  repo: string;
  token: string;
  eventType: string;
  clientPayload: Record<string, unknown>;
}

export type RepositoryDispatchResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function postRepositoryDispatch(
  dispatch: RepositoryDispatch,
): Promise<RepositoryDispatchResult> {
  const url = `${API_BASE}/repos/${dispatch.owner}/${dispatch.repo}/dispatches`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${dispatch.token}`,
        "Content-Type": "application/json",
        // GitHub rejects requests without a User-Agent; Node's fetch does not
        // reliably send one, so it is set explicitly.
        "User-Agent": "dragons-hub-api",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: dispatch.eventType,
        client_payload: dispatch.clientPayload,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) return { ok: true };
    return { ok: false, status: response.status, error: await response.text() };
  } catch (err) {
    // `status: 0` marks "never got an answer" — a timeout, DNS, a dropped
    // connection — as distinct from a status GitHub actually returned.
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
