import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // AGENTS.md is hand-maintained; its addenda carry the bundled-docs rule.
  agentRules: false,
};

export default nextConfig;
