import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionProfile } from "../../../lib/auth/profile";

const headers = { "Cache-Control": "no-store" };

const respond = (body: object, status: number) => NextResponse.json(body, { status, headers });

/**
 * The signed-in user's name and email. Takes no request argument on purpose:
 * the user comes from the verified session cookie and nothing else.
 */
export async function GET() {
  try {
    const session = await getSessionProfile();
    if (!session.signedIn) return respond({ error: "unauthenticated" }, 401);
    if (!session.profile) return respond({ error: "profile-not-found" }, 404);
    return respond({ name: session.profile.name, email: session.profile.email }, 200);
  } catch (error) {
    // Next.js signals "this needs a real request" (e.g. while prerendering
    // during the build) with an error; swallowing it would bake in a 500.
    unstable_rethrow(error);
    console.error("me: unexpected failure", error instanceof Error ? error.name : "unknown");
    return respond({ error: "internal" }, 500);
  }
}
