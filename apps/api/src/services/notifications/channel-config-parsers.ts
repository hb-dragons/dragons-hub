import { z } from "zod";
import type { WhatsAppGroupConfig, InAppConfig } from "@dragons/shared";

const localeSchema = z.enum(["de", "en"]);

const inAppConfigSchema = z.object({
  audienceRole: z.enum(["admin", "referee"]),
  locale: localeSchema,
});

const whatsappGroupConfigSchema = z.object({
  groupId: z.string().min(1),
  locale: localeSchema,
});

export function parseWhatsAppGroupConfig(input: unknown): WhatsAppGroupConfig | null {
  const result = whatsappGroupConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseInAppConfig(input: unknown): InAppConfig | null {
  const result = inAppConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function readLocale(input: unknown): "de" | "en" | undefined {
  if (input && typeof input === "object" && "locale" in input) {
    const result = localeSchema.safeParse((input as { locale: unknown }).locale);
    if (result.success) return result.data;
  }
  return undefined;
}
