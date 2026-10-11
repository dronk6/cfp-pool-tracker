import type { PicksView } from "../../../lib/picks-view";
import TeamLogo from "../TeamLogo/TeamLogo";
import styles from "./PicksList.module.css";

// Logos for roughly the first screen load right away; the rest wait to scroll in.
const EAGER_RANKS = 8;

/**
 * A user's picks: optional champion, the 12 playoff teams, then the first
 * three out. Purely presentational (no hooks or handlers), so it can render
 * from a server or a client component.
 */
export default function PicksList({ view }: { view: PicksView }) {
  return (
    <div className={styles.container}>
      {view.champion && (
        <p className={styles.champion}>
          <span className={styles.championLabel}>Champion</span>
          <TeamLogo imageUrl={view.champion.imageUrl} eager />
          <span>{view.champion.name}</span>
        </p>
      )}
      <section>
        <h2>Playoff</h2>
        <ol className={styles.list}>
          {view.playoff.map((pick) => (
            <li key={pick.rank}>
              <TeamLogo imageUrl={pick.imageUrl} eager={pick.rank <= EAGER_RANKS} />
              <span className={styles.name}>{pick.name}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>First Three Out (Tiebreakers)</h2>
        <ol className={styles.list} start={view.playoff.length + 1}>
          {view.tiebreakers.map((pick) => (
            <li key={pick.rank}>
              <TeamLogo imageUrl={pick.imageUrl} />
              <span className={styles.name}>{pick.name}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
