import type { HallTimeInput } from "../hall-times";
import { timeToMinutes } from "./coverage";

/**
 * Parser for the city's "Anlage T zum Mietantrag" sheet.
 *
 * The input is the cell grid of the first worksheet as `sheet_to_json(ws,
 * { header: 1, raw: false, defval: null })` yields it, so this module never
 * touches the spreadsheet library: the web dialog reads the file, this
 * function reads the grid, and the tests feed it fixtures cut from real
 * sheets.
 *
 * The sheet lists every Saturday and Sunday of a season in two side-by-side
 * blocks, each `Tag | Datum | von | - | bis`. A day is one of:
 * - `von` and `bis` filled → the club holds the hall in that window (`open`)
 * - text other than `-` written across the separator column and no times →
 *   the city's closure note for that day (`closed`); a note that runs over consecutive rows
 *   ("Sommerferien**" over "02.07.-12.08.**") is joined onto each of them
 * - `-` or blank → the club asked for nothing; no row
 */

export interface AnlageTParseResult {
  hallName: string | null;
  /** YYYY-MM-DD; the "Datum dieser Aktualisierung" cell */
  updatedOn: string | null;
  rows: HallTimeInput[];
  warnings: string[];
}

type Cell = unknown;
type Grid = readonly (readonly Cell[])[];

interface Block {
  tag: number;
  date: number;
  from: number;
  dash: number;
  to: number;
}

const DAY_TAG = /^(Sa|So)\*?$/;
const DASH = /^-+$/;

function text(cell: Cell): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  return s === "" ? null : s;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Date cell → YYYY-MM-DD. Accepts Date objects, ISO, m/d/yy and d.m.yyyy. */
function parseSheetDate(cell: Cell): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
  }
  const s = text(cell);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (us) return `${fullYear(us[3]!)}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (de) return `${fullYear(de[3]!)}-${pad(Number(de[2]))}-${pad(Number(de[1]))}`;
  return null;
}

function fullYear(y: string): string {
  return y.length === 4 ? y : `20${y}`;
}

/** Time cell → HH:mm. Accepts "HH:mm", "HH:mm:ss" and the sheet's numeric HHmm. */
function parseSheetTime(cell: Cell): string | null {
  if (typeof cell === "number" && Number.isInteger(cell) && cell >= 0 && cell <= 2359) {
    const h = Math.floor(cell / 100);
    const m = cell % 100;
    return m < 60 ? `${pad(h)}:${pad(m)}` : null;
  }
  const s = text(cell);
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function stripStars(s: string): string {
  return s.replace(/\*+/g, "").trim();
}

function findLabelValue(grid: Grid, label: string): Cell {
  for (const row of grid) {
    const i = row.findIndex((c) => typeof c === "string" && c.trim() === label);
    if (i === -1) continue;
    for (let j = i + 1; j < row.length; j++) {
      if (row[j] != null && String(row[j]).trim() !== "") return row[j];
    }
  }
  return null;
}

function findBlocks(grid: Grid): { headerRow: number; blocks: Block[] } {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    const blocks: Block[] = [];
    row.forEach((c, i) => {
      if (typeof c === "string" && c.trim() === "Tag") {
        blocks.push({ tag: i, date: i + 1, from: i + 2, dash: i + 3, to: i + 4 });
      }
    });
    if (blocks.length > 0) return { headerRow: r, blocks };
  }
  throw new Error('Anlage T: no header row with a "Tag" column found');
}

interface RawDay {
  rowNo: number;
  date: string | null;
  dateCell: Cell;
  from: Cell;
  /** The `-` separator cell; a closure note is written across it instead. */
  dash: Cell;
  to: Cell;
}

function collectBlock(grid: Grid, headerRow: number, block: Block): RawDay[] {
  const days: RawDay[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r]!;
    const tag = text(row[block.tag]);
    if (!tag || !DAY_TAG.test(tag)) break;
    days.push({
      rowNo: r + 1,
      date: parseSheetDate(row[block.date]),
      dateCell: row[block.date],
      from: row[block.from],
      dash: row[block.dash],
      to: row[block.to],
    });
  }
  return days;
}

export function parseAnlageT(grid: Grid): AnlageTParseResult {
  const { headerRow, blocks } = findBlocks(grid);
  const hallNameCell = findLabelValue(grid, "Sporthalle:");
  const hallName = text(hallNameCell);
  const updatedOn = parseSheetDate(findLabelValue(grid, "Datum dieser Aktualisierung:"));

  const rows: HallTimeInput[] = [];
  const warnings: string[] = [];

  for (const block of blocks) {
    const days = collectBlock(grid, headerRow, block);
    // A closure note may run over several rows; collect the run first so
    // every row of it carries the whole note.
    let run: { indexes: number[]; parts: string[] } | null = null;
    // Blank rows (no dash, no times) appear only inside the holiday blocks,
    // where the merged note cell spans them; a dash is the template's default
    // for an ordinary weekend. So a blank row next to a note run is part of
    // that closure, before the run as well as after it.
    let pendingBlanks: number[] = [];
    const flushRun = () => {
      if (run) {
        const note = run.parts.join(" ");
        for (const i of run.indexes) {
          const day = days[i]!;
          rows.push({ date: day.date!, kind: "closed", startTime: null, endTime: null, note });
        }
        run = null;
      }
      pendingBlanks = [];
    };

    days.forEach((day, i) => {
      if (!day.date) {
        flushRun();
        warnings.push(`Row ${day.rowNo}: unreadable date ${JSON.stringify(text(day.dateCell) ?? "")}`);
        return;
      }
      const start = parseSheetTime(day.from);
      const end = parseSheetTime(day.to);
      if (start && end) {
        flushRun();
        if (timeToMinutes(end) <= timeToMinutes(start)) {
          warnings.push(`${day.date}: end time is not after start time`);
          return;
        }
        rows.push({ date: day.date, kind: "open", startTime: start, endTime: end, note: null });
        return;
      }
      if (start || end) {
        flushRun();
        warnings.push(`${day.date}: only one end of the time window is filled`);
        return;
      }
      const noteText = text(day.dash);
      if (noteText && !DASH.test(noteText)) {
        const part = stripStars(noteText);
        if (run) {
          run.indexes.push(i);
          run.parts.push(part);
        } else {
          run = { indexes: [...pendingBlanks, i], parts: [part] };
          pendingBlanks = [];
        }
        return;
      }
      if (noteText == null) {
        if (run) run.indexes.push(i);
        else pendingBlanks.push(i);
        return;
      }
      // A dash: the club asked for nothing that day.
      flushRun();
    });
    flushRun();
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { hallName, updatedOn, rows, warnings };
}
