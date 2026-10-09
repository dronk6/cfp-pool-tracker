import styles from "./page.module.css";

// Year-agnostic on purpose: describe the schedule in weeks of the season, never dates.
export default function RulesPage() {
  return (
    <main className={styles.container}>
      <h1>Rules</h1>

      <section>
        <h2>Initial Picks</h2>
        <p>
          Before the first kickoff of the season (12 pm kickoff on the opening Saturday), Tyler needs your 12 playoff
          teams, ranked by seed, plus your first 3 out (seeds 13-15), in order. Tyler enters your initial picks for you.
        </p>
        <ul>
          <li>
            Your top 12 must include at least one G6 team. The playoff gives auto bids to the top 4 conference
            champions and the highest-ranked G6 champion, so a G6 team is a requirement, not just context. Notre Dame
            counts as a power team, not a G6 team.
          </li>
          <li>No team can appear twice, and none of your first 3 out can also be in your top 12.</li>
        </ul>
      </section>

      <section>
        <h2>Scoring</h2>
        <ul>
          <li>1 point per correct team</li>
          <li>1 point for correct seed</li>
          <li>3 points for picking the correct champion</li>
        </ul>
        <p>The first 3 out are the tiebreaker.</p>
      </section>
    </main>
  );
}
