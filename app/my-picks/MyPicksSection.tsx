import PicksPanel from "../components/Picks/PicksPanel";
import { loadMyPicks } from "./load-my-picks";

/**
 * The per-request part of the My Picks page. Must render inside <Suspense>:
 * it reads the session, so it can't be part of the static shell. Problems are
 * shown inline rather than by redirecting, because the proxy already redirects
 * signed-out visitors to /login and a second redirect here could loop.
 */
export default async function MyPicksSection({ year }: { year: number }) {
  const result = await loadMyPicks(year);

  switch (result.kind) {
    case "ok":
      return <PicksPanel view={result.view} teams={result.teams} editDisabledReason={result.editDisabledReason} />;
    case "signed-out":
      // A plain anchor (full page load) so the new session is picked up after login.
      return (
        <p>
          You&apos;re signed out. <a href="/login">Log in</a> to see your picks.
        </p>
      );
    case "no-submission":
      return <p>You don&apos;t have picks for the {year} season. If that&apos;s wrong, contact Tyler.</p>;
    case "error":
      return <p role="alert">Couldn&apos;t load your picks. Try reloading the page.</p>;
  }
}
