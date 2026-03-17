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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@dragons/ui/components/alert-dialog";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type {
  WatchRuleItem,
  WatchRuleListResult,
  FilterCondition,
  ChannelTarget,
  ChannelConfigListResult,
  ChannelConfigItem,
} from "./types";

const ALL_EVENT_TYPES = [
  "match.created",
  "match.schedule.changed",
  "match.venue.changed",
  "match.cancelled",
  "match.forfeited",
  "match.score.changed",
  "match.removed",
  "match.result_entered",
  "match.result_changed",
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "booking.created",
  "booking.status.changed",
  "booking.needs_reconfirmation",
  "override.conflict",
  "override.applied",
  "override.reverted",
  "sync.completed",
] as const;

const FILTER_FIELDS: FilterCondition["field"][] = [
  "teamId",
  "leagueId",
  "venueId",
  "source",
];
const FILTER_OPERATORS: FilterCondition["operator"][] = [
  "eq",
  "neq",
  "in",
  "any",
];

interface RuleFormState {
  name: string;
  eventTypes: string[];
  filters: FilterCondition[];
  channels: ChannelTarget[];
  urgencyOverride: string;
}

function emptyForm(): RuleFormState {
  return {
    name: "",
    eventTypes: [],
    filters: [],
    channels: [],
    urgencyOverride: "default",
  };
}

function ruleToForm(rule: WatchRuleItem): RuleFormState {
  return {
    name: rule.name,
    eventTypes: [...rule.eventTypes],
    filters: rule.filters.map((f) => ({ ...f })),
    channels: rule.channels.map((c) => ({ ...c })),
    urgencyOverride: rule.urgencyOverride ?? "default",
  };
}

