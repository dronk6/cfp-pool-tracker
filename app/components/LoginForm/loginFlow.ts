export const RESEND_COOLDOWN_MS = 30_000;

export const MESSAGES = {
  codeSent: "If that email is registered, a code is on its way.",
  invalidEmail: "Enter a valid email address.",
  network: "Couldn't reach the server. Check your connection and try again.",
  codeMissing: "Enter the code from your email.",
  codeRejected: "That code didn't work. Check it, or send a new code.",
} as const;

type EmailStep = { step: "email"; email: string; pending: boolean; error: string | null };
type CodeStep = {
  step: "code";
  email: string;
  code: string;
  pending: boolean;
  notice: string;
  error: string | null;
  /** When the last code was requested, and the latest clock reading (both ms since epoch). */
  requestedAt: number;
  now: number;
};
export type LoginState = EmailStep | CodeStep;

export type LoginAction =
  | { type: "emailChanged"; email: string }
  | { type: "codeChanged"; code: string }
  | { type: "started" }
  | { type: "failed"; error: string }
  | { type: "codeRequested"; at: number }
  | { type: "ticked"; at: number }
  | { type: "cancelled" };

export const initialState: LoginState = { step: "email", email: "", pending: false, error: null };

/** Whole seconds until "Send a New Code" is allowed again; 0 once it is. */
export function resendSecondsLeft(state: LoginState): number {
  if (state.step !== "code") return 0;
  return Math.max(0, Math.ceil((state.requestedAt + RESEND_COOLDOWN_MS - state.now) / 1000));
}

export function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case "emailChanged":
      return state.step === "email" ? { ...state, email: action.email } : state;
    case "codeChanged":
      // The code length is a Supabase setting, so only the digits are enforced here.
      return state.step === "code" ? { ...state, code: action.code.replace(/\D/g, "") } : state;
    case "started":
      return { ...state, pending: true, error: null };
    case "failed":
      return { ...state, pending: false, error: action.error };
    case "codeRequested":
      // Also used for a resend: a fresh notice, an empty code box and a new timer.
      return {
        step: "code",
        email: state.email,
        code: "",
        pending: false,
        notice: MESSAGES.codeSent,
        error: null,
        requestedAt: action.at,
        now: action.at,
      };
    case "ticked":
      return state.step === "code" ? { ...state, now: action.at } : state;
    case "cancelled":
      return { step: "email", email: state.email, pending: false, error: null };
  }
}
