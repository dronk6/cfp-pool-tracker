// Pure CSV parsing and row mapping for the `teams` seed. No I/O here, so it
// can be unit-tested without a database.

/*
 * Power-conference rules: the single place that decides `is_power_conf`.
 *
 * The power conferences are ACC, Big Ten, Big 12 and SEC. Realignment broke
 * up the old Pac-12; the league that plays as the Pac-12 in 2026 was rebuilt
 * around its two remaining members plus former Mountain West schools, and is
 * a non-power (G6) conference. Its teams count toward the G6 auto-bid.
 *
 * "FBS Independent" is not a real conference, so its members are decided per
 * team in POWER_OVERRIDES: Notre Dame is at-large eligible and treated as
 * power-equivalent, while UConn is ordinary G6-tier. Both keep
 * `conference = 'FBS Independent'`.
 *
 * Every conference in the CSV must appear in exactly one of the two lists, so
 * a renamed or new conference fails the seed instead of being silently
 * classified. Each override must match a team in the CSV, so a renamed team
 * can't silently lose its override.
 */
export const POWER_CONFERENCES: readonly string[] = ["ACC", "Big Ten", "Big 12", "SEC"];

export const NON_POWER_CONFERENCES: readonly string[] = [
  "American Athletic",
  "Conference USA",
  "MAC",
  "Mountain West",
  "Pac-12",
  "Sun Belt",
  "FBS Independent",
];

export const POWER_OVERRIDES: Readonly<Record<string, boolean>> = {
  "Notre Dame": true,
  UConn: false,
};

/** A row of the CSV, after validation. */
export interface CsvTeam {
  id: number;
  name: string;
  conference: string;
  imageUrl: string | null;
}

/** A row of `public.teams`, ready to upsert. */
export interface TeamRow {
  id: number;
  name: string;
  conference: string;
  is_power_conf: boolean;
  image_url: string | null;
}

const EXPECTED_HEADER = "Team ID,Team Name,Conference,Image";

/**
 * Parses the ESPN teams CSV. Deliberately strict: quoted fields are not
 * supported, and any malformed or duplicate row throws with its line number.
 */
export function parseTeamsCsv(csv: string): CsvTeam[] {
  const lines = csv.split(/\r?\n/);
  const header = lines[0]?.replace(/^﻿/, "").trim();
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Expected CSV header "${EXPECTED_HEADER}", got "${header ?? ""}"`);
  }

  const teams: CsvTeam[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();

  lines.slice(1).forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 2;
    const fail = (reason: string): never => {
      throw new Error(`CSV line ${lineNumber}: ${reason}: ${line}`);
    };

    if (line.includes('"')) fail("quoted fields are not supported");
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length !== 4) fail(`expected 4 fields, got ${fields.length}`);
    const [rawId, name, conference, image] = fields;

    if (!/^\d+$/.test(rawId)) fail(`team ID "${rawId}" is not an integer`);
    const id = Number(rawId);
    if (name === "") fail("team name is empty");
    if (conference === "") fail("conference is empty");
    if (seenIds.has(id)) fail(`duplicate team ID ${id}`);
    if (seenNames.has(name)) fail(`duplicate team name "${name}"`);

    seenIds.add(id);
    seenNames.add(name);
    teams.push({ id, name, conference, imageUrl: image === "" ? null : image });
  });

  return teams;
}

/** Maps parsed CSV teams to `teams` rows, applying the power-conference rules above. */
export function toTeamRows(teams: CsvTeam[]): TeamRow[] {
  assertConferenceListsDisjoint(POWER_CONFERENCES, NON_POWER_CONFERENCES);
  const names = new Set(teams.map((team) => team.name));
  for (const overrideName of Object.keys(POWER_OVERRIDES)) {
    if (!names.has(overrideName)) {
      throw new Error(`POWER_OVERRIDES names "${overrideName}", which is not in the CSV`);
    }
  }

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    conference: team.conference,
    is_power_conf: isPowerTeam(team),
    image_url: team.imageUrl,
  }));
}

/** Throws if a conference is listed as both power and non-power. Exported for testing. */
export function assertConferenceListsDisjoint(power: readonly string[], nonPower: readonly string[]): void {
  const both = power.filter((conference) => nonPower.includes(conference));
  if (both.length > 0) {
    throw new Error(`Listed in both POWER_CONFERENCES and NON_POWER_CONFERENCES: ${both.join(", ")}`);
  }
}

function isPowerTeam(team: CsvTeam): boolean {
  if (!POWER_CONFERENCES.includes(team.conference) && !NON_POWER_CONFERENCES.includes(team.conference)) {
    throw new Error(
      `Unknown conference "${team.conference}" for ${team.name}; add it to POWER_CONFERENCES or NON_POWER_CONFERENCES`,
    );
  }
  return Object.hasOwn(POWER_OVERRIDES, team.name)
    ? POWER_OVERRIDES[team.name]
    : POWER_CONFERENCES.includes(team.conference);
}
