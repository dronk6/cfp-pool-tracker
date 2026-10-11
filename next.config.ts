import type { NextConfig } from "next";
import { TEAM_LOGO_HOST, TEAM_LOGO_PATH_PREFIX } from "./lib/team-logo";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // AGENTS.md is hand-maintained; its addenda carry the bundled-docs rule.
  agentRules: false,
  images: {
    // Only ESPN's team logos. `port` and `search` are set because an omitted one matches any
    // value, which would let /_next/image be asked for arbitrary ports and query strings.
    // The optimizer shrinks the 500px originals (30-80 KB) to a few KB at the size we show.
    remotePatterns: [
      { protocol: "https", hostname: TEAM_LOGO_HOST, pathname: `${TEAM_LOGO_PATH_PREFIX}*.png`, port: "", search: "" },
    ],
    // ESPN sends max-age of about two minutes; logos change at most yearly.
    minimumCacheTTL: 60 * 60 * 24,
  },
};

export default nextConfig;
