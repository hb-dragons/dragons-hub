"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Switch } from "@dragons/ui/components/switch";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type {
  ChannelConfigItem,
  ChannelConfigListResult,
  ProviderAvailability,
} from "./types";

type ChannelType = ChannelConfigItem["type"];
type DigestMode = ChannelConfigItem["digestMode"];

const CHANNEL_TYPES: ChannelType[] = ["in_app", "whatsapp_group", "email"];
const DIGEST_MODES: DigestMode[] = ["per_sync", "scheduled", "none"];

interface ChannelFormState {
  name: string;
  type: ChannelType;
  digestMode: DigestMode;
  digestCron: string;
  digestTimezone: string;
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
  groupId: string;
}

function emptyForm(): ChannelFormState {
  return {
    name: "",
    type: "in_app",
    digestMode: "none",
    digestCron: "",
    digestTimezone: "Europe/Berlin",
    audienceRole: "admin",
    locale: "de",
    groupId: "",
  };
}

function channelToForm(ch: ChannelConfigItem): ChannelFormState {
  const config = ch.config;
  return {
    name: ch.name,
    type: ch.type,
    digestMode: ch.digestMode,
    digestCron: ch.digestCron ?? "",
    digestTimezone: ch.digestTimezone,
    audienceRole: "audienceRole" in config ? config.audienceRole : "admin",
    locale: config.locale ?? "de",
    groupId: "groupId" in config ? config.groupId : "",
  };
}

function buildConfig(form: ChannelFormState): Record<string, unknown> {
  switch (form.type) {
    case "in_app":
      return { audienceRole: form.audienceRole, locale: form.locale };
    case "whatsapp_group":
      return { groupId: form.groupId, locale: form.locale };
    case "email":
      return { locale: form.locale };
  }
}

// next-intl's t() has strict key typing, so we use ReturnType to accept it
type TranslateFunc = ReturnType<typeof import("next-intl").useTranslations>;

function digestModeLabel(mode: DigestMode, t: TranslateFunc): string {
  switch (mode) {
    case "per_sync": return t("perSync" as never);
    case "scheduled": return t("scheduled" as never);
    case "none": return t("none" as never);
  }
}

function channelTypeLabel(type: string, t: TranslateFunc): string {
  switch (type) {
    case "in_app": return t("typeLabels.in_app" as never);
    case "whatsapp_group": return t("typeLabels.whatsapp_group" as never);
    case "email": return t("typeLabels.email" as never);
    default: return type;
  }
}

export function ChannelConfigsList() {
  const t = useTranslations("channelConfigs");
  const tCommon = useTranslations("common");
  const { data: result } = useSWR<ChannelConfigListResult>(
    SWR_KEYS.channelConfigs,
    apiFetcher,
  );
  const { data: providers } = useSWR<ProviderAvailability>(
    SWR_KEYS.channelConfigProviders,
    apiFetcher,
  );
  const { mutate } = useSWRConfig();

  const availableTypes = CHANNEL_TYPES.filter(
    (ct) => providers?.[ct]?.configured !== false,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] =
    useState<ChannelConfigItem | null>(null);
  const [form, setForm] = useState<ChannelFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const channels = result?.configs ?? [];

  function openCreate() {
    setEditingChannel(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(channel: ChannelConfigItem) {
    setEditingChannel(channel);
    setForm(channelToForm(channel));
    setDialogOpen(true);
  }

  async function handleToggleEnabled(channel: ChannelConfigItem) {
    try {
      await fetchAPI(`/admin/channel-configs/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      await mutate(SWR_KEYS.channelConfigs);
    } catch {
      toast.error(tCommon("failed"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        digestMode: form.digestMode,
        digestCron:
          form.digestMode === "scheduled" && form.digestCron
            ? form.digestCron
            : null,
        digestTimezone: form.digestTimezone || "Europe/Berlin",
        config: buildConfig(form),
      };

      if (editingChannel) {
        await fetchAPI(`/admin/channel-configs/${editingChannel.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI("/admin/channel-configs", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      await mutate(SWR_KEYS.channelConfigs);
      toast.success(t("saved"));
      setDialogOpen(false);
    } catch {
      toast.error(tCommon("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {channels.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <Card key={channel.id} className="relative">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">{channel.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {channelTypeLabel(channel.type, t)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={channel.enabled}
                    onCheckedChange={() => handleToggleEnabled(channel)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(channel)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("digestMode")}</dt>
                    <dd>{digestModeLabel(channel.digestMode, t)}</dd>
                  </div>
                  {channel.digestMode === "scheduled" && channel.digestCron && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t("digestCron")}
                      </dt>
                      <dd className="font-mono text-xs">
                        {channel.digestCron}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t("enabled")}
                    </dt>
                    <dd>
                      {channel.enabled ? t("enabled") : t("disabled")}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? t("edit") : t("create")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="channel-name">{t("name")}</Label>
              <Input
                id="channel-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...emptyForm(),
                    name: prev.name,
                    digestMode: prev.digestMode,
                    digestCron: prev.digestCron,
                    digestTimezone: prev.digestTimezone,
                    type: v as ChannelType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {channelTypeLabel(ct, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Digest Mode */}
            <div className="space-y-2">
              <Label>{t("digestMode")}</Label>
              <Select
                value={form.digestMode}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    digestMode: v as DigestMode,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIGEST_MODES.map((dm) => (
                    <SelectItem key={dm} value={dm}>
                      {digestModeLabel(dm, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Digest Cron (only when scheduled) */}
            {form.digestMode === "scheduled" && (
              <div className="space-y-2">
                <Label htmlFor="channel-cron">{t("digestCron")}</Label>
                <Input
                  id="channel-cron"
                  value={form.digestCron}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      digestCron: e.target.value,
                    }))
                  }
                  placeholder="0 8 * * *"
                  className="font-mono"
                />
              </div>
            )}

            {/* Digest Timezone */}
            <div className="space-y-2">
              <Label htmlFor="channel-timezone">{t("digestTimezone")}</Label>
              <Input
                id="channel-timezone"
                value={form.digestTimezone}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    digestTimezone: e.target.value,
                  }))
                }
                placeholder="Europe/Berlin"
              />
            </div>

            {/* Config fields based on type */}
            {form.type === "in_app" && (
              <div className="space-y-2">
                <Label>{t("audienceRole")}</Label>
                <Select
                  value={form.audienceRole}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      audienceRole: v as "admin" | "referee",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("audienceRoles.admin" as never)}</SelectItem>
                    <SelectItem value="referee">{t("audienceRoles.referee" as never)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.type === "whatsapp_group" && (
              <div className="space-y-2">
                <Label htmlFor="channel-group-id">{t("groupId")}</Label>
                <Input
                  id="channel-group-id"
                  value={form.groupId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, groupId: e.target.value }))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">{t("groupIdHelp" as never)}</p>
              </div>
            )}

            {/* Locale (shown for all types) */}
            <div className="space-y-2">
              <Label>{t("locale" as never)}</Label>
              <Select
                value={form.locale}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, locale: v as "de" | "en" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">{t("locales.de" as never)}</SelectItem>
                  <SelectItem value="en">{t("locales.en" as never)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !form.name.trim()}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
