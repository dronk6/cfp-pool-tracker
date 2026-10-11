// The only place team logos may come from. next.config.ts reuses these same
// values for `images.remotePatterns`, so the render-time check and the image
// optimizer's allowlist can't drift apart.
export const TEAM_LOGO_HOST = "a.espncdn.com";
export const TEAM_LOGO_PATH_PREFIX = "/i/teamlogos/ncaa/500/";

const TEAM_LOGO_PATH = /^\/i\/teamlogos\/ncaa\/500\/[0-9]+\.png$/;

/**
 * `imageUrl` if it is an https ESPN team-logo URL, otherwise null. `teams` is
 * admin-seeded, but the page still refuses to load an image from anywhere else.
 */
export function allowedLogoSrc(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    const ok =
      url.protocol === "https:" &&
      url.hostname === TEAM_LOGO_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      TEAM_LOGO_PATH.test(url.pathname);
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}
