import type { RenderedMessage } from "./match";

const COMMENT_PREVIEW_MAX = 140;

export function truncateForPreview(body: string): string {
  if (body.length <= COMMENT_PREVIEW_MAX) return body;
  return `${body.slice(0, COMMENT_PREVIEW_MAX)}…`;
}

function renderAssigned(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const by = String(payload.assignedBy ?? "");
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    return {
      title: `Neue Aufgabe: ${title}`,
      body: `${by} hat dich einer Aufgabe auf ${board} zugewiesen.`,
    };
  }
  return {
    title: `New task: ${title}`,
    body: `${by} assigned you a task on ${board}.`,
  };
}

function renderUnassigned(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const by = String(payload.unassignedBy ?? "");
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    return {
      title: `Aufgabe entfernt: ${title}`,
      body: `${by} hat dich von einer Aufgabe auf ${board} entfernt.`,
    };
  }
  return {
    title: `Removed from task: ${title}`,
    body: `${by} removed you from a task on ${board}.`,
  };
}

function renderCommentAdded(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const author = String(payload.authorName ?? "");
  const preview = String(payload.bodyPreview ?? "");
  if (locale === "de") {
    return {
      title: `Neuer Kommentar: ${title}`,
      body: `${author}: ${preview}`,
    };
  }
  return {
    title: `New comment: ${title}`,
    body: `${author}: ${preview}`,
  };
}

function renderDueReminder(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const kind = payload.reminderKind === "day_of" ? "day_of" : "lead";
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    if (kind === "day_of") {
      return {
        title: `Heute fällig: ${title}`,
        body: `Deine Aufgabe auf ${board} ist heute fällig.`,
      };
    }
    return {
      title: `Morgen fällig: ${title}`,
      body: `Deine Aufgabe auf ${board} ist morgen fällig.`,
    };
  }
  if (kind === "day_of") {
    return {
      title: `Due today: ${title}`,
      body: `Your task on ${board} is due today.`,
    };
  }
  return {
    title: `Due tomorrow: ${title}`,
    body: `Your task on ${board} is due tomorrow.`,
  };
}

export function renderTaskMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  switch (eventType) {
    case "task.assigned":
      return renderAssigned(payload, entityName, locale);
    case "task.unassigned":
      return renderUnassigned(payload, entityName, locale);
    case "task.comment.added":
      return renderCommentAdded(payload, entityName, locale);
    case "task.due.reminder":
      return renderDueReminder(payload, entityName, locale);
    default:
      return null;
  }
}
