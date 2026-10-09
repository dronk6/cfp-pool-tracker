"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import AccountMenu from "./AccountMenu";
import styles from "./NavBar.module.css";
import { NAV_LINKS } from "./navLinks";
import type { NavUser } from "./types";

export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavBarProps = {
  /**
   * undefined: not known yet (the session is still loading), so the actions
   * slot stays empty rather than flashing "Log In" at a signed-in user.
   * null: signed out.
   */
  user?: NavUser | null;
};

export default function NavBar({ user }: NavBarProps) {
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Remember the path the panel was opened on so that navigating (including
  // browser back/forward) closes it. Resetting during render, rather than in
  // an effect, avoids a frame with a stale open panel.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  if (openedAt !== null && openedAt !== pathname) setOpenedAt(null);
  const isOpen = openedAt === pathname;

  const currentTitle = NAV_LINKS.find(({ href }) => isActivePath(href, pathname))?.label;

  function closePanel() {
    setOpenedAt(null);
  }

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAt(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Move focus into the panel when it opens and back to the button when it
  // closes, so keyboard users never lose their place.
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.querySelector("a")?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const renderLinks = (onClick?: () => void) =>
    NAV_LINKS.map(({ href, label }) => (
      <li key={href}>
        <Link
          href={href}
          className={styles.link}
          aria-current={isActivePath(href, pathname) ? "page" : undefined}
          onClick={onClick}
        >
          {label}
        </Link>
      </li>
    ));

  return (
    <header className={styles.header}>
      <nav aria-label="Main" className={styles.nav}>
        <div className={styles.mobileBar}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.hamburger}
            aria-label="Main menu"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setOpenedAt(isOpen ? null : pathname)}
          >
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </button>
          {currentTitle && <span className={styles.title}>{currentTitle}</span>}
        </div>

        <ul className={styles.inlineLinks}>{renderLinks()}</ul>

        <div className={styles.actions}>
          {user === null && (
            <Link
              href="/login"
              className={styles.link}
              aria-current={isActivePath("/login", pathname) ? "page" : undefined}
            >
              Log In
            </Link>
          )}
          {user && <AccountMenu name={user.name} />}
        </div>

        <div
          data-testid="nav-backdrop"
          className={`${styles.backdrop} ${isOpen ? styles.backdropOpen : ""}`}
          onClick={closePanel}
        />
        <div
          id={panelId}
          ref={panelRef}
          className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
          inert={!isOpen}
        >
          <ul className={styles.panelLinks}>{renderLinks(closePanel)}</ul>
        </div>
      </nav>
    </header>
  );
}
