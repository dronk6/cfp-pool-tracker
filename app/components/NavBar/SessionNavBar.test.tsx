import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionNavBar from "./SessionNavBar";

const getSessionProfile = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth/profile", () => ({ getSessionProfile }));
const navBar = vi.hoisted(() => vi.fn((props: object) => (void props, null)));
vi.mock("./NavBar", () => ({ default: navBar }));
const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

// An async Server Component is just an async function; await it, then render its output.
async function renderSession() {
  render(await SessionNavBar());
  return navBar.mock.calls[0][0];
}

describe("SessionNavBar", () => {
  beforeEach(() => {
    getSessionProfile.mockReset();
    navBar.mockClear();
    unstable_rethrow.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes null when signed out", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: false });

    expect(await renderSession()).toEqual({ user: null });
  });

  it("passes only the name when signed in", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: true, profile: { name: "Ada", email: "ada@example.test" } });

    expect(await renderSession()).toEqual({ user: { name: "Ada" } });
  });

  it("passes a null name for a signed-in user with no profile", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: true, profile: null });

    expect(await renderSession()).toEqual({ user: { name: null } });
  });

  it("fails open to logged out, logging only the error name", async () => {
    getSessionProfile.mockRejectedValue(new TypeError("secret detail"));

    expect(await renderSession()).toEqual({ user: null });
    expect(unstable_rethrow).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("nav: session lookup failed", "TypeError");
  });

  it("rethrows Next.js control-flow errors instead of failing open", async () => {
    const bailout = new Error("bailout");
    getSessionProfile.mockRejectedValue(bailout);
    unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(SessionNavBar()).rejects.toBe(bailout);
    expect(console.error).not.toHaveBeenCalled();
  });
});
