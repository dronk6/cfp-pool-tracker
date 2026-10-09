// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HEADER,
  parseCsv,
  parseParticipants,
  resolveParticipants,
  resolveTeam,
  type ParticipantRecord,
  type TeamRef,
} from "./participants";

const HEADER_LINE = HEADER.join(",");

// 15 power teams plus one G6 team, ids 1-16.
const POWER_NAMES = Array.from({ length: 15 }, (_, i) => `Power ${i + 1}`);
const teams: TeamRef[] = [
  ...POWER_NAMES.map((name, i) => ({ id: i + 1, name, is_power_conf: true })),
  { id: 16, name: "Tulane", is_power_conf: false },
  { id: 17, name: "Ohio State", is_power_conf: true },
];

const defaultTeamNames = [...POWER_NAMES.slice(0, 11), "Tulane", ...POWER_NAMES.slice(11, 14)];

function file(...rows: string[]): string {
  return [HEADER_LINE, ...rows].join("\r\n");
}

function record(overrides: Partial<ParticipantRecord> = {}): ParticipantRecord {
  return {
    row: 1,
    name: "Alex",
    email: "alex@example.test",
    playoffNames: defaultTeamNames.slice(0, 12),
    tiebreakerNames: defaultTeamNames.slice(12),
    ...overrides,
  };
}

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    expect(parseCsv('a,"b, c","say ""hi""","line1\nline2"\r\nd,e,f,g')).toEqual([
      ["a", "b, c", 'say "hi"', "line1\nline2"],
      ["d", "e", "f", "g"],
    ]);
  });

  it("accepts a BOM, LF endings and a missing final newline, keeping blank lines as empty records", () => {
    expect(parseCsv("\uFEFFa,b\n\nc,d")).toEqual([["a", "b"], [""], ["c", "d"]]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("rejects text containing the replacement character", () => {
    expect(() => parseCsv("a,b\uFFFD")).toThrow(/CSV UTF-8/);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/quote/);
  });
});

describe("parseParticipants", () => {
  const allTeams = defaultTeamNames.join(",");

  it("normalizes emails and splits the 15 team columns", () => {
    const { records, errors } = parseParticipants(file(`"Smith, Bob",  Bob@Example.TEST ,${allTeams}`));

    expect(errors).toEqual([]);
    expect(records).toEqual([
      {
        row: 2,
        name: "Smith, Bob",
        email: "bob@example.test",
        playoffNames: defaultTeamNames.slice(0, 12),
        tiebreakerNames: defaultTeamNames.slice(12),
      },
    ]);
  });

  it("parses the committed template", () => {
    const { records, errors } = parseParticipants(readFileSync("scripts/seed-participants/participants.example.csv", "utf8"));

    expect(errors).toEqual([]);
    expect(records.map((r) => r.name)).toEqual(["Alex Example", "Example, Bob"]);
  });

  it("rejects a wrong header", () => {
    expect(() => parseParticipants(file().replace("Pick 12", "Pick 13"))).toThrow(/header/);
  });

  it("collects every row error instead of stopping at the first", () => {
    const { records, errors } = parseParticipants(
      file(
        `Alex,not-an-email,${allTeams}`,
        `,b@example.test,${allTeams}`,
        "Short,s@example.test,A,B",
        `Ok,ok@example.test,${allTeams}`,
      ),
    );

    expect(records.map((r) => r.row)).toEqual([5]);
    expect(errors).toEqual([
      "Row 2 (Alex): email is missing or not a valid address.",
      "Row 3: name is empty.",
      "Row 4: expected 17 fields, got 4.",
    ]);
  });

  it("rejects duplicate emails (case-insensitively) without printing them", () => {
    const { errors } = parseParticipants(file(`A,x@example.test,${allTeams}`, `B,X@Example.test,${allTeams}`));

    expect(errors).toEqual(["Row 3 (B): same email as row 2."]);
  });

  it("warns, but does not fail, on duplicate names", () => {
    const { records, errors, warnings } = parseParticipants(
      file(`Sam,a@example.test,${allTeams}`, `sam,b@example.test,${allTeams}`),
    );

    expect(errors).toEqual([]);
    expect(records).toHaveLength(2);
    expect(warnings).toEqual(["Row 3 (sam): same name as row 2 (different people? check the emails)."]);
  });

  it("skips all-empty rows (Excel padding) without shifting later row numbers", () => {
    const padding = ",".repeat(16);
    const { records, errors } = parseParticipants(
      [HEADER_LINE, padding, "", `Ok,ok@example.test,${allTeams}`, padding, ""].join("\r\n"),
    );

    expect(errors).toEqual([]);
    expect(records.map((r) => r.row)).toEqual([4]);
  });
});

