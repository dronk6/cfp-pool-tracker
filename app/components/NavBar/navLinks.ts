export type NavLink = {
  href: string;
  label: string;
};

// Single source of truth for the nav bar's links, shared by the inline and
// side-panel layouts and by the page title shown next to the hamburger.
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/rules", label: "Rules" },
  { href: "/my-picks", label: "My Picks" },
];
