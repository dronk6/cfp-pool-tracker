import { after, NextResponse } from "next/server";
import { normalizeEmail, readJsonObject } from "../../../../lib/auth/input";
import { createSupabaseStatelessClient } from "../../../../lib/supabase/stateless";

const headers = { "Cache-Control": "no-store" };

/**
 * Sends a login code. The response must be identical, and equally fast,
 * whether or not the email belongs to a participant: Supabase sends the email
 * inline for registered users but fails immediately for unknown ones, and its
 * per-email rate limit only fires for registered emails. So the answer never
 * depends on Supabase's result, and the request runs after the response is
 * sent. Only malformed input gets a different answer, since that says nothing
 * about any account.
 */
export async function POST(request: Request) {
  const email = normalizeEmail((await readJsonObject(request)).email);
  if (!email) {
    return NextResponse.json({ success: false, error: "invalid-email" }, { status: 400, headers });
  }

  after(() => sendCode(email));

  return NextResponse.json({ success: true }, { headers });
}

async function sendCode(email: string) {
  try {
    // Cookie-less: signInWithOtp sets no session, and after() can't set cookies anyway.
    const supabase = createSupabaseStatelessClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) logFailure(error);
  } catch (error) {
    logFailure(error);
  }
}

// Logs the error's name, code and status, never the email address.
function logFailure(error: unknown) {
  const { code, status, name } = error as { code?: string; status?: number; name?: string };
  console.error("request-otp: Supabase signInWithOtp failed", { name, code, status });
}
