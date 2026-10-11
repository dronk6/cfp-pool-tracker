import { isEditWindowOpen, type Season } from "./edit-window";

const etFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * An instant as Eastern wall time, e.g. "Sun, Oct 11 at 12:00 AM ET". Built
 * from the formatter's parts so the output doesn't depend on the ICU version's
 * separators (newer ones put a narrow no-break space before AM/PM). The zone
 * is the IANA one, so daylight saving is handled; "ET" is a literal because
 * the same label covers EST and EDT.
 */
export function formatEt(iso: string): string {
  const part = new Map(etFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.get("weekday")}, ${part.get("month")} ${part.get("day")} at ${part.get("hour")}:${part.get("minute")} ${part.get("dayPeriod")} ET`;
}

/**
 * Why editing is unavailable at `at`, or null when the window is open. Pure:
 * the caller supplies the clock reading. Opens inclusive, closes exclusive
 * (via isEditWindowOpen, the same rule the server's PUT check uses).
 */
export function buildEditDisabledReason(season: Season | null, at: Date): string | null {
  if (!season) return "Editing isn't open yet for this season. Contact Tyler if that's wrong.";
  if (isEditWindowOpen(season, at)) return null;
  if (at.getTime() < Date.parse(season.editOpensAt)) return `Editing opens ${formatEt(season.editOpensAt)}.`;
  return `Editing closed ${formatEt(season.editClosesAt)}.`;
}

export function lookupFailedReason(): string {
  return "Couldn't check the edit window. Reload the page.";
}
