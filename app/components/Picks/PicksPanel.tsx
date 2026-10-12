"use client";

import { useEffect, useRef, useState } from "react";
import type { PicksDraft } from "../../../lib/edit-picks";
import { viewFromPicks, type PicksView, type TeamOption } from "../../../lib/picks-view";
import { savePicks, type SaveOutcome } from "../../../lib/save-picks";
import EditButton from "./EditButton";
import PicksEditor from "./PicksEditor";
import PicksList from "./PicksList";
import styles from "./PicksPanel.module.css";

type Props = {
  view: PicksView;
  teams: readonly TeamOption[];
  /**
   * Required on purpose, so a dropped pass-through is a type error instead of
   * silently enabling the button. `null` means editing is allowed (window
   * open); a string disables the Edit button and is shown as the reason.
   */
  editDisabledReason: string | null;
  /** The season being edited; the PUT goes to `/api/submissions/:year`. */
  year: number;
  /**
   * The user's initial top 12. Required, like `editDisabledReason`, so a
   * dropped pass-through is a type error and not a silently skipped move check.
   */
  initialTop12: readonly number[];
};

/**
 * The My Picks content: the saved picks with an Edit button at the top right,
 * or the editor while editing. The editor is mounted only in edit mode, so
 * leaving edit mode discards the draft. A successful save shows the picks the
 * server returned (no refetch) and goes back to the saved view.
 */
export default function PicksPanel({ view, teams, editDisabledReason, year, initialTop12 }: Props) {
  const [editing, setEditing] = useState(false);
  // The prop is only the starting point: after a save, the PUT response is the source of truth.
  const [shownView, setShownView] = useState(view);
  const [savedNotice, setSavedNotice] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // After Cancel the editor is gone, so hand focus back to the button that opened it.
  useEffect(() => {
    if (!editing && wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  async function save(draft: PicksDraft): Promise<SaveOutcome> {
    const outcome = await savePicks({ draft, initialTop12, teams, year });
    if (outcome.kind === "saved") {
      setShownView(viewFromPicks(outcome.picks, teams));
      setSavedNotice(true);
      setEditing(false);
    }
    return outcome;
  }

  return (
    <>
      {/* Always mounted, so the message is announced when it appears. */}
      <p role="status" className={styles.notice}>
        {savedNotice && !editing && "Your picks were saved."}
      </p>
      {editing ? (
        <PicksEditor view={shownView} teams={teams} initialTop12={initialTop12} onCancel={() => setEditing(false)} onSave={save} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <EditButton
              ref={editButtonRef}
              disabledReason={editDisabledReason}
              onClick={() => {
                if (editDisabledReason) return;
                setSavedNotice(false);
                setEditing(true);
              }}
            />
          </div>
          <PicksList view={shownView} />
        </>
      )}
    </>
  );
}
