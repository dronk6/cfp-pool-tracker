"use client";

import { useEffect, useReducer, useRef, useSyncExternalStore, type FormEvent } from "react";
import { requestCode, verifyCode } from "./authApi";
import { initialState, loginReducer, MESSAGES, resendSecondsLeft } from "./loginFlow";
import { navigate } from "./navigate";
import styles from "./LoginForm.module.css";

const MY_PICKS_PATH = "/my-picks";
const subscribeToNothing = () => () => {};

export default function LoginForm() {
  const [state, dispatch] = useReducer(loginReducer, initialState);
  // False on the server and during hydration. Until the handlers are attached,
  // a native submit would send the email in the URL, so submit stays disabled.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const secondsLeft = resendSecondsLeft(state);
  const cooling = secondsLeft > 0;

  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => dispatch({ type: "ticked", at: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [cooling]);

  // Move focus when the step changes or a new code box appears, but not on first render.
  const focusKey = state.step === "code" ? `code-${state.requestedAt}` : "email";
  const lastFocusKey = useRef(focusKey);
  useEffect(() => {
    if (lastFocusKey.current === focusKey) return;
    lastFocusKey.current = focusKey;
    (state.step === "code" ? codeRef : emailRef).current?.focus();
  }, [focusKey, state.step]);

  // The input is disabled while a request is pending, which drops focus to the
  // page. After a failure, put it back so the next keystroke lands in the input.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !state.pending && state.error) {
      (state.step === "code" ? codeRef : emailRef).current?.focus();
    }
    wasPending.current = state.pending;
  }, [state.pending, state.error, state.step]);

  async function requestNewCode(email: string) {
    dispatch({ type: "started" });
    const result = await requestCode(email);
    if (result === "sent") dispatch({ type: "codeRequested", at: Date.now() });
    else dispatch({ type: "failed", error: result === "invalid-email" ? MESSAGES.invalidEmail : MESSAGES.network });
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (state.step !== "email" || state.pending) return;
    const email = state.email.trim();
    if (!email) {
      dispatch({ type: "failed", error: MESSAGES.invalidEmail });
      return;
    }
    await requestNewCode(email);
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (state.step !== "code" || state.pending) return;
    if (!state.code) {
      dispatch({ type: "failed", error: MESSAGES.codeMissing });
      return;
    }
    dispatch({ type: "started" });
    const result = await verifyCode(state.email.trim(), state.code);
    // On success the controls stay disabled until the new page loads.
    if (result === "ok") navigate(MY_PICKS_PATH);
    else dispatch({ type: "failed", error: result === "rejected" ? MESSAGES.codeRejected : MESSAGES.network });
  }

  async function resend() {
    if (state.step !== "code" || state.pending || cooling) return;
    await requestNewCode(state.email.trim());
  }

  return (
    <div className={styles.container}>
      <div aria-live="polite">{state.step === "code" && <p>{state.notice}</p>}</div>
      {state.step === "email" ? (
        <form method="post" noValidate onSubmit={submitEmail} className={styles.form}>
          <label htmlFor="login-email">Email</label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={state.email}
            disabled={state.pending}
            onChange={(event) => dispatch({ type: "emailChanged", email: event.target.value })}
            className={styles.input}
          />
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
          <button type="submit" disabled={!hydrated || state.pending} className={styles.button}>
            Send Code
          </button>
        </form>
      ) : (
        <form method="post" noValidate onSubmit={submitCode} className={styles.form}>
          <label htmlFor="login-code">Code</label>
          <input
            ref={codeRef}
            id="login-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={state.code}
            disabled={state.pending}
            onChange={(event) => dispatch({ type: "codeChanged", code: event.target.value })}
            className={styles.input}
          />
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
          <button type="submit" disabled={state.pending} className={styles.button}>
            Verify Code
          </button>
          <div className={styles.actions}>
            <button type="button" onClick={resend} disabled={state.pending || cooling} className={styles.button}>
              {cooling ? `Send a New Code (${secondsLeft}s)` : "Send a New Code"}
            </button>
            <button type="button" onClick={() => dispatch({ type: "cancelled" })} disabled={state.pending} className={styles.button}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
