import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.container}>
      <h1>Home</h1>

      <section>
        <h2>Welcome</h2>
        <p>
          Welcome to the CFP Pool Tracker, the home of Tyler&apos;s College Football Playoff picks pool. Before the
          season, everyone picks the 12 teams they think will make the playoff, in seed order, plus three first-out
          teams as tiebreakers. This site lets you view your picks and, during a short window in October, adjust them
          and choose your national champion. No more texting Tyler. See the <Link href="/rules">Rules</Link> for how
          scoring and adjustments work.
        </p>
      </section>

      <section>
        <h2>Viewing and Modifying Picks</h2>
        <p>
          To see your picks, <Link href="/login">log in</Link> with the email address you gave Tyler. We&apos;ll email
          you a one-time code; enter it and you&apos;ll land on <Link href="/my-picks">My Picks</Link>. If you
          can&apos;t log in, your email may not be on file — ask Tyler.
        </p>
        {/* The window below is specific to the 2026 season; update it each year. */}
        <p>
          Picks can be modified from midnight ET going into October 11 until 12 pm ET on October 17, 2026 (between weeks
          6 and 7 of the season). During that window, press Edit on My Picks to make up to three moves to your top 12
          and choose your champion. The site checks your update against the rules and tells you what to fix; if an
          update isn&apos;t valid, your previous picks stay in place. Outside the window, your picks are view-only.
        </p>
      </section>

      <section>
        <h2>Questions?</h2>
        <p>Ask Tyler.</p>
      </section>
    </main>
  );
}
