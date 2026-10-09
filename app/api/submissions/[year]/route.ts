import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { readJsonObject } from "../../../../lib/auth/input";
import { parsePicksBody } from "../../../../lib/submissions/picks-body";
import { getSessionSubmission } from "../../../../lib/submissions/submission";
import { updateSessionSubmission } from "../../../../lib/submissions/update-submission";
import { parseYear } from "../../../../lib/submissions/year";

const headers = { "Cache-Control": "no-store" };

const isJson = (request: Request) =>
  (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/json";

const toIso = (value: string) => new Date(value).toISOString();

// Only a name or a PostgREST code is logged; messages can echo request data.
const errorLabel = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  return error instanceof Error ? error.name : "unknown";
};

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

/**
 * Saves the signed-in user's current picks for a year, inside the edit window.
 * The user comes from the verified session and the year from the path; the
 * body can only carry the three pick fields (anything else is a 400), so it
 * can't name another user or touch the initial picks. Pick contents are not
 * re-validated; the client does that.
 *
 * No CSRF token: the session cookies are SameSite=Lax so a cross-site request
 * arrives signed out, a form can't send PUT, and requiring a JSON content type
 * forces a CORS preflight for any cross-origin script.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/submissions/[year]">) {
  try {
    const year = parseYear((await ctx.params).year);
    if (year === null) return respond({ error: "invalid-year" }, 400);

    // Before the body is looked at, so signed-out callers learn nothing about it.
    if (!(await getCurrentUser())) return respond({ error: "unauthenticated" }, 401);

    if (!isJson(request)) return respond({ error: "unsupported-media-type" }, 415);
    const picks = parsePicksBody(await readJsonObject(request));
    if (!picks) return respond({ error: "invalid-body" }, 400);

    const result = await updateSessionSubmission(year, picks);
    switch (result.status) {
      case "unauthenticated":
        return respond({ error: "unauthenticated" }, 401);
      case "outside-window":
        return respond(
          {
            error: "outside-edit-window",
            editOpensAt: result.season ? toIso(result.season.editOpensAt) : null,
            editClosesAt: result.season ? toIso(result.season.editClosesAt) : null,
          },
          403,
        );
      case "invalid-champion":
        return respond({ error: "invalid-body" }, 400);
      case "not-found":
        return respond({ error: "submission-not-found" }, 404);
      case "updated":
        return respond(result.submission, 200);
    }
  } catch (error) {
    // Same as GET: let Next.js control-flow errors through.
    unstable_rethrow(error);
    console.error("submissions: unexpected failure", errorLabel(error));
    return respond({ error: "internal" }, 500);
  }
}