export function WatchRulesList() {
  const t = useTranslations("watchRules");
  const tCommon = useTranslations("common");
  const { data: rulesResult } = useSWR<WatchRuleListResult>(
    SWR_KEYS.watchRules,
    apiFetcher,
  );
  const { data: channelsResult } = useSWR<ChannelConfigListResult>(
    SWR_KEYS.channelConfigs,
    apiFetcher,
  );
  const { mutate } = useSWRConfig();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WatchRuleItem | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const rules = rulesResult?.rules ?? [];
  const availableChannels = channelsResult?.channels ?? [];

  function openCreate() {
    setEditingRule(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(rule: WatchRuleItem) {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setDialogOpen(true);
  }

  async function handleToggleEnabled(rule: WatchRuleItem) {
    try {
      await fetchAPI(`/admin/watch-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await mutate(SWR_KEYS.watchRules);
    } catch {
      toast.error(tCommon("failed"));
    }
  }

  async function handleDelete(ruleId: number) {
    try {
      await fetchAPI(`/admin/watch-rules/${ruleId}`, { method: "DELETE" });
      await mutate(SWR_KEYS.watchRules);
      toast.success(t("deleted"));
    } catch {
      toast.error(tCommon("failed"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.eventTypes.length === 0) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        eventTypes: form.eventTypes,
        filters: form.filters,
        channels: form.channels,
        urgencyOverride:
          form.urgencyOverride === "default"
            ? null
            : form.urgencyOverride,
      };

      if (editingRule) {
        await fetchAPI(`/admin/watch-rules/${editingRule.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI("/admin/watch-rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      await mutate(SWR_KEYS.watchRules);
      toast.success(t("saved"));
      setDialogOpen(false);
    } catch {
      toast.error(tCommon("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Event type toggle ──────────────────────────────────────────────────────
  function toggleEventType(eventType: string) {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((et) => et !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  function addFilter() {
    setForm((prev) => ({
      ...prev,
      filters: [
        ...prev.filters,
        { field: "teamId", operator: "eq", value: "" },
      ],
    }));
  }

  function updateFilter(
    index: number,
    patch: Partial<FilterCondition>,
  ) {
    setForm((prev) => ({
      ...prev,
      filters: prev.filters.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    }));
  }

  function removeFilter(index: number) {
    setForm((prev) => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index),
    }));
  }

  // ── Channel targets ────────────────────────────────────────────────────────
  function toggleChannel(channel: ChannelConfigItem) {
    setForm((prev) => {
      const exists = prev.channels.find(
        (c) => c.targetId === String(channel.id),
      );
      if (exists) {
        return {
          ...prev,
          channels: prev.channels.filter(
            (c) => c.targetId !== String(channel.id),
          ),
        };
      }
      return {
        ...prev,
        channels: [
          ...prev.channels,
          { channel: channel.type, targetId: String(channel.id) },
        ],
      };
    });
  }

  function isChannelSelected(channelId: number): boolean {
    return form.channels.some((c) => c.targetId === String(channelId));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="text-center">{t("enabled")}</TableHead>
              <TableHead>{t("eventTypes")}</TableHead>
              <TableHead>{t("channels")}</TableHead>
              <TableHead>{t("urgencyOverride")}</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggleEnabled(rule)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {rule.eventTypes.slice(0, 3).map((et) => (
                      <Badge key={et} variant="secondary" className="text-xs">
                        {et}
                      </Badge>
                    ))}
                    {rule.eventTypes.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{rule.eventTypes.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {rule.channels.map((ch) => (
                      <Badge key={ch.targetId} variant="outline" className="text-xs">
                        {ch.channel}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {rule.urgencyOverride ?? t("noOverride")}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteConfirm")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {tCommon("cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(rule.id)}
                          >
                            {t("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? t("edit") : t("create")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="rule-name">{t("name")}</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>

            {/* Event types */}
            <div className="space-y-2">
              <Label>{t("when")} &mdash; {t("eventTypes")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_EVENT_TYPES.map((et) => (
                  <button
                    key={et}
                    type="button"
                    onClick={() => toggleEventType(et)}
                    className="focus-visible:ring-ring rounded-md focus-visible:outline-none focus-visible:ring-2"
                  >
                    <Badge
                      variant={
                        form.eventTypes.includes(et) ? "default" : "outline"
                      }
                      className="cursor-pointer text-xs"
                    >
                      {et}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("and")} &mdash; {t("filters")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFilter}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t("addFilter")}
                </Button>
              </div>
              {form.filters.map((filter, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={filter.field}
                    onValueChange={(v) =>
                      updateFilter(idx, {
                        field: v as FilterCondition["field"],
                      })
                    }
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILTER_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.operator}
                    onValueChange={(v) =>
                      updateFilter(idx, {
                        operator: v as FilterCondition["operator"],
                      })
                    }
                  >
                    <SelectTrigger className="w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILTER_OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filter.operator !== "any" && (
                    <Input
                      value={
                        Array.isArray(filter.value)
                          ? filter.value.join(", ")
                          : (filter.value ?? "")
                      }
                      onChange={(e) =>
                        updateFilter(idx, {
                          value:
                            filter.operator === "in"
                              ? e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              : e.target.value,
                        })
                      }
                      placeholder={
                        filter.operator === "in"
                          ? "value1, value2"
                          : "value"
                      }
                      className="flex-1"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFilter(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Channels */}
            <div className="space-y-2">
              <Label>{t("then")} &mdash; {t("channels")}</Label>
              {availableChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No channels available
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {availableChannels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className="focus-visible:ring-ring rounded-md focus-visible:outline-none focus-visible:ring-2"
                    >
                      <Badge
                        variant={
                          isChannelSelected(ch.id) ? "default" : "outline"
                        }
                        className="cursor-pointer text-xs"
                      >
                        {ch.name}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Urgency override */}
            <div className="space-y-2">
              <Label>{t("urgencyOverride")}</Label>
              <Select
                value={form.urgencyOverride}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, urgencyOverride: v }))
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("noOverride")}</SelectItem>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="routine">Routine</SelectItem>
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
                disabled={
                  submitting ||
                  !form.name.trim() ||
                  form.eventTypes.length === 0
                }
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
