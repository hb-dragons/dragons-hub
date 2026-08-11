import { z } from "zod";
import type { WebhookConfig, WhatsAppGroupConfig } from "@dragons/shared";

const localeSchema = z.enum(["de", "en"]);

const whatsappGroupConfigSchema = z.object({
  groupId: z.string().min(1),
  locale: localeSchema,
});

export function parseWhatsAppGroupConfig(input: unknown): WhatsAppGroupConfig | null {
  const result = whatsappGroupConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

const webhookConfigSchema = z.object({
  kind: z.literal("github_repository_dispatch"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  eventType: z.string().min(1),
});

export function parseWebhookConfig(input: unknown): WebhookConfig | null {
  const result = webhookConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function readLocale(input: unknown): "de" | "en" | undefined {
  if (input && typeof input === "object" && "locale" in input) {
    const result = localeSchema.safeParse((input as { locale: unknown }).locale);
    if (result.success) return result.data;
  }
  return undefined;
}
