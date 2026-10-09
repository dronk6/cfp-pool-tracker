import { NextResponse } from "next/server";
import { normalizeEmail, readJsonObject } from "../../../../lib/auth/input";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const headers = { "Cache-Control": "no-store" };
// The code length is a Supabase setting, so only sanity-check the shape here.
const MAX_CODE_LENGTH = 64;

const failure = () => NextResponse.json({ success: false }, { status: 401, headers });

/** Exchanges an emailed code for a session; every failure looks the same. */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const email = normalizeEmail(body.email);
  const token = body.otp;
  if (!email || typeof token !== "string" || token.length > MAX_CODE_LENGTH || !/^\d+$/.test(token)) {
    return failure();
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      console.error("verify-otp: Supabase verifyOtp failed", { code: error.code, status: error.status });
      return failure();
    }
  } catch (error) {
    console.error("verify-otp: unexpected failure", error instanceof Error ? error.name : "unknown");
    return failure();
  }

  // The session cookies were set by the server client's cookie adapter.
  return NextResponse.json({ success: true }, { headers });
}
