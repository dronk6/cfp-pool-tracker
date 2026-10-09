import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const headers = { "Cache-Control": "no-store" };

/**
 * Signs out this device only; the user's other sessions stay valid. Safe to
 * repeat: signing out when already signed out succeeds.
 *
 * No CSRF token: the session cookies are SameSite=Lax, which browsers don't
 * send on cross-site POSTs, and the route accepts nothing but POST.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("logout: Supabase signOut failed", { code: error.code, status: error.status });
      return NextResponse.json({ success: false }, { status: 500, headers });
    }
  } catch (error) {
    console.error("logout: unexpected failure", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ success: false }, { status: 500, headers });
  }

  // The cookie adapter in the server client has cleared the session cookies.
  return NextResponse.json({ success: true }, { headers });
}
