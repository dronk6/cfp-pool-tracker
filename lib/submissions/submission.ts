import { createSupabaseServerClient } from "../supabase/server";

export type Submission = {
  year: number;
  initialPlayoff: number[];
  initialTiebreakers: number[];
  currentPlayoff: number[];
  currentTiebreakers: number[];
  championId: number | null;
  submittedAt: string;
  updatedAt: string | null;
};

export type SessionSubmission = { signedIn: false } | { signedIn: true; submission: Submission | null };

/** Columns read from `submissions`; never includes `id` or `user_id`. */
export const SUBMISSION_COLUMNS =
  "year, initial_playoff, initial_tiebreakers, current_playoff, current_tiebreakers, champion_id, submitted_at, updated_at";

export type SubmissionRow = {
  year: number;
  initial_playoff: number[];
  initial_tiebreakers: number[];
  current_playoff: number[];
  current_tiebreakers: number[];
  champion_id: number | null;
  submitted_at: string;
  updated_at: string | null;
};

export function toSubmission(row: SubmissionRow): Submission {
  return {
    year: row.year,
    initialPlayoff: row.initial_playoff,
    initialTiebreakers: row.initial_tiebreakers,
    currentPlayoff: row.current_playoff,
    currentTiebreakers: row.current_tiebreakers,
    championId: row.champion_id,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The session user's submission for `year`, from the verified session only
 * (nothing is read from the request). `submission` is null when the user has
 * no row for that year. Throws if the lookup fails, so callers can tell "no
 * submission" from "couldn't look".
 */
export async function getSessionSubmission(year: number): Promise<SessionSubmission> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { signedIn: false };

  const { data: row, error: submissionError } = await supabase
    .from("submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("user_id", data.user.id)
    .eq("year", year)
    .maybeSingle();
  if (submissionError) throw submissionError;

  return { signedIn: true, submission: row ? toSubmission(row as SubmissionRow) : null };
}
