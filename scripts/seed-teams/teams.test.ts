// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertConferenceListsDisjoint, parseTeamsCsv, toTeamRows, type CsvTeam } from "./teams";

const HEADER = "Team ID,Team Name,Conference,Image";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n");
}

function team(overrides: Partial<CsvTeam>): CsvTeam {
  return { id: 1, name: "Test U", conference: "SEC", imageUrl: null, ...overrides };
}

const overrideTeams = [
  team({ id: 87, name: "Notre Dame", conference: "FBS Independent" }),
  team({ id: 41, name: "UConn", conference: "FBS Independent" }),
];

describe("parseTeamsCsv", () => {
  it("parses rows, trimming fields and turning an empty image into null", () => {
    expect(parseTeamsCsv(csv("103, Boston College ,ACC,https://x/103.png", "2,Auburn,SEC,"))).toEqual([
      { id: 103, name: "Boston College", conference: "ACC", imageUrl: "https://x/103.png" },
      { id: 2, name: "Auburn", conference: "SEC", imageUrl: null },
    ]);
  });

  it("accepts LF line endings and skips blank lines", () => {
    expect(parseTeamsCsv(`${HEADER}\n\n2,Auburn,SEC,\n\n`)).toHaveLength(1);
  });

  it("rejects an unexpected header", () => {
    expect(() => parseTeamsCsv("ID,Name,Conference,Image\r\n2,Auburn,SEC,")).toThrow(/header/);
  });

  it.each([
    ["too few fields", "2,Auburn,SEC", /line 2: expected 4 fields, got 3/],
    ["too many fields", "2,Auburn,SEC,img,extra", /expected 4 fields, got 5/],
    ["a non-integer ID", "2a,Auburn,SEC,", /not an integer/],
    ["an empty name", "2,,SEC,", /team name is empty/],
    ["an empty conference", "2,Auburn,,", /conference is empty/],
    ["a quoted field", '2,"Auburn, AL",SEC,', /quoted fields are not supported/],
  ])("rejects %s", (_label, row, error) => {
    expect(() => parseTeamsCsv(csv(row))).toThrow(error);
  });

  it("rejects duplicate IDs and names", () => {
    expect(() => parseTeamsCsv(csv("2,Auburn,SEC,", "2,Alabama,SEC,"))).toThrow(/line 3: duplicate team ID 2/);
    expect(() => parseTeamsCsv(csv("2,Auburn,SEC,", "3,Auburn,SEC,"))).toThrow(/duplicate team name "Auburn"/);
  });
});

describe("toTeamRows", () => {
  it("maps power and non-power conferences, keeping the override teams' conference", () => {
    const rows = toTeamRows([
      ...overrideTeams,
      team({ id: 2, name: "Auburn", conference: "SEC", imageUrl: "https://x/2.png" }),
      team({ id: 204, name: "Oregon State", conference: "Pac-12" }),
    ]);

    expect(rows).toEqual([
      { id: 87, name: "Notre Dame", conference: "FBS Independent", is_power_conf: true, image_url: null },
      { id: 41, name: "UConn", conference: "FBS Independent", is_power_conf: false, image_url: null },
      { id: 2, name: "Auburn", conference: "SEC", is_power_conf: true, image_url: "https://x/2.png" },
      { id: 204, name: "Oregon State", conference: "Pac-12", is_power_conf: false, image_url: null },
    ]);
  });

  it("rejects a conference in neither list", () => {
    expect(() => toTeamRows([...overrideTeams, team({ conference: "Big East" })])).toThrow(
      /Unknown conference "Big East"/,
    );
  });

  it("rejects a conference listed as both power and non-power", () => {
    expect(() => assertConferenceListsDisjoint(["SEC", "Pac-12"], ["Pac-12", "MAC"])).toThrow(
      /both POWER_CONFERENCES and NON_POWER_CONFERENCES: Pac-12/,
    );
    expect(() => assertConferenceListsDisjoint(["SEC"], ["MAC"])).not.toThrow();
  });

  it("rejects an override that matches no team", () => {
    expect(() => toTeamRows([overrideTeams[0]])).toThrow(/POWER_OVERRIDES names "UConn"/);
  });
});

describe("the real CSV", () => {
  const rows = toTeamRows(
    parseTeamsCsv(readFileSync(path.join(process.cwd(), "Planning/d1_fbs_college_football_teams.csv"), "utf8")),
  );
  const byName = (name: string) => rows.find((row) => row.name === name);

  it("has every team, with 68 power teams", () => {
    expect(rows).toHaveLength(138);
    expect(rows.filter((row) => row.is_power_conf)).toHaveLength(68);
  });

  it("flags Notre Dame as power and UConn as non-power, both independents", () => {
    expect(byName("Notre Dame")).toMatchObject({ id: 87, conference: "FBS Independent", is_power_conf: true });
    expect(byName("UConn")).toMatchObject({ id: 41, conference: "FBS Independent", is_power_conf: false });
  });

  it("treats every Pac-12 team as non-power", () => {
    const pac12 = rows.filter((row) => row.conference === "Pac-12");
    expect(pac12.length).toBeGreaterThan(0);
    expect(pac12.every((row) => !row.is_power_conf)).toBe(true);
  });
});
