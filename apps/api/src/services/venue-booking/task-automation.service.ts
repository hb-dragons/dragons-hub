import { db } from "../../config/database";
import { logger } from "../../config/logger";
import {
  boards,
  boardColumns,
  tasks,
  taskChecklistItems,
  venueBookings,
  venueBookingMatches,
  venues,
  matches,
  teams,
  appSettings,
} from "@dragons/db/schema";
import { eq, asc, and, sql } from "drizzle-orm";

const log = logger.child({ service: "task-automation" });

const DEFAULT_BOARD_NAME = "Club Operations";

const DEFAULT_COLUMNS = [
  { name: "To Do", position: 0, isDoneColumn: false },
  { name: "In Progress", position: 1, isDoneColumn: false },
  { name: "Done", position: 2, isDoneColumn: true },
] as const;

const DEFAULT_CHECKLIST_ITEMS = [
  "Request sent",
  "Confirmation received",
  "Booking reference saved",
] as const;

const DEFAULT_DUE_DAYS_BEFORE = 7;

// ── ensureDefaultBoard ──────────────────────────────────────────────────────

export async function ensureDefaultBoard(): Promise<{
  boardId: number;
  firstColumnId: number;
}> {
  // Try to find existing board
  const [existing] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.name, DEFAULT_BOARD_NAME))
    .limit(1);

  if (existing) {
    const columns = await db
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(eq(boardColumns.boardId, existing.id))
      .orderBy(asc(boardColumns.position))
      .limit(1);

    return { boardId: existing.id, firstColumnId: columns[0]!.id };
  }

  // Create default board
  const [board] = await db
    .insert(boards)
    .values({ name: DEFAULT_BOARD_NAME })
    .returning();

  const cols = await db
    .insert(boardColumns)
    .values(
      DEFAULT_COLUMNS.map((col) => ({
        boardId: board!.id,
        name: col.name,
        position: col.position,
        isDoneColumn: col.isDoneColumn,
      })),
    )
    .returning();

  const firstCol = cols.sort((a, b) => a.position - b.position)[0]!;

  return { boardId: board!.id, firstColumnId: firstCol.id };
}

// ── createBookingTask ───────────────────────────────────────────────────────

function formatBookingDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function getDueDaysBefore(): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "venue_booking_due_days_before"))
    .limit(1);

  if (!row) return DEFAULT_DUE_DAYS_BEFORE;
  const parsed = parseInt(row.value, 10);
  return Number.isNaN(parsed) ? DEFAULT_DUE_DAYS_BEFORE : parsed;
}

export async function createBookingTask(
  venueBookingId: number,
  venueName: string,
  bookingDate: string,
  matchDescriptions: string[],
): Promise<number> {
  const { boardId, firstColumnId } = await ensureDefaultBoard();

  const formattedDate = formatBookingDate(bookingDate);
  const title = `Book venue: ${venueName} \u2014 ${formattedDate}`;

  const description =
    matchDescriptions.length > 0
      ? matchDescriptions.map((m) => `- ${m}`).join("\n")
      : null;

  // Calculate due date (UTC to avoid timezone drift)
  const dueDaysBefore = await getDueDaysBefore();
  const dueDate = new Date(bookingDate + "T00:00:00Z");
  dueDate.setUTCDate(dueDate.getUTCDate() - dueDaysBefore);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  // Get max position in the column
  const [maxPos] = await db
    .select({
      maxPosition: sql<number>`COALESCE(MAX(${tasks.position}), -1)`,
    })
    .from(tasks)
    .where(eq(tasks.columnId, firstColumnId));

  const [task] = await db
    .insert(tasks)
    .values({
      boardId,
      columnId: firstColumnId,
      title,
      description,
      priority: "high",
      dueDate: dueDateStr,
      position: (maxPos?.maxPosition ?? -1) + 1,
      sourceType: "sync_auto",
      venueBookingId,
    })
    .returning();

  // Create checklist items
  for (let i = 0; i < DEFAULT_CHECKLIST_ITEMS.length; i++) {
    await db.insert(taskChecklistItems).values({
      taskId: task!.id,
      label: DEFAULT_CHECKLIST_ITEMS[i]!,
      position: i,
    });
  }

  log.info(
    { taskId: task!.id, venueBookingId, venueName },
    "Created booking task",
  );

  return task!.id;
}

// ── handleBookingReconfirmation ─────────────────────────────────────────────

export async function handleBookingReconfirmation(
  venueBookingId: number,
): Promise<void> {
  // Find task linked to this booking
  const [task] = await db
    .select({ id: tasks.id, boardId: tasks.boardId })
    .from(tasks)
    .where(eq(tasks.venueBookingId, venueBookingId))
    .limit(1);

  if (!task) {
    log.info(
      { venueBookingId },
      "No task found for booking reconfirmation, skipping",
    );
    return;
  }

  // Find first column of the task's board
  const [firstColumn] = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, task.boardId))
    .orderBy(asc(boardColumns.position))
    .limit(1);

  if (!firstColumn) {
    log.warn(
      { venueBookingId, boardId: task.boardId },
      "No columns found for board, skipping reconfirmation",
    );
    return;
  }

  // Move task back to first column
  await db
    .update(tasks)
    .set({ columnId: firstColumn.id, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  // Reset all checklist items
  await db
    .update(taskChecklistItems)
    .set({ isChecked: false, checkedBy: null, checkedAt: null })
    .where(eq(taskChecklistItems.taskId, task.id));

  log.info(
    { taskId: task.id, venueBookingId },
    "Reconfirmation: task moved to first column, checklist reset",
  );
}

// ── reconcileTasksAfterBookingUpdate ────────────────────────────────────────

export async function reconcileTasksAfterBookingUpdate(
  venueBookingId: number,
  isNew: boolean,
  needsReconfirmation: boolean,
): Promise<void> {
  if (isNew) {
    // Query booking details
    const [booking] = await db
      .select({
        venueId: venueBookings.venueId,
        date: venueBookings.date,
      })
      .from(venueBookings)
      .where(eq(venueBookings.id, venueBookingId))
      .limit(1);

    if (!booking) return;

    // Get venue name
    const [venue] = await db
      .select({ name: venues.name })
      .from(venues)
      .where(eq(venues.id, booking.venueId))
      .limit(1);

    if (!venue) return;

    // Get linked matches with team names for descriptions
    const homeTeam = db
      .select({
        apiTeamPermanentId: teams.apiTeamPermanentId,
        name: teams.name,
      })
      .from(teams)
      .as("home_team");
    const guestTeam = db
      .select({
        apiTeamPermanentId: teams.apiTeamPermanentId,
        name: teams.name,
      })
      .from(teams)
      .as("guest_team");

    const linkedMatches = await db
      .select({
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
      .where(eq(venueBookingMatches.venueBookingId, venueBookingId));

    const matchDescriptions = linkedMatches.map(
      (m) => `${m.homeTeam} vs ${m.guestTeam}`,
    );

    await createBookingTask(
      venueBookingId,
      venue.name,
      booking.date,
      matchDescriptions,
    );
  }

  if (needsReconfirmation) {
    await handleBookingReconfirmation(venueBookingId);
  }
}
