import { describe, expect, it } from "vitest";
import { initialState, loginReducer, MESSAGES } from "./loginFlow";

describe("loginReducer", () => {
  it("starts on the email step", () => {
    expect(initialState).toMatchObject({ step: "email", email: "", pending: false, error: null });
  });

  it("stores the typed email", () => {
    expect(loginReducer(initialState, { type: "emailChanged", email: "a@b.co" })).toMatchObject({ email: "a@b.co" });
  });

  it("marks a request as pending and clears the old error", () => {
    const failed = loginReducer(initialState, { type: "requestFailed", error: "boom" });
    const next = loginReducer(failed, { type: "requestStarted" });
    expect(next).toMatchObject({ pending: true, error: null });
  });

  it("moves to the code step with the generic notice, keeping the email", () => {
    const typed = loginReducer(initialState, { type: "emailChanged", email: "a@b.co" });
    const next = loginReducer(loginReducer(typed, { type: "requestStarted" }), { type: "requestSucceeded" });
    expect(next).toMatchObject({ step: "code", email: "a@b.co", pending: false, notice: MESSAGES.codeSent, error: null });
  });

  it("stays on the email step and shows the error when a request fails", () => {
    const started = loginReducer(initialState, { type: "requestStarted" });
    expect(loginReducer(started, { type: "requestFailed", error: MESSAGES.network })).toMatchObject({
      step: "email",
      pending: false,
      error: MESSAGES.network,
    });
  });
});
