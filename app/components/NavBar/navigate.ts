/**
 * Full page load, not a client-side transition: after logging out the whole
 * page (including server-rendered nav state) must be rebuilt without the
 * session. A module of its own so tests can mock it; jsdom can't navigate.
 */
export function hardNavigate(url: string) {
  window.location.assign(url);
}
