export type Season = {
  year: number;
  editOpensAt: string;
  editClosesAt: string;
};

/**
 * Whether picks may be edited at `at`. The window is half-open: the opening
 * instant is inside it and the closing instant is already outside, so
 * back-to-back windows never overlap.
 */
export function isEditWindowOpen(season: Season, at: Date): boolean {
  const t = at.getTime();
  return Date.parse(season.editOpensAt) <= t && t < Date.parse(season.editClosesAt);
}
