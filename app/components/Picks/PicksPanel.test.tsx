import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { PicksView, TeamOption } from "../../../lib/picks-view";
import PicksPanel from "./PicksPanel";

const teams: TeamOption[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  name: `Team ${String(i + 1).padStart(2, "0")}`,
  imageUrl: null,
}));
const pick = (rank: number) => ({ rank, teamId: rank, name: `Team ${String(rank).padStart(2, "0")}`, imageUrl: null });
const view: PicksView = {
  playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1)),
  tiebreakers: [pick(13), pick(14), pick(15)],
  champion: null,
};

const editButton = () => screen.getByRole("button", { name: "Edit" });
const slot1 = () => screen.getByRole("combobox", { name: "Slot 1" });

describe("PicksPanel", () => {
  it("shows the saved picks and an Edit button, not the editor, by default", () => {
    render(<PicksPanel view={view} teams={teams} editDisabledReason={null} />);
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(editButton()).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens the editor, and Cancel discards the changes and returns focus to Edit", async () => {
    const user = userEvent.setup();
    render(<PicksPanel view={view} teams={teams} editDisabledReason={null} />);

    await user.click(editButton());
    await user.selectOptions(slot1(), "Team 16");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Team 01")).toBeInTheDocument();
    expect(screen.queryByText("Team 16")).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();

    await user.click(editButton());
    expect(slot1()).toHaveValue("1");
  });

  describe("when editing is unavailable", () => {
    const reason = "Editing opens on Oct 15.";

    it("keeps the button focusable, marks it aria-disabled and explains why", () => {
      render(<PicksPanel view={view} teams={teams} editDisabledReason={reason} />);
      const button = editButton();

      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
      button.focus();
      expect(button).toHaveFocus();
    });

    it("does not enter edit mode on click or keyboard activation", async () => {
      const user = userEvent.setup();
      render(<PicksPanel view={view} teams={teams} editDisabledReason={reason} />);

      await user.click(editButton());
      editButton().focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("treats a null reason as editable", async () => {
      const user = userEvent.setup();
      render(<PicksPanel view={view} teams={teams} editDisabledReason={null} />);

      expect(editButton()).not.toHaveAttribute("aria-disabled");
      await user.click(editButton());
      expect(slot1()).toBeInTheDocument();
    });
  });
});
