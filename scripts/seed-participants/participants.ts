// Pure parsing, normalizing and team resolution for the participant seed. No
// I/O here, so it can be unit-tested without a database. Messages identify
// rows by number and name, never by email: the file is private and the output
// may end up in a terminal log.
import { normalizeEmail } from "../../lib/auth/input";

export const PLAYOFF_SIZE = 12;
export const TIEBREAKER_SIZE = 3;

export const HEADER: readonly string[] = [
  "Name",
  "Email",
  ...Array.from({ length: PLAYOFF_SIZE }, (_, i) => `Pick ${i + 1}`),
  ...Array.from({ length: TIEBREAKER_SIZE }, (_, i) => `First Out ${i + 1}`),
];

/** The subset of a `teams` row that resolution needs. */
export interface TeamRef {
  id: number;
  name: string;
  is_power_conf: boolean;
}

/** One data row of the file, with the email normalized and names untouched. */
export interface ParticipantRecord {
  /** The spreadsheet row number (the header is row 1); what error messages call "row". */
  row: number;
  name: string;
  email: string;
  playoffNames: string[];
  tiebreakerNames: string[];
}

/** A participant whose picks all resolved to team IDs. */
export interface ParticipantPlan {
  row: number;
  name: string;
  email: string;
  playoff: number[];
  tiebreakers: number[];
}

/**
 * Splits RFC-4180-style CSV into records of fields: quoted fields may contain
 * commas, newlines and "" escapes; CRLF and LF both end a record; a leading
 * BOM is dropped. Blank lines are kept as one empty field, so a record's
 * position always matches its spreadsheet row. Throws on text that was clearly
 * saved in the wrong encoding or has an unterminated quote.
 */
export function parseCsv(text: string): string[][] {
  if (text.includes("�")) {
    throw new Error(
      'The file contains the replacement character (U+FFFD), so it was not saved as UTF-8. Re-save it as "CSV UTF-8".',
    );
  }
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let recordHasContent = false;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    recordHasContent = false;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === '"' && field === "") {
      inQuotes = true;
      recordHasContent = true;
    } else if (char === ",") {
      recordHasContent = true;
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      endRecord();
    } else {
      recordHasContent = true;
      field += char;
    }
  }
  if (inQuotes) {
    throw new Error("The file ends inside a quoted field (unbalanced quote).");
  }
  if (recordHasContent) endRecord();
  return records;
}

export interface ParsedParticipants {
  records: ParticipantRecord[];
  errors: string[];
  warnings: string[];
}

/**
 * Turns the file's text into records. Throws if the header is wrong (nothing
 * after it can be trusted); every per-row problem is collected in `errors` so
 * the maintainer can fix them all in one pass.
 */
