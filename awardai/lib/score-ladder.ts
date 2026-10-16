// lib/score-ladder.ts (16 Oct 2026, scoring update).
//
// Every fixed display threshold in the app (green at 8, "Near ceiling", the
// dashboard's "ready" at 7.5, the section pills at 7 and 5, the planner's
// "strong" at 7) was set against scores from the earlier scorer. The current
// scorer reads about one point lower on the same text: 1.0 to 2.4 on the
// overall across five demo drafts, and 0.8 per section (median 1) on 14 real
// 2026 Indie entries. So a current score is placed on those ladders one point
// up. The NUMBER shown never changes; only the band it falls in.
//
// Only an evaluation explicitly stamped with the earlier scorer reads on the
// old scale. Anything else, including a score whose model is not passed in,
// is treated as current, because every score written from 16 Oct 2026 on is.
// Keyed on model_used and never shown to a user by name.

const EARLIER_SCORERS = new Set(['claude-opus-4-6'])

/** Ladder offset in points for a score written by `modelUsed`. */
export function ladderOffset(modelUsed?: string | null): number {
  return modelUsed && EARLIER_SCORERS.has(modelUsed) ? 0 : 1
}

/** The value to compare against a fixed display threshold. Never display it. */
export function ladderScore(score: number, modelUsed?: string | null): number {
  return score + ladderOffset(modelUsed)
}
