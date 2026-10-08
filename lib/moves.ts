/**
 * Counts the moves a user spent turning `initialTop12` into `newTop12`.
 * See "How moves are counted" in Planning/design-document.md.
 *
 * Precondition: both arrays hold 12 distinct team ids. Enforcing that shape is
 * the job of the validation rules, not this function.
 */
export function countMoves(initialTop12: readonly number[], newTop12: readonly number[]): number {
  const initialTeams = new Set(initialTop12);
  return newTop12.filter((teamId) => !initialTeams.has(teamId)).length;
}
