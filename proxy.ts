import type { NextRequest } from "next/server";
import { gateRequest } from "./lib/auth/route-gate";
import { updateSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  return gateRequest(request, user, response);
}

export const config = {
  // Everything except static assets and image optimisation. Includes /api.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
