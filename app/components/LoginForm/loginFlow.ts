export const MESSAGES = {
  codeSent: "If that email is registered, a code is on its way.",
  invalidEmail: "Enter a valid email address.",
  network: "Couldn't reach the server. Check your connection and try again.",
} as const;

type EmailStep = { step: "email"; email: string; pending: boolean; error: string | null };
type CodeStep = { step: "code"; email: string; pending: boolean; notice: string; error: string | null };
export type LoginState = EmailStep | CodeStep;

export type LoginAction =
  | { type: "emailChanged"; email: string }
  | { type: "requestStarted" }
  | { type: "requestSucceeded" }
  | { type: "requestFailed"; error: string };

export const initialState: LoginState = { step: "email", email: "", pending: false, error: null };

export function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case "emailChanged":
      return state.step === "email" ? { ...state, email: action.email } : state;
    case "requestStarted":
      return { ...state, pending: true, error: null };
    case "requestSucceeded":
      return { step: "code", email: state.email, pending: false, notice: MESSAGES.codeSent, error: null };
    case "requestFailed":
      return { ...state, pending: false, error: action.error };
  }
}
