import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the Home heading", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
  });

  it("renders the Welcome and Viewing and Modifying Picks sections", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 2, name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Viewing and Modifying Picks" })).toBeInTheDocument();
  });

  it("links to the rules, login and My Picks pages", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules");
    expect(screen.getByRole("link", { name: "log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "My Picks" })).toHaveAttribute("href", "/my-picks");
  });

  it("explains the login code and the move limit", () => {
    const { container } = render(<HomePage />);

    expect(container).toHaveTextContent(/one-time code/);
    expect(container).toHaveTextContent(/three moves/);
  });

  it("states the modification window", () => {
    const { container } = render(<HomePage />);

    expect(container).toHaveTextContent(
      "from midnight ET going into October 11 until 12 pm ET on October 17, 2026",
    );
  });

  it("includes no payment or contact details", () => {
    const { container } = render(<HomePage />);

    expect(container).not.toHaveTextContent(/Venmo/i);
    expect(container).not.toHaveTextContent("$");
    expect(container).not.toHaveTextContent("@");
  });
});
