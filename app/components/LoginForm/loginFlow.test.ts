import { describe, expect, it } from "vitest";
import { initialState, loginReducer, MESSAGES, RESEND_COOLDOWN_MS, resendSecondsLeft, type LoginAction, type LoginState } from "./loginFlow";

function run(...actions: LoginAction[]): LoginState {
  return actions.reduce(loginReducer, initialState);
}

const typed = { type: "emailChanged", email: "a@b.co" } as const;

describe("loginReducer", () => {
  it("starts on the email step", () => {
    expect(initialState).toMatchObject({ step: "email", email: "", pending: false, error: null });
  });

  it("stores the typed email", () => {
    expect(run(typed)).toMatchObject({ email: "a@b.co" });
  });

  it("marks a request as pending and clears the old error", () => {
    expect(run({ type: "failed", error: "boom" }, { type: "started" })).toMatchObject({ pending: true, error: null });
  });

  it("moves to an empty code step with the generic notice, keeping the email", () => {
    expect(run(typed, { type: "started" }, { type: "codeRequested", at: 1000 })).toMatchObject({
      step: "code",
      email: "a@b.co",
      code: "",
      pending: false,
      notice: MESSAGES.codeSent,
      error: null,
    });
  });

  it("stays on the email step and shows the error when a request fails", () => {
    expect(run({ type: "started" }, { type: "failed", error: MESSAGES.network })).toMatchObject({
      step: "email",
      pending: false,
      error: MESSAGES.network,
    });
  });

  it("keeps only the digits of the code", () => {
    const state = run(typed, { type: "codeRequested", at: 0 }, { type: "codeChanged", code: "12 34-ab5" });
    expect(state).toMatchObject({ code: "12345" });
  });

  it("ignores code input on the email step", () => {
    expect(run({ type: "codeChanged", code: "123" })).toBe(initialState);
  });

  it("clears the code, error and timer when a new code is requested", () => {
    const state = run(
      typed,
      { type: "codeRequested", at: 0 },
      { type: "codeChanged", code: "123" },
      { type: "failed", error: MESSAGES.codeRejected },
      { type: "codeRequested", at: 50_000 },
    );
    expect(state).toMatchObject({ code: "", error: null, requestedAt: 50_000, now: 50_000 });
  });

  it("returns to the email step on cancel, keeping the email", () => {
    const state = run(typed, { type: "codeRequested", at: 0 }, { type: "failed", error: "x" }, { type: "cancelled" });
    expect(state).toEqual({ step: "email", email: "a@b.co", pending: false, error: null });
  });
});

describe("resendSecondsLeft", () => {
  const afterRequest = run(typed, { type: "codeRequested", at: 10_000 });

  it("is 0 on the email step", () => {
    expect(resendSecondsLeft(initialState)).toBe(0);
  });

  it("counts down from the full cooldown, rounding up", () => {
    expect(resendSecondsLeft(afterRequest)).toBe(RESEND_COOLDOWN_MS / 1000);
    expect(resendSecondsLeft(loginReducer(afterRequest, { type: "ticked", at: 10_001 }))).toBe(30);
    expect(resendSecondsLeft(loginReducer(afterRequest, { type: "ticked", at: 13_000 }))).toBe(27);
  });

  it("reaches 0 exactly at the cooldown and stays there", () => {
    expect(resendSecondsLeft(loginReducer(afterRequest, { type: "ticked", at: 39_999 }))).toBe(1);
    expect(resendSecondsLeft(loginReducer(afterRequest, { type: "ticked", at: 40_000 }))).toBe(0);
    expect(resendSecondsLeft(loginReducer(afterRequest, { type: "ticked", at: 90_000 }))).toBe(0);
  });
});
