import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountMenu from "./AccountMenu";

const usePathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname }));
const hardNavigate = vi.hoisted(() => vi.fn());
vi.mock("./navigate", () => ({ hardNavigate }));

const fetchMock = vi.fn();

const getAvatar = () => screen.getByRole("button", { name: /Account menu/ });
const getPopup = () => screen.getByRole("group", { name: "Are you sure?" });
const isOpen = () => getAvatar().getAttribute("aria-expanded") === "true";

describe("AccountMenu", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/");
    hardNavigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("names the avatar button after the user, or generically without a name", () => {
    const { unmount } = render(<AccountMenu name="Ada" />);
    expect(screen.getByRole("button", { name: "Account menu for Ada" })).toBeInTheDocument();
    unmount();

    render(<AccountMenu name={null} />);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("starts closed, with the popup hidden", () => {
    render(<AccountMenu name="Ada" />);

    expect(isOpen()).toBe(false);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("opens a labelled popup with Log Out before Cancel, and focuses Cancel", async () => {
    render(<AccountMenu name="Ada" />);

    await userEvent.click(getAvatar());

    expect(isOpen()).toBe(true);
    expect(getAvatar()).toHaveAttribute("aria-controls", getPopup().id);
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons.slice(-2)).toEqual(["Log Out", "Cancel"]);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("closes on the avatar button too", async () => {
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    await userEvent.click(getAvatar());

    expect(isOpen()).toBe(false);
  });

  it("closes on Cancel and returns focus to the avatar", async () => {
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(isOpen()).toBe(false);
    expect(getAvatar()).toHaveFocus();
  });

  it("closes on Escape and returns focus to the avatar", async () => {
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    await userEvent.keyboard("{Escape}");

    expect(isOpen()).toBe(false);
    expect(getAvatar()).toHaveFocus();
  });

  it("closes when the pointer goes down outside, but not inside", async () => {
    render(
      <div>
        <AccountMenu name="Ada" />
        <p>elsewhere</p>
      </div>,
    );
    await userEvent.click(getAvatar());

    await userEvent.click(screen.getByText("Are you sure?"));
    expect(isOpen()).toBe(true);

    await userEvent.click(screen.getByText("elsewhere"));
    expect(isOpen()).toBe(false);
  });

  it("closes when focus moves to another element", async () => {
    render(
      <div>
        <AccountMenu name="Ada" />
        <button type="button">other</button>
      </div>,
    );
    await userEvent.click(getAvatar());

    act(() => screen.getByRole("button", { name: "other" }).focus());

    expect(isOpen()).toBe(false);
  });

  it("closes when the route changes", async () => {
    const { rerender } = render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    usePathname.mockReturnValue("/rules");
    rerender(<AccountMenu name="Ada" />);

    expect(isOpen()).toBe(false);
  });

  it("Log Out POSTs to /api/logout, disables the buttons while pending, then goes home", async () => {
    let finish!: (response: { ok: boolean }) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
    expect(screen.getByRole("button", { name: "Logging out…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(hardNavigate).not.toHaveBeenCalled();

    await act(async () => finish({ ok: true }));

    expect(hardNavigate).toHaveBeenCalledWith("/");
  });

  it.each([
    ["a failed response", () => fetchMock.mockResolvedValue({ ok: false })],
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("offline"))],
  ])("shows an alert and stays open after %s", async (_label, arrange) => {
    arrange();
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log out. Try again.");
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);
    expect(screen.getByRole("button", { name: "Log Out" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Log Out" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("clears the error when the menu is reopened", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(<AccountMenu name="Ada" />);
    await userEvent.click(getAvatar());
    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));
    await screen.findByRole("alert");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(getAvatar());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
