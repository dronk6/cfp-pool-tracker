import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NavBar from "./NavBar";

const usePathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname }));

// The panel and the inline list both contain the links (CSS decides which
// shows), so tests locate the panel through the button's aria-controls.
function getButton() {
  return screen.getByRole("button", { name: "Main menu" });
}

function getPanel() {
  return document.getElementById(getButton().getAttribute("aria-controls")!)!;
}

describe("NavBar", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/");
  });

  it("is a labelled navigation landmark inside a header", () => {
    render(<NavBar />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("links to Home, Rules and My Picks in the inline list", () => {
    render(<NavBar />);
    const inline = screen.getAllByRole("list")[0];

    expect(within(inline).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(inline).getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules");
    expect(within(inline).getByRole("link", { name: "My Picks" })).toHaveAttribute("href", "/my-picks");
  });

  it("marks only the current page link with aria-current", () => {
    usePathname.mockReturnValue("/rules");
    render(<NavBar />);
    const inline = screen.getAllByRole("list")[0];

    expect(within(inline).getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
    expect(within(inline).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(within(inline).getByRole("link", { name: "My Picks" })).not.toHaveAttribute("aria-current");
  });

  it("shows the current page title next to the hamburger", () => {
    usePathname.mockReturnValue("/my-picks");
    render(<NavBar />);

    expect(screen.getByText("My Picks", { selector: "span" })).toBeInTheDocument();
  });

  describe("account actions", () => {
    it("shows nothing in the actions slot while the user is not known yet", () => {
      render(<NavBar />);

      expect(screen.queryByRole("link", { name: "Log In" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Account menu/ })).not.toBeInTheDocument();
    });

    it("shows a Log In link to /login when signed out", () => {
      render(<NavBar user={null} />);

      expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("href", "/login");
      expect(screen.queryByRole("button", { name: /Account menu/ })).not.toBeInTheDocument();
    });

    it("marks Log In as current on the login page", () => {
      usePathname.mockReturnValue("/login");
      render(<NavBar user={null} />);

      expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("aria-current", "page");
    });

    it("shows the account menu instead of Log In when signed in", () => {
      render(<NavBar user={{ name: "Ada" }} />);

      expect(screen.getByRole("button", { name: "Account menu for Ada" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Log In" })).not.toBeInTheDocument();
    });
  });

  describe("mobile menu", () => {
    it("starts closed with the panel inert", () => {
      render(<NavBar />);

      expect(getButton()).toHaveAttribute("aria-expanded", "false");
      expect(getPanel()).toHaveAttribute("inert");
    });

    it("opens the panel and moves focus to its first link", async () => {
      render(<NavBar />);

      await userEvent.click(getButton());

      expect(getButton()).toHaveAttribute("aria-expanded", "true");
      expect(getPanel()).not.toHaveAttribute("inert");
      expect(within(getPanel()).getByRole("link", { name: "Home" })).toHaveFocus();
    });

    it("closes on Escape and returns focus to the hamburger", async () => {
      render(<NavBar />);
      await userEvent.click(getButton());

      await userEvent.keyboard("{Escape}");

      expect(getButton()).toHaveAttribute("aria-expanded", "false");
      expect(getButton()).toHaveFocus();
    });

    it("closes when the backdrop is clicked", async () => {
      render(<NavBar />);
      await userEvent.click(getButton());

      await userEvent.click(screen.getByTestId("nav-backdrop"));

      expect(getButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a panel link is clicked", async () => {
      render(<NavBar />);
      await userEvent.click(getButton());

      await userEvent.click(within(getPanel()).getByRole("link", { name: "Rules" }));

      expect(getButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when the route changes", async () => {
      const { rerender } = render(<NavBar />);
      await userEvent.click(getButton());

      usePathname.mockReturnValue("/rules");
      rerender(<NavBar />);

      expect(getButton()).toHaveAttribute("aria-expanded", "false");
    });
  });
});
