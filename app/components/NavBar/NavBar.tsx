"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./NavBar.module.css";
import { NAV_LINKS } from "./navLinks";

export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <nav aria-label="Main" className={styles.nav}>
        <ul className={styles.inlineLinks}>
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={styles.link}
                aria-current={isActivePath(href, pathname) ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        {/* Reserved for Log In / avatar / Log Out (Authentication milestone). */}
        <div className={styles.actions} />
      </nav>
    </header>
  );
}
