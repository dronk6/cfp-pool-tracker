import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginForm from "./LoginForm";
import { navigate } from "./navigate";

vi.mock("./navigate", () => ({ navigate: vi.fn() }));

const GENERIC = "If that email is registered, a code is on its way.";
const WRONG = "That code didn't work. Check it, or send a new code.";

type Handlers = { verify?: () => Response };

function stubApi({ verify = () => new Response("{}", { status: 401 }) }: Handlers = {}) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith("request-otp") ? new Response(null, { status: 200 }) : verify(),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodies(fetchMock: ReturnType<typeof stubApi>, route: string) {
  return (fetchMock.mock.calls as unknown as [string, RequestInit][])
    .filter(([url]) => (url as string).endsWith(route))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

// Only the clock is faked, so Testing Library's own timeouts keep working.
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

async function reachCodeStep(email = "a@b.co") {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<LoginForm />);
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send Code" }));
  await screen.findByText(GENERIC);
  return user;
}

const resendButton = () => screen.getByRole("button", { name: /Send a New Code/ });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.mocked(navigate).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LoginForm code step", () => {
  it("shows the code box, Send a New Code and Cancel as soon as the step appears", async () => {
    stubApi();
    await reachCodeStep();

    expect(screen.getByLabelText("Code")).toHaveFocus();
    expect(resendButton()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses a numeric, one-time-code input with no length limit", async () => {
    stubApi();
    await reachCodeStep();

    const input = screen.getByLabelText("Code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).not.toHaveAttribute("maxlength");
  });

  it("sends the email and the digits to verify-otp and goes to My Picks on success", async () => {
    const fetchMock = stubApi({ verify: () => new Response('{"success":true}', { status: 200 }) });
    const user = await reachCodeStep("Fan@Example.com");

    await user.type(screen.getByLabelText("Code"), "1234 5678");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/my-picks"));
    expect(bodies(fetchMock, "verify-otp")).toEqual([{ email: "Fan@Example.com", otp: "12345678" }]);
    expect(screen.getByRole("button", { name: "Verify Code" })).toBeDisabled();
  });

  it("strips non-digits as the user types", async () => {
    stubApi();
    const user = await reachCodeStep();

    await user.type(screen.getByLabelText("Code"), "a1b2-3");

    expect(screen.getByLabelText("Code")).toHaveValue("123");
  });

  it("blocks an empty code without calling the server", async () => {
    const fetchMock = stubApi();
    const user = await reachCodeStep();

    await user.type(screen.getByLabelText("Code"), "abc");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the code from your email.");
    expect(bodies(fetchMock, "verify-otp")).toEqual([]);
  });

  it("shows one message for a wrong code and keeps the other options", async () => {
    stubApi();
    const user = await reachCodeStep();

    await user.type(screen.getByLabelText("Code"), "00000000");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(WRONG);
    expect(screen.getByLabelText("Code")).toHaveFocus();
    expect(navigate).not.toHaveBeenCalled();
    expect(resendButton()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("shows a connection message when verifying fails on the network", async () => {
    const fetchMock = stubApi();
    const user = await reachCodeStep();
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

    await user.type(screen.getByLabelText("Code"), "1");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
  });

  it("disables every control while verifying", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = stubApi();
    const user = await reachCodeStep();
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));

    await user.type(screen.getByLabelText("Code"), "1");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));

    expect(screen.getByLabelText("Code")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verify Code" })).toBeDisabled();
    expect(resendButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish(new Response("{}", { status: 401 }));
    await screen.findByRole("alert");
  });

  it("disables Send a New Code with a countdown until 30 seconds have passed", async () => {
    stubApi();
    await reachCodeStep();

    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent("Send a New Code (30s)");

    await advance(3000);
    expect(resendButton()).toHaveTextContent("Send a New Code (27s)");
    expect(resendButton()).toBeDisabled();

    await advance(26_000);
    expect(resendButton()).toHaveTextContent("Send a New Code (1s)");

    await advance(1000);
    expect(resendButton()).toHaveTextContent(/^Send a New Code$/);
    expect(resendButton()).toBeEnabled();
  });

  it("requests another code for the same email, then resets the timer, notice and code box", async () => {
    const fetchMock = stubApi();
    const user = await reachCodeStep("Fan@Example.com");
    await user.type(screen.getByLabelText("Code"), "999");
    await user.click(screen.getByRole("button", { name: "Verify Code" }));
    await screen.findByRole("alert");
    await advance(30_000);

    await user.click(resendButton());

    await waitFor(() => expect(bodies(fetchMock, "request-otp")).toHaveLength(2));
    expect(bodies(fetchMock, "request-otp")[1]).toEqual({ email: "Fan@Example.com" });
    await waitFor(() => expect(resendButton()).toBeDisabled());
    expect(resendButton()).toHaveTextContent("(30s)");
    expect(screen.getByLabelText("Code")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(GENERIC)).toBeInTheDocument();
  });

  it("shows a connection message and allows another try when a resend fails on the network", async () => {
    const fetchMock = stubApi();
    const user = await reachCodeStep();
    await advance(30_000);
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

    await user.click(resendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
    expect(resendButton()).toBeEnabled();
  });

  it("returns to the email step on Cancel, keeping the typed email and focusing it", async () => {
    stubApi();
    const user = await reachCodeStep("Fan@Example.com");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("Fan@Example.com");
    expect(email).toHaveFocus();
    expect(screen.queryByLabelText("Code")).not.toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it("starts over on remount and keeps the email out of storage", async () => {
    stubApi();
    await reachCodeStep();
    expect(localStorage.length + sessionStorage.length).toBe(0);

    cleanup();
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.queryByLabelText("Code")).not.toBeInTheDocument();
  });
});
