import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RulesPage from "./page";

describe("RulesPage", () => {
  it("renders the Rules heading", () => {
    render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Rules" })).toBeInTheDocument();
  });

  it("renders the Initial Picks section without any payment line", () => {
    const { container } = render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 2, name: "Initial Picks" })).toBeInTheDocument();
    expect(container).toHaveTextContent("Tyler enters your initial picks for you.");
    expect(container).not.toHaveTextContent(/Venmo/i);
    expect(container).not.toHaveTextContent("$");
  });

  it("renders the Scoring section with its point values", () => {
    render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 2, name: "Scoring" })).toBeInTheDocument();
    expect(screen.getByText("1 point per correct team")).toBeInTheDocument();
    expect(screen.getByText("1 point for correct seed")).toBeInTheDocument();
    expect(screen.getByText("3 points for picking the correct champion")).toBeInTheDocument();
  });

  it("is year-agnostic", () => {
    const { container } = render(<RulesPage />);

    expect(container).not.toHaveTextContent(/20\d\d|October|Oct\b/);
  });

  it("renders the Week 6/7 Adjustment section with the move limit", () => {
    const { container } = render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 2, name: "Week 6/7 Adjustment" })).toBeInTheDocument();
    expect(container).toHaveTextContent("3 moves");
    expect(container).toHaveTextContent("The pool site shows the exact window for the season.");
  });

  it("explains what does and does not count as a move", () => {
    render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 3, name: "What counts as a move (top 12 only)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "What does NOT count as a move" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Champion" })).toBeInTheDocument();
  });

  it("requires a team from each Power Four conference and a G6 team", () => {
    render(<RulesPage />);

    const validity = screen.getByRole("heading", { level: 3, name: "An update is valid only if" });
    const list = within(validity.parentElement as HTMLElement)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Power Four")) as HTMLElement;

    expect(list).toHaveTextContent(/ACC, Big Ten, Big 12 and SEC/);
    expect(list).toHaveTextContent(/at least one G6 team/);
    expect(list).toHaveTextContent("Notre Dame is independent, so it doesn't count toward any Power Four conference.");
  });

  it("renders the After the Adjustment section", () => {
    render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 2, name: "After the Adjustment" })).toBeInTheDocument();
  });

  it("states the move count for every example", () => {
    render(<RulesPage />);

    const heading = screen.getByRole("heading", { level: 3, name: "Examples" });
    const items = within(heading.parentElement as HTMLElement)
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    const examples = items.filter((text) => /^(Replace|Reorder|Drop) /.test(text));

    expect(examples).toHaveLength(8);
    expect(examples[0]).toMatch(/same slot: 1 move\./);
    expect(examples[1]).toMatch(/1 move in total/);
    expect(examples[2]).toMatch(/swap two other teams: 2 moves/);
    expect(examples[3]).toMatch(/different slot.*2 moves/);
    expect(examples[4]).toMatch(/own slot: 3 moves/);
    expect(examples[5]).toMatch(/4 moves, which is not valid/);
    expect(examples[6]).toMatch(/1 move, since/);
    expect(examples[7]).toMatch(/0 moves/);
  });
});
