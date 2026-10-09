/**
 * A full page load, not a client-side route change, so that server-rendered
 * parts of the page (such as the nav bar) pick up the new session cookies.
 * Kept in its own module so tests can replace it.
 */
export function navigate(path: string): void {
  window.location.replace(path);
}
