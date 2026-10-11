import { Suspense } from "react";
import { CURRENT_SEASON_YEAR } from "../../lib/seasons/current-season";
import MyPicksSection from "./MyPicksSection";
import styles from "./page.module.css";

// The shell reads nothing, so it prerenders; the picks load per request inside <Suspense>.
export default function MyPicksPage() {
  return (
    <main className={styles.container}>
      <h1>My Picks</h1>
      <Suspense fallback={<p role="status">Loading your picks…</p>}>
        <MyPicksSection year={CURRENT_SEASON_YEAR} />
      </Suspense>
    </main>
  );
}
