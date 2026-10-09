"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./AccountMenu.module.css";
import { hardNavigate } from "./navigate";

export default function AccountMenu({ name }: { name: string | null }) {
  const pathname = usePathname();
  const popupId = useId();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const logOutRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // Same pattern as NavBar: remember where the menu was opened so that any
  // route change closes it, without a render showing a stale open menu.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  if (openedAt !== null && openedAt !== pathname) setOpenedAt(null);
  const isOpen = openedAt === pathname;

  function closeAndRestoreFocus() {
    setOpenedAt(null);
    setFailed(false);
    avatarRef.current?.focus();
  }

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  // The disabled Log Out button dropped focus; put it back once the commit
  // has re-enabled it (focusing earlier would be a no-op on a disabled button).
  useEffect(() => {
    if (failed) logOutRef.current?.focus();
  }, [failed]);

  useEffect(() => {
    if (!isOpen || pending) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAndRestoreFocus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedAt(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, pending]);

  async function logOut() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (response.ok) {
        // Stay in the pending state while the page reloads.
        hardNavigate("/");
        return;
      }
    } catch {
      // Network failure: handled like a rejected response.
    }
    setPending(false);
    setFailed(true);
  }

  // Focus moving to another element closes the menu. A null relatedTarget
  // (clicking static text, leaving the window) is left to the pointerdown
  // handler, so it doesn't close the menu spuriously.
  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (!pending && next && !event.currentTarget.contains(next)) setOpenedAt(null);
  }

  return (
    <div ref={rootRef} className={styles.root} onBlur={onBlur}>
      <button
        ref={avatarRef}
        type="button"
        className={styles.avatar}
        aria-label={name ? `Account menu for ${name}` : "Account menu"}
        aria-expanded={isOpen}
        aria-controls={popupId}
        onClick={() => {
          setFailed(false);
          setOpenedAt(isOpen ? null : pathname);
        }}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </button>

      <div id={popupId} role="group" aria-labelledby={headingId} className={styles.popup} hidden={!isOpen}>
        <p id={headingId} className={styles.question}>
          Are you sure?
        </p>
        <div className={styles.buttons}>
          <button ref={logOutRef} type="button" className={styles.logOut} disabled={pending} onClick={logOut}>
            {pending ? "Logging out…" : "Log Out"}
          </button>
          <button ref={cancelRef} type="button" className={styles.cancel} disabled={pending} onClick={closeAndRestoreFocus}>
            Cancel
          </button>
        </div>
        {failed && (
          <p role="alert" className={styles.error}>
            Couldn&apos;t log out. Try again.
          </p>
        )}
      </div>
    </div>
  );
}
