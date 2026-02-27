import { db } from "../../config/database";
import {
  tasks,
  taskChecklistItems,
  taskComments,
  boardColumns,
  boards,
  venueBookings,
  venueBookingMatches,
  venues,
  matches,
  teams,
} from "@dragons/db/schema";
import { eq, and, asc, sql, count } from "drizzle-orm";
import type {
  TaskCardData,
  TaskDetail,
  ChecklistItem,
  TaskComment,
  TaskPriority,
  BookingInfo,
} from "@dragons/shared";

export interface TaskFilters {
  columnId?: number;
  assigneeId?: string;
  priority?: string;
}

export async function listTasks(
  boardId: number,
  filters?: TaskFilters,
): Promise<TaskCardData[]> {
  // Build where conditions
  const conditions = [eq(tasks.boardId, boardId)];
  if (filters?.columnId) {
    conditions.push(eq(tasks.columnId, filters.columnId));
  }
  if (filters?.assigneeId) {
    conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  }
  if (filters?.priority) {
    conditions.push(eq(tasks.priority, filters.priority));
  }

  const rows = await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      columnId: tasks.columnId,
      title: tasks.title,
      description: tasks.description,
      assigneeId: tasks.assigneeId,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      position: tasks.position,
      matchId: tasks.matchId,
      venueBookingId: tasks.venueBookingId,
      sourceType: tasks.sourceType,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position), asc(tasks.id));

  // Get checklist counts for all tasks in one query
  const taskIds = rows.map((r) => r.id);
  if (taskIds.length === 0) return [];

  const checklistCounts = await db
    .select({
      taskId: taskChecklistItems.taskId,
      total: count(),
      checked: sql<number>`count(*) filter (where ${taskChecklistItems.isChecked} = true)`,
    })
    .from(taskChecklistItems)
    .where(
      sql`${taskChecklistItems.taskId} IN (${sql.join(
        taskIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .groupBy(taskChecklistItems.taskId);

  const countMap = new Map(
    checklistCounts.map((c) => [c.taskId, { total: c.total, checked: c.checked }]),
  );

  return rows.map((row) => ({
    ...row,
    priority: row.priority as TaskPriority,
    checklistTotal: countMap.get(row.id)?.total ?? 0,
    checklistChecked: countMap.get(row.id)?.checked ?? 0,
  }));
}

export async function createTask(
  boardId: number,
  data: {
    title: string;
    description?: string | null;
    assigneeId?: string | null;
    priority?: string;
    dueDate?: string | null;
    columnId: number;
    matchId?: number | null;
    venueBookingId?: number | null;
  },
): Promise<TaskDetail | null> {
  // Verify board exists
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);

  if (!board) return null;

  // Verify column exists and belongs to board
  const [column] = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(
      and(
        eq(boardColumns.id, data.columnId),
        eq(boardColumns.boardId, boardId),
      ),
    )
    .limit(1);

  if (!column) return null;

  // Get max position in this column
  const [maxPos] = await db
    .select({ maxPosition: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(eq(tasks.columnId, data.columnId));

  const [task] = await db
    .insert(tasks)
    .values({
      boardId,
      columnId: data.columnId,
      title: data.title,
      description: data.description ?? null,
      assigneeId: data.assigneeId ?? null,
      priority: data.priority ?? "normal",
      dueDate: data.dueDate ?? null,
      position: (maxPos?.maxPosition ?? -1) + 1,
      matchId: data.matchId ?? null,
      venueBookingId: data.venueBookingId ?? null,
    })
    .returning();

  return {
    id: task!.id,
    boardId: task!.boardId,
    columnId: task!.columnId,
    title: task!.title,
    description: task!.description,
    assigneeId: task!.assigneeId,
    priority: task!.priority as TaskPriority,
    dueDate: task!.dueDate,
    position: task!.position,
    matchId: task!.matchId,
    venueBookingId: task!.venueBookingId,
    sourceType: task!.sourceType,
    checklistTotal: 0,
    checklistChecked: 0,
    sourceDetail: task!.sourceDetail,
    createdBy: task!.createdBy,
    createdAt: task!.createdAt.toISOString(),
    updatedAt: task!.updatedAt.toISOString(),
    checklist: [],
    comments: [],
    booking: null,
  };
}

export async function getTaskDetail(id: number): Promise<TaskDetail | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) return null;

  const checklist = await db
    .select({
      id: taskChecklistItems.id,
      label: taskChecklistItems.label,
      isChecked: taskChecklistItems.isChecked,
      checkedBy: taskChecklistItems.checkedBy,
      checkedAt: taskChecklistItems.checkedAt,
      position: taskChecklistItems.position,
    })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id))
    .orderBy(asc(taskChecklistItems.position));

  const comments = await db
    .select({
      id: taskComments.id,
      authorId: taskComments.authorId,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
    })
    .from(taskComments)
    .where(eq(taskComments.taskId, id))
    .orderBy(asc(taskComments.createdAt));

  // Fetch linked booking info if present
  let booking: BookingInfo | null = null;
  if (task.venueBookingId) {
    const [bookingRow] = await db
      .select({
        id: venueBookings.id,
        venueName: venues.name,
        date: venueBookings.date,
        calculatedStartTime: venueBookings.calculatedStartTime,
        calculatedEndTime: venueBookings.calculatedEndTime,
        overrideStartTime: venueBookings.overrideStartTime,
        overrideEndTime: venueBookings.overrideEndTime,
        status: venueBookings.status,
        needsReconfirmation: venueBookings.needsReconfirmation,
      })
      .from(venueBookings)
      .innerJoin(venues, eq(venues.id, venueBookings.venueId))
      .where(eq(venueBookings.id, task.venueBookingId))
      .limit(1);

    if (bookingRow) {
      const homeTeam = db
        .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
        .from(teams)
        .as("home_team");
      const guestTeam = db
        .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
        .from(teams)
        .as("guest_team");

      const linkedMatches = await db
        .select({
          id: matches.id,
          matchNo: matches.matchNo,
          kickoffDate: matches.kickoffDate,
          kickoffTime: matches.kickoffTime,
          homeTeam: homeTeam.name,
          guestTeam: guestTeam.name,
        })
        .from(venueBookingMatches)
        .innerJoin(matches, eq(matches.id, venueBookingMatches.matchId))
        .innerJoin(
          homeTeam,
          eq(homeTeam.apiTeamPermanentId, matches.homeTeamApiId),
        )
        .innerJoin(
          guestTeam,
          eq(guestTeam.apiTeamPermanentId, matches.guestTeamApiId),
        )
        .where(eq(venueBookingMatches.venueBookingId, task.venueBookingId));

      booking = {
        id: bookingRow.id,
        venueName: bookingRow.venueName,
        date: bookingRow.date,
        effectiveStartTime: bookingRow.overrideStartTime ?? bookingRow.calculatedStartTime,
        effectiveEndTime: bookingRow.overrideEndTime ?? bookingRow.calculatedEndTime,
        status: bookingRow.status as BookingInfo["status"],
        needsReconfirmation: bookingRow.needsReconfirmation,
        matches: linkedMatches,
      };
    }
  }

  return {
    id: task.id,
    boardId: task.boardId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    priority: task.priority as TaskPriority,
    dueDate: task.dueDate,
    position: task.position,
    matchId: task.matchId,
    venueBookingId: task.venueBookingId,
    sourceType: task.sourceType,
    checklistTotal: checklist.length,
    checklistChecked: checklist.filter((c) => c.isChecked).length,
    sourceDetail: task.sourceDetail,
    createdBy: task.createdBy,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    checklist: checklist.map((c) => ({
      ...c,
      checkedAt: c.checkedAt?.toISOString() ?? null,
    })),
    comments: comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    booking,
  };
}

export async function updateTask(
  id: number,
  data: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    priority?: string;
    dueDate?: string | null;
  },
): Promise<TaskDetail | null> {
  const [updated] = await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();

  if (!updated) return null;

  return getTaskDetail(id);
}

export async function moveTask(
  id: number,
  columnId: number,
  position: number,
): Promise<TaskDetail | null> {
  // Get the task first
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) return null;

  // Verify column exists
  const [column] = await db
    .select({
      id: boardColumns.id,
      isDoneColumn: boardColumns.isDoneColumn,
      boardId: boardColumns.boardId,
    })
    .from(boardColumns)
    .where(eq(boardColumns.id, columnId))
    .limit(1);

  if (!column) return null;

  // Update task position and column
  await db
    .update(tasks)
    .set({ columnId, position, updatedAt: new Date() })
    .where(eq(tasks.id, id));

  // If task has a venueBookingId and target column isDoneColumn, update the booking
  if (task.venueBookingId && column.isDoneColumn) {
    await db
      .update(venueBookings)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        needsReconfirmation: false,
        updatedAt: new Date(),
      })
      .where(eq(venueBookings.id, task.venueBookingId));
  }

  return getTaskDetail(id);
}

export async function deleteTask(id: number): Promise<boolean> {
  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id });

  return !!deleted;
}

// --- Checklist Items ---

export async function addChecklistItem(
  taskId: number,
  data: { label: string; position?: number },
): Promise<ChecklistItem | null> {
  // Verify task exists
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return null;

  let position = data.position;
  if (position === undefined) {
    const [maxPos] = await db
      .select({
        maxPosition: sql<number>`COALESCE(MAX(${taskChecklistItems.position}), -1)`,
      })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId));
    position = (maxPos?.maxPosition ?? -1) + 1;
  }

  const [item] = await db
    .insert(taskChecklistItems)
    .values({
      taskId,
      label: data.label,
      position,
    })
    .returning();

  return {
    id: item!.id,
    label: item!.label,
    isChecked: item!.isChecked,
    checkedBy: item!.checkedBy,
    checkedAt: item!.checkedAt?.toISOString() ?? null,
    position: item!.position,
  };
}

export async function updateChecklistItem(
  taskId: number,
  itemId: number,
  data: { label?: string; isChecked?: boolean; checkedBy?: string | null },
): Promise<ChecklistItem | null> {
  const updateData: Record<string, unknown> = {};
  if (data.label !== undefined) updateData.label = data.label;
  if (data.isChecked !== undefined) {
    updateData.isChecked = data.isChecked;
    if (data.isChecked) {
      updateData.checkedAt = new Date();
      if (data.checkedBy !== undefined) updateData.checkedBy = data.checkedBy;
    } else {
      updateData.checkedAt = null;
      updateData.checkedBy = null;
    }
  } else if (data.checkedBy !== undefined) {
    updateData.checkedBy = data.checkedBy;
  }

  const [updated] = await db
    .update(taskChecklistItems)
    .set(updateData)
    .where(
      and(
        eq(taskChecklistItems.id, itemId),
        eq(taskChecklistItems.taskId, taskId),
      ),
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    label: updated.label,
    isChecked: updated.isChecked,
    checkedBy: updated.checkedBy,
    checkedAt: updated.checkedAt?.toISOString() ?? null,
    position: updated.position,
  };
}

export async function deleteChecklistItem(
  taskId: number,
  itemId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(taskChecklistItems)
    .where(
      and(
        eq(taskChecklistItems.id, itemId),
        eq(taskChecklistItems.taskId, taskId),
      ),
    )
    .returning({ id: taskChecklistItems.id });

  return !!deleted;
}

// --- Comments ---

export async function addComment(
  taskId: number,
  data: { body: string; authorId: string },
): Promise<TaskComment | null> {
  // Verify task exists
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) return null;

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId,
      authorId: data.authorId,
      body: data.body,
    })
    .returning();

  return {
    id: comment!.id,
    authorId: comment!.authorId,
    body: comment!.body,
    createdAt: comment!.createdAt.toISOString(),
    updatedAt: comment!.updatedAt.toISOString(),
  };
}

export async function updateComment(
  taskId: number,
  commentId: number,
  data: { body: string },
): Promise<TaskComment | null> {
  const [updated] = await db
    .update(taskComments)
    .set({ body: data.body, updatedAt: new Date() })
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
      ),
    )
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    authorId: updated.authorId,
    body: updated.body,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteComment(
  taskId: number,
  commentId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(taskComments)
    .where(
      and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
      ),
    )
    .returning({ id: taskComments.id });

  return !!deleted;
}
