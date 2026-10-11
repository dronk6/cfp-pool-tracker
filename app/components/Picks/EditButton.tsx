"use client";

import { useId, type Ref } from "react";
import styles from "./EditButton.module.css";

type Props = {
  /**
   * When set, the button is unavailable and this text says why. It uses
   * aria-disabled rather than `disabled` so keyboard and screen-reader users
   * can still reach the button and hear the reason.
   */
  disabledReason?: string | null;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
};

/** The "Edit" button for the My Picks page, with the reason shown when it can't be used. */
export default function EditButton({ disabledReason, onClick, ref }: Props) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason);
  return (
    <div className={styles.container}>
      <button
        ref={ref}
        type="button"
        className={styles.button}
        aria-disabled={disabled ? "true" : undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        Edit
      </button>
      {disabled && (
        <p id={reasonId} className={styles.reason}>
          {disabledReason}
        </p>
      )}
    </div>
  );
}
