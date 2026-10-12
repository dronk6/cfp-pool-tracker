import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PicksView, TeamOption } from "../../../lib/picks-view";
import PicksPanel from "./PicksPanel";

const teams: TeamOption[] = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  name: `Team ${String(i + 1).padStart(2, "0")}`,
  imageUrl: null,
  // 1-3 ACC, 4-6 Big Ten, 7-9 Big 12, 10-12 SEC, 13+ non-power.
  conference: ["ACC", "Big Ten", "Big 12", "SEC"][Math.floor(i / 3)] ?? "Sun Belt",
  isPowerConf: i < 12,
}));
const pick = (rank: number) => ({ rank, teamId: rank, name: `Team ${String(rank).padStart(2, "0")}`, imageUrl: null });
const view: PicksView = {
  playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1)),
  tiebreakers: [pick(13), pick(14), pick(15)],
  champion: null,
};

// The saved top 12 swaps team 12 for 13, the one non-power team, so it is a valid starting point.
const initialTop12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13];
const editButton = () => screen.getByRole("button", { name: "Edit" });
const slot1 = () => screen.getByRole("combobox", { name: "Slot 1" });

describe("PicksPanel", () => {
  it("shows the saved picks and an Edit button, not the editor, by default", () => {
    render(<PicksPanel view={view} teams={teams} editDisabledReason={null} year={2026} initialTop12={initialTop12} />);
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(editButton()).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens the editor, and Cancel discards the changes and returns focus to Edit", async () => {
    const user = userEvent.setup();
    render(<PicksPanel view={view} teams={teams} editDisabledReason={null} year={2026} initialTop12={initialTop12} />);

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
      render(<PicksPanel view={view} teams={teams} editDisabledReason={reason} year={2026} initialTop12={initialTop12} />);
      const button = editButton();

      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
      button.focus();
      expect(button).toHaveFocus();
    });

    it("does not enter edit mode on click or keyboard activation", async () => {
      const user = userEvent.setup();
      render(<PicksPanel view={view} teams={teams} editDisabledReason={reason} year={2026} initialTop12={initialTop12} />);

      await user.click(editButton());
      editButton().focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("treats a null reason as editable", async () => {
      const user = userEvent.setup();
      render(<PicksPanel view={view} teams={teams} editDisabledReason={null} year={2026} initialTop12={initialTop12} />);

      expect(editButton()).not.toHaveAttribute("aria-disabled");
      await user.click(editButton());
      expect(slot1()).toBeInTheDocument();
    });
  });

  describe("saving", () => {
    const savedView: PicksView = {
      playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13].map((id, i) => ({ ...pick(id), rank: i + 1 })),
      tiebreakers: [pick(14), pick(15), pick(16)].map((p, i) => ({ ...p, rank: 13 + i })),
      champion: { teamId: 1, name: "Team 01", imageUrl: null },
    };
    const save = () => screen.getByRole("button", { name: /^Sav/ });
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    function setup(fetchMock = vi.fn()) {
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<PicksPanel view={savedView} teams={teams} editDisabledReason={null} year={2026} initialTop12={initialTop12} />);
      return { user, fetchMock };
    }
    const openEditor = (user: ReturnType<typeof userEvent.setup>) => user.click(editButton());

    afterEach(() => vi.unstubAllGlobals());

    it("lists violations with slots, focuses them, keeps the edits and sends nothing", async () => {
      const { user, fetchMock } = setup();
      await openEditor(user);
      await user.selectOptions(slot1(), "Team 02");

      await user.click(save());

      const summary = await screen.findByRole("region", { name: "Fix these before saving" });
      expect(summary).toHaveFocus();
      expect(within(summary).getByText(/Team 02 appears more than once in the top 12 \(slots 1 and 2\)/)).toBeInTheDocument();
      expect(slot1()).toHaveValue("2");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks for a champion after a slot change cleared it", async () => {
      const { user, fetchMock } = setup();
      await openEditor(user);
      await user.selectOptions(slot1(), "Team 17");

      await user.click(save());

      expect(await screen.findByText("Choose a champion.")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clears the problems on the next save attempt that succeeds, and shows the server's picks", async () => {
      // The server stores something different from the draft, to prove which one is shown.
      const stored = {
        currentPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15],
        currentTiebreakers: [14, 13, 16],
        championId: 2,
      };
      const { user, fetchMock } = setup(vi.fn().mockResolvedValue(respond({ ...stored, year: 2026 })));
      await openEditor(user);
      await user.selectOptions(slot1(), "Team 02");
      await user.click(save());
      await screen.findByRole("region", { name: "Fix these before saving" });

      await user.selectOptions(slot1(), "Team 01");
      await user.selectOptions(screen.getByRole("combobox", { name: "Champion" }), "Team 01");
      await user.selectOptions(screen.getByRole("combobox", { name: "Slot 12" }), "Team 17");
      await user.click(save());

      expect(await screen.findByText("Your picks were saved.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        currentPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17],
        currentTiebreakers: [14, 15, 16],
        championId: 1,
      });
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.getByText("Team 15")).toBeInTheDocument();
      expect(screen.queryByText("Team 13")).toBeInTheDocument(); // now a tiebreaker, from the response
      expect(editButton()).toHaveFocus();

      await user.click(editButton());
      expect(screen.getByRole("combobox", { name: "Slot 12" })).toHaveValue("15");
      expect(screen.getByRole("combobox", { name: "Champion" })).toHaveValue("2");
      expect(screen.queryByText("Your picks were saved.")).not.toBeInTheDocument();
    });

    it("still shows the initial team after a save and re-entering edit mode", async () => {
      // Slot 12 starts as Team 13 (initial), is saved as Team 17, then changed again to Team 05.
      const saved = {
        currentPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17],
        currentTiebreakers: [14, 15, 16],
        championId: 1,
      };
      const { user } = setup(vi.fn().mockResolvedValue(respond({ ...saved, year: 2026 })));
      await openEditor(user);
      await user.selectOptions(screen.getByRole("combobox", { name: "Slot 12" }), "Team 17");
      await user.selectOptions(screen.getByRole("combobox", { name: "Champion" }), "Team 01");
      await user.click(save());
      await screen.findByText("Your picks were saved.");

      await user.click(editButton());
      expect(screen.getByRole("combobox", { name: "Slot 12" })).toHaveValue("17");
      expect(screen.getByText("Originally: Team 13")).toBeInTheDocument();

      await user.selectOptions(screen.getByRole("combobox", { name: "Slot 12" }), "Team 05");
      expect(screen.getByText("Originally: Team 13")).toBeInTheDocument();
    });

    it.each([
      [401, { error: "unauthenticated" }, /signed out/],
      [403, { error: "outside-edit-window", editOpensAt: null, editClosesAt: null }, /isn't open for this season/],
      [404, { error: "submission-not-found" }, /couldn't find your 2026 picks/],
      [400, { error: "invalid-body" }, /server rejected these picks/],
      [415, { error: "unsupported-media-type" }, /Reload and try again/],
      [500, { error: "internal" }, /Something went wrong on our side/],
    ])("shows the message for a %i, keeps the draft and re-enables Save", async (status, body, message) => {
      const { user } = setup(vi.fn().mockResolvedValue(respond(body, status)));
      await openEditor(user);
      await user.selectOptions(screen.getByRole("combobox", { name: "Slot 12" }), "Team 17");

      await user.click(save());

      const summary = await screen.findByRole("region", { name: message });
      expect(summary).toHaveFocus();
      expect(screen.getByRole("combobox", { name: "Slot 12" })).toHaveValue("17");
      expect(save()).not.toHaveAttribute("aria-disabled");
      expect(screen.queryByRole("link", { name: "Log in" }) !== null).toBe(status === 401);
    });

    it("explains an unreachable server and lets the user retry", async () => {
      const { user, fetchMock } = setup(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
      await openEditor(user);

      await user.click(save());
      expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument();
      await user.click(save());

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("sends one request for a double click and ignores Cancel while saving", async () => {
      let finish: (response: Response) => void = () => {};
      const { user, fetchMock } = setup(vi.fn().mockReturnValue(new Promise<Response>((resolve) => (finish = resolve))));
      await openEditor(user);

      await user.dblClick(save());
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(slot1()).toBeInTheDocument();
      finish(respond({ error: "internal" }, 500));
      expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    });
  });
});
