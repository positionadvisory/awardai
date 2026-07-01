// lib/entry-form.ts
// ─────────────────────────────────────────────────────────────────────────────
// Config-driven show customization — entry_form types (Chunk 0).
//
// WHY THIS EXISTS
// Only AOY (weighted) and MMA SMARTIES (qualitative) customize the entry canvas
// and scoring to a show's real form; every other show runs the generic path,
// where generate-draft lets the model invent the field structure and
// evaluate-entry scores on a fixed 6 dimensions regardless of what the show
// rewards. Hand-coding a dedicated drafter+jury per show (the SMARTIES pattern)
// multiplies the parity surface that is already the top regression source
// (Gotchas-Critical). The fix: express the customization as DATA on
// show_profiles.entry_form (nullable jsonb), read by ONE config drafter and ONE
// config jury, instead of new per-show code.
//
// Spec: Shortlist App/Show-Customization-Architecture-2026-07-01.md §4.
// This file is Chunk 0 of that build: TYPES ONLY. `entry_form IS NULL` on a
// show_profiles row means "craft fallback" — today's generic behavior,
// unchanged. No resolver, no aggregation, no client wiring yet:
//   - Chunk 1 adds resolveEntryForm(showName, category) + the weighted-average /
//     holistic aggregation helpers to this module.
//   - Chunk 2/3/4 add the config drafter / jury / segmenter+coach that consume it.
//   - Chunk 5 wires the client canvas render.
//   - Chunk 6 seeds the first verified rows (SMARTIES reproduce, one AOY
//     category, Women to Watch, Clio Creators).
// Adding this file changes no behavior: nothing imports it yet.
// ─────────────────────────────────────────────────────────────────────────────

// Axis A — how the entry is judged. See architecture doc §3 Axis A.
// `specialist` is an escape hatch (SABRE, Effie): the engine must refuse to
// auto-draft/score it, not guess.
export type ScoringMode = 'weighted' | 'qualitative' | 'craft' | 'specialist'

// Axis B — what the entry is ABOUT, independent of scoring_mode. See §3 Axis B.
// Generalizes AOY's People/Brand/Agency pillars so any show (Women to Watch,
// Women Leading Change) gets subject-appropriate drafting without new code.
export type EntrySubject = 'agency' | 'brand' | 'people' | 'campaign'

// Which Shortlist tool leads the flow. Most written-case shows lead with the
// section drafter; craft/video-first shows (most Clio Creators mediums) lead
// with the case-study video script (generate-video-script.ts, already built).
export type PrimaryTool = 'section_drafter' | 'video_script'

// How the section scores roll up into one number.
// - weighted_average: Σ(score×weight)/Σ(weight), computed in code (AOY today).
// - holistic: per-section 0-10 + a separate holistic overall judgment, no
//   weighting math (SMARTIES today).
// - dimension: reserved for a weight attached to a scoring DIMENSION rather
//   than a section (Clio's two weighted mediums split idea-vs-results 50/50 /
//   75/25 at the medium level — see architecture doc §9 open decisions).
//   Not consumed by any chunk yet; included so Chunk 3 does not need a type
//   migration to add it.
export type OverallMode = 'weighted_average' | 'holistic' | 'dimension'

export interface EntryFormSection {
  /** snake_case, stable — the jury/drafter key. Never renamed once seeded. */
  key: string
  /** exact label from the show's own entry kit. */
  label: string
  /** official per-section word limit, or null if the show sets none. */
  word_limit: number | null
  /**
   * Percent weight for `weighted` mode; null for `qualitative`/`craft`.
   * Authoritative from this spec, injected in code — the model never emits a
   * weight (the WIN_RATES/ENTRY_FEES two-representation trap). Weights need
   * not sum to 100; the jury normalizes by the actual sum (same as AOY today).
   */
  weight: number | null
  /** exec summary is 0, weighted sections 1..N, an endorsement/testimonial gate is N+1. */
  sort_order: number
  /** what this section must contain — injected into the drafter prompt. */
  guidance: string
}

export interface EntryFormSpec {
  scoring_mode: ScoringMode
  entry_subject: EntrySubject
  primary_tool: PrimaryTool
  overall: OverallMode
  sections: EntryFormSection[]
  /** provenance URL for shortlist-research-integrity (one-click source, or flagged estimate). */
  source_url: string | null
  /** ISO date the spec was last verified against the official kit. */
  verified_on: string | null
  notes: string | null
}

// Row shape as stored/read from show_profiles.entry_form (nullable jsonb).
// NULL = craft fallback: no dedicated spec, use the calibrated 6-dim judge
// and the current generic drafter exactly as they behave today.
export type EntryFormColumn = EntryFormSpec | null
