import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RulesPage from "./page";

describe("RulesPage", () => {
  it("renders the Rules heading", () => {
    render(<RulesPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Rules" })).toBeInTheDocument();
  });

  it("is year-agnostic so it doesn't go stale between seasons", () => {
    const { container } = render(<RulesPage />);

    expect(container).not.toHaveTextContent(/20\d\d|October|Oct\b/);
  });

  it("has no payment text", () => {
    const { container } = render(<RulesPage />);

    expect(container).not.toHaveTextContent(/Venmo/i);
    expect(container).not.toHaveTextContent("$");
  });

  it("mentions Power Four and G6", () => {
    const { container } = render(<RulesPage />);

    expect(container).toHaveTextContent(/Power Four/);
    expect(container).toHaveTextContent(/G6/);
  });
});