export function parseParticipants(text: string): ParsedParticipants {
  const [header, ...dataRows] = parseCsv(text);
  const actual = (header ?? []).map((cell) => cell.trim());
  if (actual.length !== HEADER.length || actual.some((cell, i) => cell !== HEADER[i])) {
    throw new Error(`Unexpected header. Expected exactly: ${HEADER.join(",")}`);
  }

  const records: ParticipantRecord[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const rowsByEmail = new Map<string, number>();
  const rowsByName = new Map<string, number>();

  dataRows.forEach((cells, index) => {
    const row = index + 2;
    if (cells.every((cell) => cell.trim() === "")) return; // Excel pads exports with empty ",,,," rows
    if (cells.length !== HEADER.length) {
      errors.push(`Row ${row}: expected ${HEADER.length} fields, got ${cells.length}.`);
      return;
    }
    const [name, rawEmail, ...teamNames] = cells.map((cell) => cell.trim());
    const label = `Row ${row}${name ? ` (${name})` : ""}`;

    let rowOk = true;
    if (!name) {
      errors.push(`Row ${row}: name is empty.`);
      rowOk = false;
    }
    const email = normalizeEmail(rawEmail);
    if (!email) {
      errors.push(`${label}: email is missing or not a valid address.`);
      rowOk = false;
    } else if (rowsByEmail.has(email)) {
      errors.push(`${label}: same email as row ${rowsByEmail.get(email)}.`);
      rowOk = false;
    } else {
      rowsByEmail.set(email, row);
    }
    if (name) {
      const earlier = rowsByName.get(name.toLowerCase());
      if (earlier === undefined) rowsByName.set(name.toLowerCase(), row);
      else warnings.push(`${label}: same name as row ${earlier} (different people? check the emails).`);
    }
    if (!rowOk || !email) return;

    records.push({
      row,
      name,
      email,
      playoffNames: teamNames.slice(0, PLAYOFF_SIZE),
      tiebreakerNames: teamNames.slice(PLAYOFF_SIZE),
    });
  });

  return { records, errors, warnings };
}

/** Quotes a typed value for an error message, unless it looks like an email (a shifted column must not leak one). */
function displayName(typed: string): string {
  return typed.includes("@") ? "(a value that looks like an email)" : `"${typed}"`;
}

type Resolution = { id: number } | { error: string };

/**
 * Matches a typed name to a team by trimmed, case-insensitive exact match.
 * No aliases: an unknown name gets close suggestions instead of a guess.
 */
export function resolveTeam(typed: string, teams: readonly TeamRef[]): Resolution {
  const key = typed.trim().toLowerCase();
  if (!key) return { error: "is blank" };
  const matches = teams.filter((team) => team.name.trim().toLowerCase() === key);
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length > 1) {
    return { error: `is ambiguous (matches ${matches.length} teams: ${matches.map((t) => t.name).join(", ")})` };
  }
  const suggestions = suggestTeams(key, teams);
  const hint = suggestions.length ? `; did you mean ${suggestions.map((name) => `"${name}"`).join(", ")}?` : "";
  return { error: `is not a known team${hint}` };
}

function suggestTeams(key: string, teams: readonly TeamRef[]): string[] {
  const limit = Math.min(3, Math.ceil(key.length / 3));
  return teams
    .map((team) => {
      const name = team.name.toLowerCase();
      const related = name.includes(key) || key.includes(name);
      return { name: team.name, distance: related ? 0 : editDistance(key, name) };
    })
    .filter((candidate) => candidate.distance <= limit)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((candidate) => candidate.name);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

export interface ResolvedParticipants {
  plans: ParticipantPlan[];
  errors: string[];
  warnings: string[];
}

/**
 * Resolves every record's team names to IDs. Shape problems (an unknown or
 * ambiguous team, a team picked twice across the 15 slots) are errors. The G6
 * rule is only a warning: the pool predates this app and the maintainer
 * decides what to do about an entry that breaks it.
 */
export function resolveParticipants(records: readonly ParticipantRecord[], teams: readonly TeamRef[]): ResolvedParticipants {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const plans: ParticipantPlan[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const record of records) {
    const label = `Row ${record.row} (${record.name})`;
    const slots = [
      ...record.playoffNames.map((name, i) => ({ column: `Pick ${i + 1}`, name })),
      ...record.tiebreakerNames.map((name, i) => ({ column: `First Out ${i + 1}`, name })),
    ];
    const ids: number[] = [];
    let ok = true;

    for (const slot of slots) {
      const result = resolveTeam(slot.name, teams);
      if ("error" in result) {
        errors.push(`${label}: ${slot.column} ${displayName(slot.name)} ${result.error}${result.error.endsWith("?") ? "" : "."}`);
        ok = false;
      } else {
        ids.push(result.id);
      }
    }
    if (!ok) continue;

    const seen = new Set<number>();
    for (const [i, id] of ids.entries()) {
      if (seen.has(id)) {
        errors.push(`${label}: ${slots[i].column} "${teamsById.get(id)?.name}" is picked more than once across the 15 slots.`);
        ok = false;
      }
      seen.add(id);
    }
    if (!ok) continue;

    const playoff = ids.slice(0, PLAYOFF_SIZE);
    const tiebreakers = ids.slice(PLAYOFF_SIZE);
    if (playoff.every((id) => teamsById.get(id)?.is_power_conf)) {
      warnings.push(`${label}: no Group of Six team in the top 12 (breaks the G6 rule).`);
    }
    plans.push({ row: record.row, name: record.name, email: record.email, playoff, tiebreakers });
  }

  return { plans, errors, warnings };
}
