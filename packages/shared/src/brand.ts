declare const process: { env: Record<string, string | undefined> } | undefined;

export function clubLogoUrl(clubId: number, baseUrl?: string): string {
  const envBase =
    typeof process !== "undefined"
      ? process.env["NEXT_PUBLIC_API_URL"] || process.env["EXPO_PUBLIC_API_URL"]
      : undefined;
  const base = baseUrl || envBase || "http://localhost:3001";
  return `${base}/public/assets/clubs/${clubId}.webp`;
}
