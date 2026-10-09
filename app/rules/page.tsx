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

      <section>
        <h2>Week 6/7 Adjustment</h2>
        <p>
          After week 6 and before week 7, you get to make <strong>3 moves</strong> to your top 12 and you must pick a
          national champion. The pool site shows the exact window for the season. Picks can be edited on the site during
          that window; nobody has to text Tyler.
        </p>
        <p>
          You can save as many times as you like inside the window. Your moves are always counted against your{" "}
          <strong>initial</strong> picks, not your last save.
        </p>

        <h3>What counts as a move (top 12 only)</h3>
        <ul>
          <li>
            <strong>Replacing a team:</strong> removing a team from your top 12 and putting a new team in its place
            counts as <strong>ONE</strong> move per team. Promoting a team from your first 3 out into the top 12 is a
            replacement like any other.
          </li>
          <li>
            <strong>Reordering the top 12:</strong> changing the order of the teams already in your list counts as{" "}
            <strong>ONE</strong> move in total, no matter how many teams change position.
            <ul>
              <li>
                If a new team goes into a different slot than the team it replaced, the teams around it shift, so that
                counts as a replacement <strong>plus</strong> the reorder.
              </li>
            </ul>
          </li>
        </ul>
        <p>
          Example: say I have Michigan and they SUCK (as expected). I can drop them completely and put a new team in
          their slot (1 move), or drop them to the first 3 out and put a different team in their slot (still 1 move).
        </p>

        <h3>What does NOT count as a move</h3>
        <ul>
          <li>
            Any change to your first 3 out, including adding, removing, or reordering teams there. The only restrictions
            are that you still have 3 different teams and none of them are in your top 12.
          </li>
          <li>Choosing your national champion.</li>
        </ul>

        <h3>Champion</h3>
        <ul>
          <li>
            You <strong>must</strong> pick a national champion as part of your adjustment, or your update is not valid.
          </li>
          <li>Your champion must be one of the 12 teams in your updated top 12.</li>
        </ul>

        <h3>An update is valid only if</h3>
        <ol>
          <li>You have 12 different teams in your top 12 and 3 different teams in your first 3 out, with no overlap.</li>
          <li>
            Your top 12 includes at least one team from each Power Four conference (ACC, Big Ten, Big 12 and SEC) and at
            least one G6 team. Notre Dame is independent, so it doesn&apos;t count toward any Power Four conference.
          </li>
          <li>You have chosen a champion who is in your top 12.</li>
          <li>You have used no more than 3 moves compared with your initial picks.</li>
        </ol>
        <p>If an update is not valid, your previous picks stay in place.</p>

        <h3>Examples</h3>
        <p>Each example is counted against your initial picks.</p>
        <ul>
          <li>Replace one team with a new team in the same slot: 1 move.</li>
          <li>Reorder any number of the teams you are keeping: 1 move in total.</li>
          <li>Replace a team in its slot and swap two other teams: 2 moves.</li>
          <li>
            Replace a team but put the new team in a different slot than the one it replaced: 2 moves (1 replacement plus
            1 reorder).
          </li>
          <li>Replace three different teams, each in its own slot: 3 moves.</li>
          <li>Replace three teams in their slots and also reorder anyone: 4 moves, which is not valid.</li>
          <li>
            Drop a team to your first 3 out and move a first-out team into its slot: 1 move, since changes to your first
            3 out are free.
          </li>
          <li>Reorder only your first 3 out: 0 moves.</li>
        </ul>
      </section>

      <section>
        <h2>After the Adjustment</h2>
        <p>After the adjustment window closes, everyone&apos;s picks are shared so you can strategize.</p>
      </section>
    </main>
  );
}
