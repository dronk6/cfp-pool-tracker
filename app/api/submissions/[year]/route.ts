import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionSubmission } from "../../../../lib/submissions/submission";
import { parseYear } from "../../../../lib/submissions/year";

const headers = { "Cache-Control": "no-store" };

const respond = (body: object, status: number) => NextResponse.json(body, { status, headers });

/**
 * The signed-in user's own submission for a year. The only request input read
 * is the `:year` path segment; the user comes from the verified session, so
 * query strings, headers and bodies can't select someone else's picks.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/submissions/[year]">) {
  try {
    const year = parseYear((await ctx.params).year);
    if (year === null) return respond({ error: "invalid-year" }, 400);

    const session = await getSessionSubmission(year);
    if (!session.signedIn) return respond({ error: "unauthenticated" }, 401);
    if (!session.submission) return respond({ error: "submission-not-found" }, 404);
    return respond(session.submission, 200);
  } catch (error) {
    // Next.js signals "this needs a real request" (e.g. while prerendering
    // during the build) with an error; swallowing it would bake in a 500.
    unstable_rethrow(error);
    console.error("submissions: unexpected failure", error instanceof Error ? error.name : "unknown");
    return respond({ error: "internal" }, 500);
  }
}
