import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PicksView } from "../../../lib/picks-view";
import PicksList from "./PicksList";

const pick = (rank: number, imageUrl: string | null = null) => ({
  rank,
  teamId: rank,
  name: `Team ${rank}`,
  imageUrl,
});

function view(overrides: Partial<PicksView> = {}): PicksView {
  return {
    playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1)),
    tiebreakers: [pick(13), pick(14), pick(15)],
    champion: null,
    ...overrides,
  };
}

describe("PicksList", () => {
  it("lists 12 playoff teams in order and 3 tiebreakers numbered from 13", () => {
    render(<PicksList view={view()} />);
    const [playoff, tiebreakers] = screen.getAllByRole("list");

    expect(within(playoff).getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`),
    );
    expect(playoff).not.toHaveAttribute("start");
    expect(within(tiebreakers).getAllByRole("listitem")).toHaveLength(3);
    expect(tiebreakers).toHaveAttribute("start", "13");
  });

  it("shows the champion only when one is set", () => {
    const { rerender } = render(<PicksList view={view()} />);
    expect(screen.queryByText("Champion:")).not.toBeInTheDocument();

    rerender(<PicksList view={view({ champion: { teamId: 2, name: "Team 2", imageUrl: null } })} />);
    expect(screen.getByText("Champion:")).toBeInTheDocument();
    expect(screen.getAllByText("Team 2")).toHaveLength(2);
  });

  it("renders a logo only for rows whose url is allowed", () => {
    const good = "https://a.espncdn.com/i/teamlogos/ncaa/500/1.png";
    const { container } = render(
      <PicksList view={view({ playoff: [pick(1, good), pick(2, "https://evil.test/x.png"), pick(3)] })} />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("Team 2")).toBeInTheDocument();
  });

  it("loads the first rows' logos eagerly and the last rows' lazily", () => {
    const url = (n: number) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${n}.png`;
    const { container } = render(
      <PicksList
        view={view({
          playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1, url(i + 1))),
          tiebreakers: [pick(13, url(13)), pick(14, url(14)), pick(15, url(15))],
        })}
      />,
    );
    const loading = [...container.querySelectorAll("img")].map((img) => img.getAttribute("loading"));

    expect(loading[0]).toBe("eager");
    expect(loading[14]).toBe("lazy");
  });
});
