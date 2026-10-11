import { useId } from "react";
import type { TeamOption } from "../../../lib/picks-view";
import { teamLabel } from "../../../lib/edit-picks";
import styles from "./TeamSelect.module.css";

type Props = {
  /** Names the control for assistive technology. Rendered visually hidden. */
  label: string;
  /** The chosen team id, or null for a blank slot. */
  value: number | null;
  /** The teams to choose from, in the order to show them. */
  teams: readonly TeamOption[];
  /** Text for the blank option, which maps to `null`. */
  placeholder?: string;
  /** Id of an element that describes this control (e.g. a duplicate hint). */
  describedBy?: string;
  onChange: (teamId: number | null) => void;
};

/**
 * One team chooser. This is the only place that knows the control is a native
 * <select>, so an autocomplete can replace this file alone. A `value` that
 * isn't in `teams` (an id the database no longer lists) stays selectable as
 * "Unknown team (#id)" in this control only.
 */
export default function TeamSelect({
  label,
  value,
  teams,
  placeholder = "Choose a team",
  describedBy,
  onChange,
}: Props) {
  const id = useId();
  const isUnknown = value !== null && !teams.some((team) => team.id === value);
  return (
    <>
      <label htmlFor={id} className={styles.visuallyHidden}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value === null ? "" : String(value)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      >
        <option value="">{placeholder}</option>
        {isUnknown && <option value={String(value)}>{teamLabel(teams, value)}</option>}
        {teams.map((team) => (
          <option key={team.id} value={String(team.id)}>
            {team.name}
          </option>
        ))}
      </select>
    </>
  );
}
