// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const secondOrder = vi.hoisted(() => vi.fn());
const firstOrder = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock("./supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));

import { getTeams } from "./teams";

const rows = [
  { id: 1, name: "Alabama", conference: "SEC", is_power_conf: true, image_url: "https://example.test/1.png" },
  { id: 41, name: "UConn", conference: "FBS Independent", is_power_conf: false, image_url: null },
];

describe("getTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firstOrder.mockReturnValue({ order: secondOrder });
    select.mockReturnValue({ order: firstOrder });
    from.mockReturnValue({ select });
  });

  it("is signed out, without touching the database, when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getTeams()).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("is signed out when getUser reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    expect(await getTeams()).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("selects the public columns ordered by name, then id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    secondOrder.mockResolvedValue({ data: rows, error: null });

    expect(await getTeams()).toEqual({ signedIn: true, teams: rows });
    expect(from).toHaveBeenCalledWith("teams");
    expect(select).toHaveBeenCalledWith("id,name,conference,is_power_conf,image_url");
    expect(firstOrder).toHaveBeenCalledWith("name");
    expect(secondOrder).toHaveBeenCalledWith("id");
  });

  it("returns an empty list for an empty table", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    secondOrder.mockResolvedValue({ data: [], error: null });

    expect(await getTeams()).toEqual({ signedIn: true, teams: [] });
  });

  it("throws when the lookup fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const dbError = new Error("db down");
    secondOrder.mockResolvedValue({ data: null, error: dbError });

    await expect(getTeams()).rejects.toBe(dbError);
  });
});
