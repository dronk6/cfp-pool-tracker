import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CURRENT_SEASON_YEAR } from "../../lib/seasons/current-season";
import MyPicksPage from "./page";

const MyPicksSection = vi.hoisted(() => vi.fn((props: { year: number }) => (void props, null)));
vi.mock("./MyPicksSection", () => ({ default: MyPicksSection }));

describe("MyPicksPage", () => {
  // A synchronous render proves the page itself awaits nothing, so it can prerender.
  it("renders the My Picks heading synchronously", () => {
    render(<MyPicksPage />);

    expect(screen.getByRole("heading", { level: 1, name: "My Picks" })).toBeInTheDocument();
  });

  it("passes the current season year to the picks section", () => {
    MyPicksSection.mockClear();

    render(<MyPicksPage />);

    expect(MyPicksSection.mock.calls[0][0]).toEqual({ year: CURRENT_SEASON_YEAR });
  });
});
