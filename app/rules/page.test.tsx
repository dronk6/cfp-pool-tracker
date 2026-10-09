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
});
