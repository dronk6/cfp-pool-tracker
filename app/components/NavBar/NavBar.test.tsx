import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NavBar from "./NavBar";

const usePathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname }));

describe("NavBar", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/");
  });

  it("is a labelled navigation landmark inside a header", () => {
    render(<NavBar />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("links to Home, Rules and My Picks", () => {
    render(<NavBar />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules");
    expect(screen.getByRole("link", { name: "My Picks" })).toHaveAttribute("href", "/my-picks");
  });

  it("marks only the current page's link with aria-current", () => {
    usePathname.mockReturnValue("/rules");
    render(<NavBar />);

    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "My Picks" })).not.toHaveAttribute("aria-current");
  });
});
