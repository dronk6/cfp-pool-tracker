export type RequestCodeResult = "sent" | "invalid-email" | "network-error";
export type VerifyCodeResult = "ok" | "rejected" | "network-error";

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/**
 * Only a 400 is reported as a bad email. Every other status counts as "sent"
 * on purpose, so the UI can't tell a registered email from an unregistered one
 * (or a rate-limited one), and the body is never read.
 */
export async function requestCode(email: string): Promise<RequestCodeResult> {
  try {
    const response = await postJson("/api/auth/request-otp", { email });
    return response.status === 400 ? "invalid-email" : "sent";
  } catch {
    return "network-error";
  }
}

/** Any non-2xx answer is "rejected"; the server gives no reason, and neither do we. */
export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  try {
    const response = await postJson("/api/auth/verify-otp", { email, otp: code });
    return response.ok ? "ok" : "rejected";
  } catch {
    return "network-error";
  }
}
