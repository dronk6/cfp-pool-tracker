"use client";

import { useEffect, useId, useMemo, useReducer, useRef } from "react";
import {
  championChoices,
  draftFromView,
  duplicateSlots,
  setChampion,
  setSlot,
  teamInSlot,
  teamLabel,
  type PicksDraft,
} from "../../../lib/edit-picks";
import { PLAYOFF_SIZE, type PicksView, type TeamChoice, type TeamOption } from "../../../lib/picks-view";
import TeamLogo from "../TeamLogo/TeamLogo";
import styles from "./PicksEditor.module.css";
import { EAGER_RANKS, PLAYOFF_HEADING, TIEBREAKERS_HEADING } from "./PicksList";
import TeamSelect from "./TeamSelect";

type Props = {
  /** The saved picks the editor starts from. */
  view: PicksView;
  teams: readonly TeamOption[];
  onCancel: () => void;
  /** Receives the draft. Without it, Save is disabled (saving arrives with PR 18). */
  onSave?: (draft: PicksDraft) => void;
};

type State = {
  draft: PicksDraft;
  /** The champion removed by the latest slot change, if that change dropped it from the top 12. */
  clearedChampionId: number | null;
};

type Action =
  | { type: "slot"; slot: number; teamId: number | null }
  | { type: "champion"; teamId: number | null };

function reducer(state: State, action: Action): State {
  if (action.type === "champion") {
    return { draft: setChampion(state.draft, action.teamId), clearedChampionId: null };
  }
  const { draft, championCleared } = setSlot(state.draft, action.slot, action.teamId);
  // The note only describes the change that just cleared the champion.
  return { draft, clearedChampionId: championCleared ? state.draft.championId : null };
}

function alsoInText(slots: number[]): string {
  return `Also in slot${slots.length > 1 ? "s" : ""} ${slots.join(", ")}`;
}

/**
 * The edit view: 15 numbered team choosers and a champion chooser, held in
 * local state until saved. Mount it only while editing; unmounting discards
 * the draft. Duplicates get a hint but never block anything; checking the
 * rules is the save step's job.
 */
export default function PicksEditor({ view, teams, onCancel, onSave }: Props) {
  const [{ draft, clearedChampionId }, dispatch] = useReducer(reducer, view, (initial) => ({
    draft: draftFromView(initial),
    clearedChampionId: null,
  }));
  const hintPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const logosById = useMemo(() => new Map(teams.map((team) => [team.id, team.imageUrl])), [teams]);

  // Entering edit mode swaps the page content, so move focus into it.
  useEffect(() => formRef.current?.focus(), []);

  const duplicates = duplicateSlots(draft);
  const championOptions: TeamChoice[] = championChoices(draft).map((id) => ({ id, name: teamLabel(teams, id) }));

  function renderSlot(slot: number) {
    const teamId = teamInSlot(draft, slot);
    const others = duplicates[slot];
    const hintId = `${hintPrefix}-hint-${slot}`;
    return (
      <li key={slot} className={styles.slot}>
        <TeamLogo imageUrl={teamId === null ? null : (logosById.get(teamId) ?? null)} eager={slot <= EAGER_RANKS} />
        <div className={styles.slotField}>
          <TeamSelect
            label={`Slot ${slot}`}
            value={teamId}
            teams={teams}
            describedBy={others ? hintId : undefined}
            onChange={(id) => dispatch({ type: "slot", slot, teamId: id })}
          />
          {others && (
            <span id={hintId} className={styles.hint}>
              {alsoInText(others)}
            </span>
          )}
        </div>
      </li>
    );
  }

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      aria-label="Edit your picks"
      className={styles.editor}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className={styles.championRow}>
        <span className={styles.championLabel} aria-hidden="true">
          Champion
        </span>
        <TeamSelect
          label="Champion"
          placeholder="Choose a champion"
          value={draft.championId}
          teams={championOptions}
          onChange={(teamId) => dispatch({ type: "champion", teamId })}
        />
      </div>
      <p role="status" className={styles.notice}>
        {clearedChampionId !== null &&
          `Champion cleared: ${teamLabel(teams, clearedChampionId)} is no longer in your top 12.`}
      </p>
      <section>
        <h2>{PLAYOFF_HEADING}</h2>
        <ol className={styles.list}>
          {Array.from({ length: PLAYOFF_SIZE }, (_, i) => renderSlot(i + 1))}
        </ol>
      </section>
      <section>
        <h2>{TIEBREAKERS_HEADING}</h2>
        <ol className={styles.list} start={PLAYOFF_SIZE + 1}>
          {Array.from({ length: draft.tiebreakers.length }, (_, i) => renderSlot(PLAYOFF_SIZE + i + 1))}
        </ol>
      </section>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!onSave}
          onClick={() => onSave?.(draft)}
        >
          Save
        </button>
      </div>
    </form>
  );
}
