import { TOTAL_SLOTS, teamInSlot, type PicksDraft } from "./edit-picks";
import type { Violation } from "./validation";

function slotsHolding(draft: PicksDraft, teamId: number): number[] {
  const slots: number[] = [];
  for (let slot = 1; slot <= TOTAL_SLOTS; slot++) {
    if (teamInSlot(draft, slot) === teamId) slots.push(slot);
  }
  return slots;
}

function slotText(slots: number[]): string {
  if (slots.length === 1) return `slot ${slots[0]}`;
  return `slots ${slots.slice(0, -1).join(", ")} and ${slots[slots.length - 1]}`;
}

/**
 * One display line per violation: its message, plus where the named team sits
 * in the draft so the user can find it, e.g. "... top 12 (slots 3 and 14).".
 * The champion rule names a team without a slot of its own, so it gets none,
 * and neither does a violation that names no team. Messages are not rewritten.
 */
export function describeViolations(violations: readonly Violation[], draft: PicksDraft): string[] {
  return violations.map((violation) => {
    if (violation.rule === "champion-not-in-top-12" || !violation.teamIds?.length) return violation.message;
    const slots = [...new Set(violation.teamIds)].flatMap((id) => slotsHolding(draft, id)).sort((a, b) => a - b);
    if (slots.length === 0) return violation.message;
    return `${violation.message.replace(/\.$/, "")} (${slotText(slots)}).`;
  });
}
