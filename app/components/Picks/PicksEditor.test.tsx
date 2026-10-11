import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PicksDraft } from "../../../lib/edit-picks";
import type { PicksView, TeamOption } from "../../../lib/picks-view";
import type { SaveOutcome } from "../../../lib/save-picks";
import PicksEditor from "./PicksEditor";

// Alphabetical, like the database order: "Team 01" ... "Team 20".
const teams: TeamOption[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: `Team ${String(i + 1).padStart(2, "0")}`,
  imageUrl: null,
  conference: "X",
  isPowerConf: true,
}));

const pick = (rank: number, teamId = rank) => ({ rank, teamId, name: `Team ${teamId}`, imageUrl: null });

function view(overrides: Partial<PicksView> = {}): PicksView {
  return {
    playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1)),
    tiebreakers: [pick(13), pick(14), pick(15)],
    champion: { teamId: 3, name: "Team 03", imageUrl: null },
    ...overrides,
  };
}

function setup(props: { view?: PicksView; onSave?: (draft: PicksDraft) => Promise<SaveOutcome> } = {}) {
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(<PicksEditor view={props.view ?? view()} teams={teams} onCancel={onCancel} onSave={props.onSave} />);
  return { user, onCancel };
}

const SAVED: SaveOutcome = {
  kind: "saved",
  picks: { currentPlayoff: [], currentTiebreakers: [], championId: 1 },
};

const slot = (n: number) => screen.getByRole("combobox", { name: `Slot ${n}` });
const champion = () => screen.getByRole("combobox", { name: "Champion" });
const optionNames = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

