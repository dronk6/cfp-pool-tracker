"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
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
import { describeViolations } from "../../../lib/violation-display";
import type { SaveOutcome } from "../../../lib/save-picks";
import { PLAYOFF_SIZE, type PicksView, type TeamChoice, type TeamOption } from "../../../lib/picks-view";
import StatusCue from "../StatusCue/StatusCue";
import TeamLogo from "../TeamLogo/TeamLogo";
import styles from "./PicksEditor.module.css";
import { EAGER_RANKS, PLAYOFF_HEADING, TIEBREAKERS_HEADING } from "./PicksList";
import TeamSelect from "./TeamSelect";

type Props = {
  /** The saved picks the editor starts from. */
  view: PicksView;
  teams: readonly TeamOption[];
  /**
   * The user's top 12 as first submitted, one team id per slot. Slots whose
   * current choice differs get an "Originally" hint. Never the previous save.
   */
  initialTop12: readonly number[];
  onCancel: () => void;
  /**
   * Validates and saves the draft. The editor shows any `invalid` or `failed`
   * outcome; on `saved` it does nothing, because the parent unmounts it.
   * Without it, Save is disabled.
   */
  onSave?: (draft: PicksDraft) => Promise<SaveOutcome>;
};

/** What the summary above the buttons shows. A fresh object per save, so the same problem refocuses it. */
type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "problems"; lines: string[] }
  | { kind: "error"; message: string; loginLink: boolean };

const IDLE: SaveStatus = { kind: "idle" };
const UNEXPECTED_FAILURE = "Something went wrong saving your picks. Try again or reload to check.";

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
export default function PicksEditor({ view, teams, initialTop12, onCancel, onSave }: Props) {
  const [{ draft, clearedChampionId }, dispatch] = useReducer(reducer, view, (initial) => ({
    draft: draftFromView(initial),
    clearedChampionId: null,
  }));
  const hintPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<SaveStatus>(IDLE);
  // Set synchronously: state updates are async, so a fast second click would still see "idle".
  const saveInFlight = useRef(false);
  const summaryRef = useRef<HTMLElement>(null);
  const summaryId = useId();
  const logosById = useMemo(() => new Map(teams.map((team) => [team.id, team.imageUrl])), [teams]);

  // Entering edit mode swaps the page content, so move focus into it.
  useEffect(() => formRef.current?.focus(), []);

  // Move focus to the problems so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (status.kind === "problems" || status.kind === "error") summaryRef.current?.focus();
  }, [status]);

  // Listed slot numbers go stale on any edit, so a validation summary is dropped then.
  // A server error stays until the next Save, since an edit doesn't change what happened.
  function edit(action: Action) {
    if (status.kind === "problems") setStatus(IDLE);
    dispatch(action);
  }

  async function handleSave() {
    if (!onSave || saveInFlight.current) return;
    saveInFlight.current = true;
    setStatus({ kind: "saving" });
    let outcome: SaveOutcome;
    try {
      outcome = await onSave(draft);
    } catch {
      outcome = { kind: "failed", message: UNEXPECTED_FAILURE };
    }
    saveInFlight.current = false;
    if (outcome.kind === "saved") {
      // The parent normally unmounts the editor now; if it doesn't, don't leave the fields locked.
      setStatus(IDLE);
      return;
    }
    setStatus(
      outcome.kind === "invalid"
        ? { kind: "problems", lines: describeViolations(outcome.violations, draft) }
        : { kind: "error", message: outcome.message, loginLink: outcome.loginLink === true },
    );
  }

  const saving = status.kind === "saving";
  const duplicates = duplicateSlots(draft);
  const championOptions: TeamChoice[] = championChoices(draft).map((id) => ({ id, name: teamLabel(teams, id) }));

  function renderSlot(slot: number) {
    const teamId = teamInSlot(draft, slot);
    const others = duplicates[slot];
    const hintId = `${hintPrefix}-hint-${slot}`;
    const originalId = `${hintPrefix}-original-${slot}`;
    // Slots 13-15 have no hint; a missing entry (the database doesn't fix the array length) has nothing to show.
    const originalTeamId = slot <= PLAYOFF_SIZE ? initialTop12[slot - 1] : undefined;
    const showOriginal = originalTeamId !== undefined && originalTeamId !== teamId;
    // The TeamSelect prop is a single id string, so pass the space-separated list aria-describedby accepts.
    const describedBy = [showOriginal && originalId, others && hintId].filter(Boolean).join(" ") || undefined;
    return (
      <li key={slot} className={styles.slot}>
        <TeamLogo imageUrl={teamId === null ? null : (logosById.get(teamId) ?? null)} eager={slot <= EAGER_RANKS} />
        <div className={styles.slotField}>
          <TeamSelect
            label={`Slot ${slot}`}
            value={teamId}
            teams={teams}
            describedBy={describedBy}
            onChange={(id) => edit({ type: "slot", slot, teamId: id })}
          />
          {showOriginal && (
            <span id={originalId} className={styles.originalHint}>
              Originally: {teamLabel(teams, originalTeamId)}
            </span>
          )}
          {others && (
            <span id={hintId} className={styles.hint}>
              <StatusCue kind="warning" />
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
      {/* Edits during a request would be silently lost when the save succeeds. */}
      <fieldset className={styles.fields} disabled={saving}>
        <div className={styles.championRow}>
          <span className={styles.championLabel} aria-hidden="true">
            Champion
          </span>
          <TeamSelect
            label="Champion"
            placeholder="Choose a champion"
            value={draft.championId}
            teams={championOptions}
            onChange={(teamId) => edit({ type: "champion", teamId })}
          />
        </div>
        <p role="status" className={styles.notice}>
          {saving
            ? "Saving your picks…"
            : clearedChampionId !== null &&
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
      </fieldset>
      {(status.kind === "problems" || status.kind === "error") && (
        <section
          ref={summaryRef}
          tabIndex={-1}
          className={styles.summary}
          aria-labelledby={status.kind === "problems" ? `${summaryId}-title` : `${summaryId}-title ${summaryId}-text`}
          aria-describedby={status.kind === "problems" ? `${summaryId}-list` : undefined}
        >
          {status.kind === "problems" ? (
            <>
              <h2 id={`${summaryId}-title`}>
                <StatusCue kind="error" />
                Fix these before saving
              </h2>
              <ul id={`${summaryId}-list`}>
                {status.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 id={`${summaryId}-title`}>
                <StatusCue kind="error" />
                Your picks weren&apos;t saved
              </h2>
              <p id={`${summaryId}-text`}>{status.message}</p>
              {status.loginLink && (
                // A plain anchor (full page load) so the new session is picked up after login.
                <p>
                  <a href="/login">Log in</a>
                </p>
              )}
            </>
          )}
        </section>
      )}
      {/* aria-disabled, not disabled: a focused disabled button would drop focus mid-save. */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-disabled={saving ? "true" : undefined}
          onClick={() => {
            if (!saving) onCancel();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          disabled={!onSave}
          aria-disabled={saving ? "true" : undefined}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
