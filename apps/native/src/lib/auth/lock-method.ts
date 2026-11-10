/**
 * The app lock's method, named the way the device names it (#399).
 *
 * "Biometrische Sperre" told nobody what would happen; iOS itself says
 * "Face ID" or "Touch ID", Android "fingerprint" or "face unlock". This maps
 * what expo-local-authentication reports to one of those names.
 *
 * Takes the raw `AuthenticationType` numbers (1 fingerprint, 2 facial
 * recognition, 3 iris) so it can be tested without the native module.
 */
export type LockMethod = "faceId" | "touchId" | "fingerprint" | "face" | "iris" | "biometrics";

const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;
const IRIS = 3;

export function lockMethod(types: readonly number[], os: string): LockMethod | null {
  const unique = [...new Set(types)];
  if (unique.length === 0) return null;
  // Android's system prompt lets the user pick when several are enrolled, so
  // naming one of them would promise something the prompt may not ask for.
  if (unique.length > 1) return "biometrics";
  const [type] = unique;
  if (os === "ios") {
    if (type === FACIAL_RECOGNITION) return "faceId";
    if (type === FINGERPRINT) return "touchId";
    return "biometrics";
  }
  if (type === FINGERPRINT) return "fingerprint";
  if (type === FACIAL_RECOGNITION) return "face";
  if (type === IRIS) return "iris";
  return "biometrics";
}

type Translate = (key: string, options?: Record<string, string>) => string;

/** The lock toggle's and the unlock button's labels, e.g. "Mit Face ID sperren". */
export function lockLabels(method: LockMethod | null, t: Translate): { toggle: string; unlock: string } {
  const name = t(`lockMethod.${method ?? "biometrics"}`);
  return {
    toggle: t("profile.lockWith", { method: name }),
    unlock: t("auth.unlockWith", { method: name }),
  };
}
