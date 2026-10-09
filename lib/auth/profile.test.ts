// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn(() => ({ maybeSingle })));
const select = vi.hoisted(() => vi.fn(() => ({ eq })));
const from = vi.hoisted(() => vi.fn(() => ({ select })));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));

import { getSessionProfile } from "./profile";

describe("getSessionProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is signed out, without touching the database, when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getSessionProfile()).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("is signed out when getUser reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    expect(await getSessionProfile()).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("reads only the session user's name and email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { name: "Ada", email: "ada@example.test" }, error: null });

    expect(await getSessionProfile()).toEqual({
      signedIn: true,
      profile: { name: "Ada", email: "ada@example.test" },
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("name, email");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("returns a null profile for a signed-in user with no row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getSessionProfile()).toEqual({ signedIn: true, profile: null });
  });

  it("throws when the profile lookup fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const dbError = new Error("db down");
    maybeSingle.mockResolvedValue({ data: null, error: dbError });

    await expect(getSessionProfile()).rejects.toBe(dbError);
  });
});
