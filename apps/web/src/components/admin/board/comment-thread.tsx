"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { Loader2, Send } from "lucide-react";
import type { TaskComment } from "@dragons/shared";
import { useUsers } from "@/hooks/use-users";

export interface CommentThreadProps {
  comments: TaskComment[];
  onAdd: (body: string) => Promise<void>;
}

export function CommentThread({ comments, onAdd }: CommentThreadProps) {
  const t = useTranslations("board");
  const format = useFormatter();
  const { data: users } = useUsers();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resolveName(authorId: string): string {
    return users?.get(authorId)?.name ?? authorId;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(draft.trim());
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("comments.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border bg-muted/30 p-2 text-sm"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {resolveName(c.authorId)}
                </span>
                <span>
                  {format.dateTime(new Date(c.createdAt), "short")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("task.addComment")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          disabled={!draft.trim() || submitting}
          aria-label={t("task.addComment")}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
