import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyPicksSection from "./MyPicksSection";

const loadMyPicks = vi.hoisted(() => vi.fn());
vi.mock("./load-my-picks", () => ({ loadMyPicks }));

// An async Server Component is just an async function; await it, then render its output.
async function renderSection(year = 2026) {
  render(await MyPicksSection({ year }));
}

describe("MyPicksSection", () => {
  beforeEach(() => loadMyPicks.mockReset());

  it("loads the year it is given and renders the picks", async () => {
    loadMyPicks.mockResolvedValue({
      kind: "ok",
      editDisabledReason: null,
      view: { playoff: [{ rank: 1, teamId: 1, name: "Ohio State", imageUrl: null }], tiebreakers: [], champion: null },
    });

    await renderSection(2027);

    expect(loadMyPicks).toHaveBeenCalledWith(2027);
    expect(screen.getByText("Ohio State")).toBeInTheDocument();
  });

  it("tells a signed-out visitor to log in, with a link to /login", async () => {
    loadMyPicks.mockResolvedValue({ kind: "signed-out" });

    await renderSection();

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("names the year when there are no picks", async () => {
    loadMyPicks.mockResolvedValue({ kind: "no-submission" });

    await renderSection(2031);

    expect(screen.getByText(/2031/)).toBeInTheDocument();
  });

  it("shows a generic alert on error", async () => {
    loadMyPicks.mockResolvedValue({ kind: "error" });

    await renderSection();

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
