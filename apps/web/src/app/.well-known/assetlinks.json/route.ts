/**
 * Digital Asset Links statement list for Android app links (#249).
 *
 * `apps/native/app.json` declares `autoVerify: true` for `app.hbdragons.de`,
 * which makes Android fetch this path and compare the signing certificate of
 * the installed app against it. A missing or wrong fingerprint fails
 * verification with no user-visible error — links just open the browser.
 *
 * The fingerprint is Play's **app signing** key (Play Console → Setup → App
 * signing), not the EAS upload keystore and not `keytool` output, and it
 * exists only after the first upload (#247). It is a published value, not a
 * secret, but it is deployment state rather than source: it comes from
 * `ANDROID_APP_SIGNING_SHA256` so that publishing it is a config change on the
 * Cloud Run service, not a code change. Until it is set the route serves
 * nothing, which is the same outcome for the app as a wrong statement but
 * leaves no stale fingerprint in the repo pretending to be real.
 */

/** Play prints the fingerprint as 32 colon-separated hex bytes. */
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

/** Kept in step with `expo.android.package`; `route.test.ts` asserts the two match. */
const ANDROID_PACKAGE = "de.hbdragons.app";

/**
 * The env var is read per request rather than at module load: route handlers
 * are otherwise evaluated during the build, which would bake in whatever the
 * builder happened to have and defeat the point of configuring it on the
 * service.
 */
export const dynamic = "force-dynamic";

function readFingerprint(): string | null {
  const raw = process.env.ANDROID_APP_SIGNING_SHA256?.trim().toUpperCase();
  return raw && SHA256_FINGERPRINT.test(raw) ? raw : null;
}

export function GET(): Response {
  const fingerprint = readFingerprint();
  if (!fingerprint) return new Response(null, { status: 404 });

  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]);
}
