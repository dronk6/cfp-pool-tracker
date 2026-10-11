import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      initialTop12: [1],
      view: { playoff: [{ rank: 1, teamId: 1, name: "Ohio State", imageUrl: null }], tiebreakers: [], champion: null },
      teams: [{ id: 1, name: "Ohio State", imageUrl: null, conference: "Big Ten", isPowerConf: true }],
    });

    await renderSection(2027);

    expect(loadMyPicks).toHaveBeenCalledWith(2027);
    expect(screen.getByText("Ohio State")).toBeInTheDocument();
  });

  it("offers an Edit button that opens the editor with the loaded teams", async () => {
    loadMyPicks.mockResolvedValue({
      kind: "ok",
      editDisabledReason: null,
      initialTop12: [1],
      view: { playoff: [{ rank: 1, teamId: 1, name: "Ohio State", imageUrl: null }], tiebreakers: [], champion: null },
      teams: [
        { id: 1, name: "Ohio State", imageUrl: null, conference: "Big Ten", isPowerConf: true },
        { id: 2, name: "Oregon", imageUrl: null, conference: "Big Ten", isPowerConf: true },
      ],
    });
    await renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("combobox", { name: "Slot 1" })).toHaveValue("1");
    expect(within(screen.getByRole("combobox", { name: "Slot 1" })).getByRole("option", { name: "Oregon" })).toBeInTheDocument();
  });

  it("disables the Edit button with the loader's reason, which cannot open the editor", async () => {
    loadMyPicks.mockResolvedValue({
      kind: "ok",
      editDisabledReason: "Editing opens Sun, Oct 11 at 12:00 AM ET.",
      initialTop12: [1],
      view: { playoff: [{ rank: 1, teamId: 1, name: "Ohio State", imageUrl: null }], tiebreakers: [], champion: null },
      teams: [{ id: 1, name: "Ohio State", imageUrl: null }],
    });
    await renderSection();

    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit).toHaveAttribute("aria-disabled", "true");
    expect(edit).toHaveAccessibleDescription("Editing opens Sun, Oct 11 at 12:00 AM ET.");
    await userEvent.click(edit);

    expect(screen.queryByRole("combobox", { name: "Slot 1" })).not.toBeInTheDocument();
  });

  it("leaves the Edit button enabled when the loader reports no reason", async () => {
    loadMyPicks.mockResolvedValue({
      kind: "ok",
      editDisabledReason: null,
      initialTop12: [1],
      view: { playoff: [{ rank: 1, teamId: 1, name: "Ohio State", imageUrl: null }], tiebreakers: [], champion: null },
      teams: [{ id: 1, name: "Ohio State", imageUrl: null }],
    });
    await renderSection();

    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit).not.toHaveAttribute("aria-disabled");
    await userEvent.click(edit);

    expect(screen.getByRole("combobox", { name: "Slot 1" })).toBeInTheDocument();
  });

  it("shows no Edit button when there is nothing to edit", async () => {
    loadMyPicks.mockResolvedValue({ kind: "no-submission" });
    await renderSection();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
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
