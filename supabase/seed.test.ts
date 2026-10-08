// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seedSql = readFileSync(join(__dirname, "seed.sql"), "utf8");

// Finds the `(year, 'opens', 'closes')` tuple for a year in seed.sql.
function seasonWindow(year: number) {
  const tuple = new RegExp(`\\(\\s*${year}\\s*,\\s*'([^']+)'\\s*,\\s*'([^']+)'\\s*\\)`);
  const match = seedSql.match(tuple);
  if (!match) {
    throw new Error(`No seasons row for ${year} in seed.sql`);
  }
  return { opensAt: new Date(match[1]), closesAt: new Date(match[2]) };
}

// One row per season in seed.sql: [year, expected opens (UTC), expected closes (UTC)].
const seasons: [number, string, string][] = [
  // Opens midnight ET going into Oct 11, closes 12pm ET on Oct 17 (EDT, UTC-4).
  [2026, "2026-10-11T04:00:00.000Z", "2026-10-17T16:00:00.000Z"],
];

describe("seed.sql seasons rows", () => {
  it.each(seasons)("stores the %i window as the expected UTC instants", (year, opensUtc, closesUtc) => {
    const { opensAt, closesAt } = seasonWindow(year);

    expect(opensAt.toISOString()).toBe(opensUtc);
    expect(closesAt.toISOString()).toBe(closesUtc);
    expect(opensAt.getTime()).toBeLessThan(closesAt.getTime());
  });
});
