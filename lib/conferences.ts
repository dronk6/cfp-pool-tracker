/**
 * The power conferences: the single source of truth for both `is_power_conf`
 * (see scripts/seed-teams/teams.ts) and the Power Four rule in validatePicks.
 * The order is the order used when listing them in messages.
 */
export const POWER_CONFERENCES: readonly string[] = ["ACC", "Big Ten", "Big 12", "SEC"];
