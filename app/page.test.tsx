import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the Home heading", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
  });

  it("links to the rules, login and My Picks pages", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules");
    expect(screen.getByRole("link", { name: "log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "My Picks" })).toHaveAttribute("href", "/my-picks");
  });

  it("shows the modification window dates", () => {
    const { container } = render(<HomePage />);

    expect(container).toHaveTextContent(/October 11/);
    expect(container).toHaveTextContent(/October 17, 2026/);
  });

  it("includes no payment or contact details", () => {
    const { container } = render(<HomePage />);

    expect(container).not.toHaveTextContent(/Venmo/i);
    expect(container).not.toHaveTextContent("$");
    expect(container).not.toHaveTextContent("@");
  });
});
