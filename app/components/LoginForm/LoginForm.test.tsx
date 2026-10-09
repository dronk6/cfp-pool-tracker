import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginForm from "./LoginForm";
import { navigate } from "./navigate";

vi.mock("./navigate", () => ({ navigate: vi.fn() }));

const GENERIC = "If that email is registered, a code is on its way.";

function stubFetch(handler: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => handler());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>, email = "a@b.co") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send Code" }));
}

beforeEach(() => {
  vi.mocked(navigate).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginForm email step", () => {
  it("shows only the email form until a code is requested", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it.each([200, 500])("shows the same generic message when the server answers %i", async (status) => {
    stubFetch(() => new Response(null, { status }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user);

    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("posts the typed email to the request-otp route", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user, "  Fan@Example.com ");

    await screen.findByText(GENERIC);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/request-otp");
    expect(JSON.parse(init.body as string)).toEqual({ email: "Fan@Example.com" });
  });

  it("stays on the email step with a message when the server rejects the email", async () => {
    stubFetch(() => new Response("{}", { status: 400 }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user, "nope");

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByLabelText("Email")).toHaveValue("nope");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it("does not call the server for an empty email", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Send Code" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays on the email step with a connection message when the network fails", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
    expect(screen.getByLabelText("Email")).toHaveValue("a@b.co");
  });

  it("disables the form while the request is in flight", async () => {
    let finish!: (response: Response) => void;
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user);

    expect(screen.getByRole("button", { name: "Send Code" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    finish(new Response(null, { status: 200 }));
    await waitFor(() => expect(screen.getByText(GENERIC)).toBeInTheDocument());
  });

  it("starts over when the page is reloaded", async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    const user = userEvent.setup();
    const first = render(<LoginForm />);
    await submitEmail(user);
    await screen.findByText(GENERIC);

    first.unmount();
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it("keeps the email out of browser storage", async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await submitEmail(user);
    await screen.findByText(GENERIC);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
