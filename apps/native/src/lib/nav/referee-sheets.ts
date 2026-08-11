import { router } from "expo-router";

/**
 * How a screen opens the referee-assignment sheet (issue #223).
 *
 * The sheet used to be `<AssignRefereeModal>`, a React Native `Modal` mounted
 * next to the Officiating list and toggled through a `visible` prop that
 * carried the whole game object with it. As a route it presents as a system
 * form sheet, gets the native header search field the ticket asks for, and —
 * like the board's sheets — takes scalars only.
 *
 * The href is written out at the call site rather than assembled from a
 * prefix: a route is only compile-checked where the literal is written (#217).
 */
export function openAssignRefereeSheet(apiMatchId: number, slot: 1 | 2): void {
  router.push({ pathname: "/referee-assign", params: { apiMatchId, slot } });
}
