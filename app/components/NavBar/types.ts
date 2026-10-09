/**
 * The only thing the nav bar learns about the signed-in user. Deliberately
 * not the User object, id or email: this crosses into client code.
 */
export type NavUser = { name: string | null };
