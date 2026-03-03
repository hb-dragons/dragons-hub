"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import { apiFetcher } from "@/lib/swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Textarea } from "@dragons/ui/components/textarea";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Badge } from "@dragons/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { DatePicker } from "@dragons/ui/components/date-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@dragons/ui/components/sheet";
import { AlertTriangle, Calendar, Clock, Loader2, MapPin, Send, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import type { TaskDetail, TaskCardData } from "@dragons/shared";
import { TASK_PRIORITIES } from "@dragons/shared";

interface TaskDetailSheetProps {
  task: TaskCardData | null;
  onClose: () => void;
  boardId: number;
}

export function TaskDetailSheet({ task, onClose, boardId }: TaskDetailSheetProps) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const isOpen = task !== null;

  const { data: detail } = useSWR<TaskDetail>(
    task ? `/admin/tasks/${task.id}` : null,
    apiFetcher,
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (detail) {
      setTitle(detail.title);
      setDescription(detail.description ?? "");
      setPriority(detail.priority);
      setDueDate(detail.dueDate);
    }
  }, [detail]);

  const hasChanges =
    detail &&
    (title !== detail.title ||
      description !== (detail.description ?? "") ||
      priority !== detail.priority ||
      dueDate !== detail.dueDate);

  async function handleSave() {
    if (!task) return;
    setSaving(true);
    try {
      await fetchAPI(`/admin/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueDate,
        }),
      });
      await mutate(SWR_KEYS.boardTasks(boardId));
      await mutate(`/admin/tasks/${task.id}`);
      toast.success(t("board.toast.updated"));
    } catch {
      // Error surfaced by fetchAPI
    } finally {
      setSaving(false);
    }
  }

  async function toggleChecklistItem(itemId: number, isChecked: boolean) {
    if (!task) return;
    try {
      await fetchAPI(`/admin/tasks/${task.id}/checklist/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ isChecked }),
      });
      await mutate(`/admin/tasks/${task.id}`);
      await mutate(SWR_KEYS.boardTasks(boardId));
    } catch {
      // Error surfaced by fetchAPI
    }
  }

  async function submitComment() {
    if (!task || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await fetchAPI(`/admin/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: newComment.trim(), authorId: "admin" }),
      });
      setNewComment("");
      await mutate(`/admin/tasks/${task.id}`);
    } catch {
      // Error surfaced by fetchAPI
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{task?.title ?? ""}</SheetTitle>
          <SheetDescription>
            {task?.sourceType ? `${t("board.task.source")}: ${task.sourceType}` : ""}
          </SheetDescription>
        </SheetHeader>

        {detail ? (
          <div className="space-y-6 p-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>{t("board.task.title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t("board.task.description")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Priority + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("board.task.priority")}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`board.priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("board.task.dueDate")}</Label>
                <DatePicker value={dueDate} onChange={setDueDate} />
              </div>
            </div>

            {/* Booking Info */}
            {detail.booking && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4" />
                    {t("board.task.venueBooking")}
                    <Badge
                      variant={
                        detail.booking.status === "confirmed" ? "success"
                          : detail.booking.status === "cancelled" ? "destructive"
                            : "secondary"
                      }
                      className="ml-auto"
                    >
                      {t(`bookings.status.${detail.booking.status}`)}
                    </Badge>
                    {detail.booking.needsReconfirmation && (
                      <span className="text-amber-600" title={t("bookings.needsReconfirmation")}>
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {detail.booking.venueName}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {detail.booking.date}
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {detail.booking.effectiveStartTime} – {detail.booking.effectiveEndTime}
                    </div>
                  </div>

                  {/* Linked Matches */}
                  {detail.booking.matches.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {t("board.task.linkedMatches")} ({detail.booking.matches.length})
                      </p>
                      <div className="space-y-1">
                        {detail.booking.matches.map((match) => (
                          <div
                            key={match.id}
                            className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-medium">
                              {match.homeTeam} vs {match.guestTeam}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {match.kickoffDate} {match.kickoffTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Match link (standalone, when no booking) */}
            {detail.matchId && !detail.booking && (
              <Badge variant="outline">{t("board.task.linkedMatch")}: #{detail.matchId}</Badge>
            )}

            {/* Save button */}
            {hasChanges && (
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            )}

            {/* Checklist */}
            {detail.checklist.length > 0 && (
              <div className="space-y-2">
                <Label>{t("board.task.checklist")}</Label>
                <div className="space-y-1">
                  {detail.checklist
                    .sort((a, b) => a.position - b.position)
                    .map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={item.isChecked}
                          onCheckedChange={(checked) =>
                            toggleChecklistItem(item.id, checked === true)
                          }
                        />
                        <span
                          className={
                            item.isChecked
                              ? "text-sm text-muted-foreground line-through"
                              : "text-sm"
                          }
                        >
                          {item.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-2">
              <Label>{t("board.task.comments")}</Label>
              {detail.comments.length > 0 && (
                <div className="space-y-2">
                  {detail.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-md border bg-muted/50 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{comment.authorId}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-1">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t("board.task.addComment")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={submitComment}
                  disabled={!newComment.trim() || submittingComment}
                >
                  {submittingComment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
