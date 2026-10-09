import { unstable_rethrow } from "next/navigation";
import { getSessionProfile } from "../../../lib/auth/profile";
import NavBar from "./NavBar";
import type { NavUser } from "./types";

/**
 * Reads the session on the server and hands the nav bar only what it shows.
 * Must render inside <Suspense>: the session read is request-time, so it
 * can't be part of the static shell.
 */
export default async function SessionNavBar() {
  return <NavBar user={await getNavUser()} />;
}

async function getNavUser(): Promise<NavUser | null> {
  try {
    const session = await getSessionProfile();
    if (!session.signedIn) return null;
    return { name: session.profile?.name ?? null };
  } catch (error) {
    // Let Next.js's own control-flow errors (e.g. request-time bailouts) through.
    unstable_rethrow(error);
    // A broken lookup must not take the whole page down: show logged out.
    console.error("nav: session lookup failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