describe("resolveTeam", () => {
  it("matches case-insensitively after trimming", () => {
    expect(resolveTeam("  ohio STATE ", teams)).toEqual({ id: 17 });
  });

  it("reports an ambiguous name", () => {
    const duplicated = [...teams, { id: 99, name: "OHIO state", is_power_conf: true }];

    expect(resolveTeam("Ohio State", duplicated)).toEqual({ error: expect.stringMatching(/ambiguous/) });
  });

  it("does not echo a value that looks like an email", () => {
    const shifted = record({ playoffNames: ["leak@example.test", ...defaultTeamNames.slice(1, 12)] });

    const { errors } = resolveParticipants([shifted], teams);

    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("leak@");
    expect(errors[0]).toContain("looks like an email");
  });

  it("suggests close names for an unknown team", () => {
    expect(resolveTeam("Ohio St.", teams)).toEqual({ error: expect.stringContaining('"Ohio State"') });
    expect(resolveTeam("Oihoo Stat", teams)).toEqual({ error: expect.stringContaining('"Ohio State"') });
  });

  it("reports a blank name and an unknown name with no suggestion", () => {
    expect(resolveTeam(" ", teams)).toEqual({ error: "is blank" });
    expect(resolveTeam("Zzzzzzzzzz", teams)).toEqual({ error: "is not a known team" });
  });
});

describe("resolveParticipants", () => {
  it("resolves names to ids in order", () => {
    const { plans, errors, warnings } = resolveParticipants([record()], teams);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(plans).toEqual([
      {
        row: 1,
        name: "Alex",
        email: "alex@example.test",
        playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16],
        tiebreakers: [12, 13, 14],
      },
    ]);
  });

  it("lists every unknown team, with row, column and suggestion", () => {
    const bad = record({ row: 3, name: "Pat", playoffNames: ["Tulane ", "Ohio St.", ...defaultTeamNames.slice(2, 12)] });
    const { plans, errors } = resolveParticipants([bad, record({ row: 4, tiebreakerNames: ["Power 1", "x", "y"] })], teams);

    expect(plans).toEqual([]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/^Row 3 \(Pat\): Pick 2 "Ohio St\." is not a known team; did you mean "Ohio State"\?$/);
    expect(errors[1]).toMatch(/Row 4 \(Alex\): First Out 2 "x" is not a known team\.$/);
  });

  it("rejects a team picked twice across the 15 slots", () => {
    const dup = record({ tiebreakerNames: ["Power 12", "Power 13", "Power 1"] });
    const { plans, errors } = resolveParticipants([dup], teams);

    expect(plans).toEqual([]);
    expect(errors).toEqual(['Row 1 (Alex): First Out 3 "Power 1" is picked more than once across the 15 slots.']);
  });

  it("only warns when the top 12 has no Group of Six team", () => {
    const allPower = record({ playoffNames: POWER_NAMES.slice(0, 12), tiebreakerNames: POWER_NAMES.slice(12) });
    const { plans, errors, warnings } = resolveParticipants([allPower], teams);

    expect(errors).toEqual([]);
    expect(plans).toHaveLength(1);
    expect(warnings).toEqual(["Row 1 (Alex): no Group of Six team in the top 12 (breaks the G6 rule)."]);
  });
});
