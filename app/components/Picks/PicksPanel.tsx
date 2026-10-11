"use client";

import { useEffect, useRef, useState } from "react";
import type { PicksView, TeamOption } from "../../../lib/picks-view";
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
};

/**
 * The My Picks content: the saved picks with an Edit button at the top right,
 * or the editor while editing. The editor is mounted only in edit mode, so
 * leaving edit mode discards the draft.
 */
export default function PicksPanel({ view, teams, editDisabledReason }: Props) {
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // After Cancel the editor is gone, so hand focus back to the button that opened it.
  useEffect(() => {
    if (!editing && wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return <PicksEditor view={view} teams={teams} onCancel={() => setEditing(false)} />;
  }

  return (
    <>
      <div className={styles.toolbar}>
        <EditButton
          ref={editButtonRef}
          disabledReason={editDisabledReason}
          onClick={() => {
            if (!editDisabledReason) setEditing(true);
          }}
        />
      </div>
      <PicksList view={view} />
    </>
  );
}
