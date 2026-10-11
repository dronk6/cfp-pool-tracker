import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getTeams } from "../../../lib/teams";

const headers = { "Cache-Control": "no-store" };

const respond = (body: object, status: number) => NextResponse.json(body, { status, headers });

/**
 * The reference list of teams, ordered by name (the database's ordering), for any signed-in user. Takes
 * no request argument on purpose: nothing from the request but the verified
 * session cookie is read.
 */
export async function GET() {
  try {
    const session = await getTeams();
    if (!session.signedIn) return respond({ error: "unauthenticated" }, 401);
    return respond(session.teams, 200);
  } catch (error) {
    // Next.js signals "this needs a real request" (e.g. while prerendering
    // during the build) with an error; swallowing it would bake in a 500.
    unstable_rethrow(error);
    console.error("teams: unexpected failure", error instanceof Error ? error.name : "unknown");
    return respond({ error: "internal" }, 500);
  }
}
