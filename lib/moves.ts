/**
 * Counts the moves a user spent turning `initialTop12` into `newTop12`.
 * See "How moves are counted" in Planning/design-document.md.
 *
 * Precondition: both arrays hold 12 distinct team ids. Enforcing that shape is
 * the job of the validation rules, not this function.
 */
export function countMoves(initialTop12: readonly number[], newTop12: readonly number[]): number {
  const initialSlotByTeam = new Map(initialTop12.map((teamId, slot) => [teamId, slot]));

  let replacements = 0;
  let reordered = false;
  newTop12.forEach((teamId, slot) => {
    const initialSlot = initialSlotByTeam.get(teamId);
    if (initialSlot === undefined) {
      replacements += 1;
    } else if (initialSlot !== slot) {
      reordered = true;
    }
  });

  // However many retained teams changed slots, reordering costs one move in total.
  return replacements + (reordered ? 1 : 0);
}
