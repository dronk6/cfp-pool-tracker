const MAX_EMAIL_LENGTH = 254;
// Deliberately loose: Supabase and the mail server are the real judges. This
// only rejects input that is obviously not an address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lowercased email, or null if it isn't plausibly an email address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** The request's JSON body if it is an object, otherwise an empty object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
