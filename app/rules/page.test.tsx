import { render, screen } from "@testing-library/react";
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
    const list = validity.nextElementSibling as HTMLElement;

    expect(list).toHaveTextContent(/ACC, Big Ten, Big 12 and SEC/);
    expect(list).toHaveTextContent(/at least one G6 team/);
  });
});