describe("PicksEditor", () => {
  it("has a labelled chooser for each of the 15 slots plus the champion", () => {
    setup();
    expect(screen.getAllByRole("combobox")).toHaveLength(16);
    for (let n = 1; n <= 15; n++) expect(slot(n)).toBeInTheDocument();
    expect(champion()).toHaveValue("3");
  });

  it("starts each slot on the saved team and offers every team, with a blank first", () => {
    setup();
    expect(slot(2)).toHaveValue("2");
    expect(slot(15)).toHaveValue("15");
    expect(optionNames(slot(1))).toEqual(["Choose a team", ...teams.map((t) => t.name)]);
  });

  it("pads missing slots with blanks", () => {
    setup({ view: view({ playoff: [pick(1)], tiebreakers: [] }) });
    expect(slot(2)).toHaveValue("");
    expect(slot(14)).toHaveValue("");
  });

  it("passes the local edits to onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(SAVED);
    const { user } = setup({ onSave });

    await user.selectOptions(slot(1), "Team 20");
    await user.selectOptions(slot(14), "Team 19");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const draft: PicksDraft = onSave.mock.calls[0][0];
    expect(draft.playoff[0]).toBe(20);
    expect(draft.tiebreakers).toEqual([13, 19, 15]);
    expect(draft.championId).toBe(3);
  });

  it("limits champion choices to the distinct teams in the top 12, in slot order", async () => {
    const { user } = setup();
    expect(optionNames(champion())).toEqual(["Choose a champion", ...Array.from({ length: 12 }, (_, i) => `Team ${String(i + 1).padStart(2, "0")}`)]);

    await user.selectOptions(slot(1), "Team 20");
    await user.selectOptions(slot(13), "Team 05");

    expect(optionNames(champion())).toEqual([
      "Choose a champion",
      "Team 20",
      ...Array.from({ length: 11 }, (_, i) => `Team ${String(i + 2).padStart(2, "0")}`),
    ]);
  });

  it("clears the champion with a polite note when its team leaves the top 12", async () => {
    const { user } = setup();

    await user.selectOptions(slot(3), "Team 20");

    expect(champion()).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Champion cleared: Team 03 is no longer in your top 12.");
  });

  it("keeps the champion while its team stays in the top 12", async () => {
    const { user } = setup();

    await user.selectOptions(slot(1), "Team 03");
    await user.selectOptions(slot(3), "Team 01");

    expect(champion()).toHaveValue("3");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("drops the cleared note once the champion's team is back in the top 12", async () => {
    const { user } = setup();

    await user.selectOptions(slot(3), "Team 20");
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    await user.selectOptions(slot(3), "Team 03");

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(champion()).toHaveValue("");
  });

  it("starts blank, with no cleared note, when the saved champion isn't in the top 12", async () => {
    const { user } = setup({ view: view({ champion: { teamId: 14, name: "Team 14", imageUrl: null } }) });

    expect(champion()).toHaveValue("");
    await user.selectOptions(slot(13), "Team 20");
    await user.selectOptions(slot(1), "Team 19");

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("lets the user choose a different champion", async () => {
    const onSave = vi.fn().mockResolvedValue(SAVED);
    const { user } = setup({ onSave });

    await user.selectOptions(champion(), "Team 07");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].championId).toBe(7);
  });

  it("turns the blank option into an empty slot", async () => {
    const onSave = vi.fn().mockResolvedValue(SAVED);
    const { user } = setup({ onSave });

    await user.selectOptions(slot(5), "Choose a team");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].playoff[4]).toBeNull();
  });

  it("hints at duplicates without blocking anything", async () => {
    const onSave = vi.fn().mockResolvedValue(SAVED);
    const { user } = setup({ onSave });

    await user.selectOptions(slot(13), "Team 01");

    expect(slot(13)).toHaveAccessibleDescription("Also in slot 1");
    expect(slot(1)).toHaveAccessibleDescription("Also in slot 13");
    expect(slot(2)).not.toHaveAccessibleDescription();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalled();

    await user.selectOptions(slot(13), "Team 13");
    expect(slot(1)).not.toHaveAccessibleDescription();
  });

  it("disables Save when nothing can handle it", () => {
    setup();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onCancel from Cancel", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown team selectable in its own slot only", () => {
    setup({ view: view({ playoff: [pick(1, 99999), ...Array.from({ length: 11 }, (_, i) => pick(i + 2))] }) });

    expect(slot(1)).toHaveValue("99999");
    expect(optionNames(slot(1))).toContain("Unknown team (#99999)");
    expect(optionNames(slot(2))).not.toContain("Unknown team (#99999)");
    expect(optionNames(champion())).toContain("Unknown team (#99999)");
  });

  it("moves focus into the editor when it opens", () => {
    setup();
    expect(screen.getByRole("form", { name: "Edit your picks" })).toHaveFocus();
  });

  describe("saving", () => {
    const save = () => screen.getByRole("button", { name: /^Sav/ });

    it("lists the violations, focuses the list heading's section and keeps the edits", async () => {
      const onSave = vi.fn().mockResolvedValue({
        kind: "invalid",
        violations: [
          { rule: "duplicate", message: "Team 02 appears more than once." },
          { rule: "champion-required", message: "Choose a champion." },
        ],
      } satisfies SaveOutcome);
      const { user } = setup({ onSave });
      await user.selectOptions(slot(1), "Team 02");

      await user.click(save());

      const summary = await screen.findByRole("region", { name: "Fix these before saving" });
      expect(within(summary).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        "Team 02 appears more than once.",
        "Choose a champion.",
      ]);
      expect(summary).toHaveFocus();
      expect(slot(1)).toHaveValue("2");
      expect(save()).not.toHaveAttribute("aria-disabled");
    });

    it("shows a failure message, offers the login link only when asked, and re-enables Save", async () => {
      const onSave = vi
        .fn()
        .mockResolvedValueOnce({ kind: "failed", message: "Nope, try later." })
        .mockResolvedValueOnce({ kind: "failed", message: "Signed out.", loginLink: true });
      const { user } = setup({ onSave });

      await user.click(save());
      const first = await screen.findByRole("region", { name: /Nope, try later\./ });
      expect(first).toHaveFocus();
      expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();

      await user.click(save());
      expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
      expect(screen.queryByText("Nope, try later.")).not.toBeInTheDocument();
    });

    it("treats a rejected onSave as a failure instead of leaving Save stuck", async () => {
      const { user } = setup({ onSave: vi.fn().mockRejectedValue(new Error("boom")) });

      await user.click(save());

      expect(await screen.findByText(/Something went wrong saving your picks/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-disabled");
    });

    it("sends one save for a double click or Enter then click, and ignores Cancel while saving", async () => {
      let finish: (outcome: SaveOutcome) => void = () => {};
      const onSave = vi.fn().mockReturnValue(new Promise<SaveOutcome>((resolve) => (finish = resolve)));
      const { user, onCancel } = setup({ onSave });

      await user.dblClick(save());
      save().focus();
      await user.keyboard("{Enter}");
      await user.click(save());
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(save()).toHaveTextContent("Saving…");
      expect(save()).toHaveAttribute("aria-disabled", "true");
      expect(save()).not.toBeDisabled();

      finish({ kind: "failed", message: "Try again." });
      expect(await screen.findByText("Try again.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
