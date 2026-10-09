"use client";

import { useReducer, useSyncExternalStore, type FormEvent } from "react";
import { requestCode } from "./authApi";
import { initialState, loginReducer, MESSAGES } from "./loginFlow";
import styles from "./LoginForm.module.css";

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

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (state.step !== "email" || state.pending) return;
    const email = state.email.trim();
    if (!email) {
      dispatch({ type: "requestFailed", error: MESSAGES.invalidEmail });
      return;
    }
    dispatch({ type: "requestStarted" });
    const result = await requestCode(email);
    if (result === "sent") dispatch({ type: "requestSucceeded" });
    else dispatch({ type: "requestFailed", error: result === "invalid-email" ? MESSAGES.invalidEmail : MESSAGES.network });
  }

  return (
    <div className={styles.container}>
      <div aria-live="polite">
        {state.step === "code" && <p>{state.notice}</p>}
      </div>
      {state.step === "email" && (
        <form method="post" noValidate onSubmit={submitEmail} className={styles.form}>
          <label htmlFor="login-email">Email</label>
          <input
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
      )}
    </div>
  );
}
