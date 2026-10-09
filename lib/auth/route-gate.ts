import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/login";
const MY_PICKS_PATH = "/my-picks";

/**
 * Decodes %XX escapes one at a time, so a stray malformed escape elsewhere in
 * the path can't stop `/%6dy-picks` from being recognised as `/my-picks`.
 */
function decodePath(pathname: string): string {
  return pathname.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * True for the My Picks page and anything under it, including framework
 * variants such as `/my-picks.rsc`, but not look-alikes such as `/my-picksx`.
 * `/api` is never gated here: route handlers check the session themselves.
 */
export function requiresLogin(pathname: string): boolean {
  return /^\/my-picks(?:[/.]|$)/.test(decodePath(pathname));
}

export function isLoginPage(pathname: string): boolean {
  return /^\/login(?:\/|$)/.test(decodePath(pathname));
}

function redirectTo(request: NextRequest, pathname: string, sessionResponse: NextResponse): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Keep any refreshed session cookies, or the user would be signed out by the redirect.
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  // The answer depends on the visitor's cookies, so it must never be shared or reused.
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

/**
 * Decides what to do with a request once the session is known. `user` is null
 * both when signed out and when the session could not be checked, so a gated
 * page fails closed while public pages and `/login` stay reachable.
 */
export function gateRequest(request: NextRequest, user: User | null, sessionResponse: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  if (!user && requiresLogin(pathname)) return redirectTo(request, LOGIN_PATH, sessionResponse);
  if (user && isLoginPage(pathname)) return redirectTo(request, MY_PICKS_PATH, sessionResponse);
  return sessionResponse;
}
