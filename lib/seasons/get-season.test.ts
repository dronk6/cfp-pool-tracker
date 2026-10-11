// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("../supabase/server", () => ({ createSupabaseServerClient }));

import { getSeason } from "./get-season";

const row = { year: 2026, edit_opens_at: "2026-10-11T04:00:00+00:00", edit_closes_at: "2026-10-17T16:00:00+00:00" };

describe("getSeason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { eq, maybeSingle };
    eq.mockReturnValue(chain);
    select.mockReturnValue(chain);
    from.mockReturnValue({ select });
    createSupabaseServerClient.mockResolvedValue({ from });
  });

  it("reads the year's window in camelCase", async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });

    expect(await getSeason(2026)).toEqual({
      year: 2026,
      editOpensAt: row.edit_opens_at,
      editClosesAt: row.edit_closes_at,
    });
    expect(from).toHaveBeenCalledWith("seasons");
    expect(select).toHaveBeenCalledWith("year, edit_opens_at, edit_closes_at");
    expect(eq).toHaveBeenCalledWith("year", 2026);
  });

  it("is null when the year has no season", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getSeason(2031)).toBeNull();
  });

  it("throws when the lookup fails", async () => {
    const failure = { code: "XX000", message: "boom" };
    maybeSingle.mockResolvedValue({ data: null, error: failure });

    await expect(getSeason(2026)).rejects.toBe(failure);
  });

  it("uses the client it is given instead of creating one", async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });

    await getSeason(2026, { from } as never);

    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
