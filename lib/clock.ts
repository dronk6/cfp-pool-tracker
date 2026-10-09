/**
 * The server's current time. Anything that compares against a deadline calls
 * this instead of `new Date()` so tests can replace it without faking the
 * global Date (the Supabase auth client reads Date.now() to refresh sessions).
 *
 * In a Server Component, call it after something that reads the request
 * (e.g. `cookies()`); Cache Components rejects reading the time before that.
 */
export const now = (): Date => new Date();
