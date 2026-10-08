import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MyPicksPage from "./page";

describe("MyPicksPage", () => {
  it("renders the My Picks heading", () => {
    render(<MyPicksPage />);

    expect(screen.getByRole("heading", { level: 1, name: "My Picks" })).toBeInTheDocument();
  });
});
