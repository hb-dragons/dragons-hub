import { describe, expect, it } from "vitest";
import { HALL_TIME_COVERAGES } from "../hall-times";
import { coverageFor } from "./coverage";

const open = (startTime: string, endTime: string) =>
  ({ kind: "open", startTime, endTime, note: null }) as const;
const closed = { kind: "closed", startTime: null, endTime: null, note: "Ferien" } as const;
const window = { start: "13:00:00", end: "17:30:00" };

describe("coverageFor", () => {
  it.each([
    ["inside the hall time", open("10:00", "20:00"), "covered", 0, 0],
    ["exactly the hall time", open("13:00", "17:30"), "covered", 0, 0],
    ["starts before the hall time", open("14:00", "20:00"), "partial", 60, 0],
    ["ends after the hall time", open("10:00", "16:00"), "partial", 0, 90],
    ["sticks out both ends", open("14:00", "16:00"), "partial", 60, 90],
    ["entirely before the hall time", open("18:00", "22:00"), "uncovered", 0, 0],
    ["entirely after the hall time", open("08:00", "12:00"), "uncovered", 0, 0],
    ["closed day", closed, "closed", 0, 0],
    ["no hall time", null, "none", 0, 0],
  ] as const)("%s", (_label, hallTime, status, before, after) => {
    expect(coverageFor(window, hallTime)).toEqual({
      status,
      gapBeforeMinutes: before,
      gapAfterMinutes: after,
    });
  });

  it("accepts HH:mm windows as well as HH:mm:ss", () => {
    expect(coverageFor({ start: "13:00", end: "17:30" }, open("13:00", "17:30")).status).toBe(
      "covered",
    );
  });
});

describe("HALL_TIME_COVERAGES", () => {
  it("lists the five coverages in order", () => {
    expect([...HALL_TIME_COVERAGES]).toEqual(["covered", "partial", "uncovered", "closed", "none"]);
  });
});
