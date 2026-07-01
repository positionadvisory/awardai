// lib/entry-form.ts
// ─────────────────────────────────────────────────────────────────────────────
// Config-driven show customization — entry_form types + resolver (Chunks 0-1).
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
// Chunk 0 (types only) shipped Session 97/98; this file now also carries
// Chunk 1 (Session 98): the pure resolver + the weighted/holistic aggregation
// helpers extracted from evaluate-aoy-entry.ts and evaluate-smarties-entry.ts.
// Still no client wiring and nothing else imports this file yet — no behavior
// change to any live path.
//   - Chunk 2/3/4 add the config drafter / jury / segmenter+coach that consume
//     the resolver + aggregation helpers below.
//   - Chunk 5 wires the client canvas render.
//   - Chunk 6 seeds the first verified rows (SMARTIES reproduce, one AOY
//     category, Women to Watch, Clio Creators).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { isAoyShow, normalizeAoyCategory } from './aoy-taxonomy'

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
  // ── Chunk 3 jury framing (Session 98) ──
  // Optional on the type, but REQUIRED at runtime by the config jury
  // (evaluate-entry-config) for `weighted`/`qualitative` shows: it refuses with
  // ENTRYEVAL-NOFRAMING rather than default to AOY/SMARTIES wording and silently
  // mislabel a show. These carry the SHOW-specific (not mode-specific) parts of
  // the scoring prompt, so a new weighted/qualitative show reproduces byte-for-
  // byte from data with no new jury code. See the header of evaluate-entry-config.
  /** e.g. 'Campaign Asia-Pacific Agency of the Year (AOY) awards' / 'MMA SMARTIES Awards'. */
  jury_programme_name?: string | null
  /** the programme-framing sentence(s) rendered after the juror intro. */
  jury_framing?: string | null
  /** the noun in "Score this ___ entry for" (e.g. 'AOY' / 'MMA SMARTIES'). */
  jury_entry_noun?: string | null
  /** qualitative only: the "HOW JUDGES READ THE CREATIVE" line (SMARTIES sets it). */
  jury_creative_note?: string | null
  /** weighted only: overrides the entry_subject lens for a new weighted show. */
  subject_lens?: string | null
}

// Row shape as stored/read from show_profiles.entry_form (nullable jsonb).
// NULL = craft fallback: no dedicated spec, use the calibrated 6-dim judge
// and the current generic drafter exactly as they behave today.
export type EntryFormColumn = EntryFormSpec | null

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 1 — config resolver (Session 98)
// ═══════════════════════════════════════════════════════════════════════════
//
// RESOLVER SCOPE — read before wiring a caller:
// `resolveEntryForm`'s `showName` parameter must already be the CANONICAL
// show_profiles.show_name (e.g. AOY_SHOW_NAME from lib/aoy-taxonomy, or the
// literal 'MMA Smarties'), not a raw direction.best_show variant. Mapping an
// arbitrary best_show string onto its canonical show_name is an existing,
// separate problem — every dedicated function today already hardcodes or
// ILIKEs its own canonical name (AOY_SHOW_NAME; SMARTIES' '%Smarties%') — and
// is out of scope for Chunk 1. Chunk 2's config drafter/jury resolves to the
// canonical name first, the same responsibility those functions carry today.
//
// CATEGORY KEY:
// - AOY (isAoyShow(showName) true): the key is normalizeAoyCategory applied to
//   the raw category (market/sub-region prefix stripped), the same exact-key
//   rubric lookup evaluate-entry.ts / generate-aoy-draft.ts already use.
// - Every other show: the key is the raw category string, trimmed. Chunk 6
//   seeds entry_form rows keyed on this exact value; this is NOT the legacy
//   first-word ILIKE pattern (that pattern serves scoring_emphasis freeform
//   text lookups, not this exact, freshly-seeded column).
//
// SELECTION: the category-exact row wins; the show-level row
// (category_pattern IS NULL) is the fallback; neither carrying an entry_form
// -> null, which callers must treat as the craft fallback (§4: "entry_form IS
// NULL -> craft fallback ... no show breaks by omission").

export interface EntryFormLookupRow {
  category_pattern: string | null
  entry_form: EntryFormSpec | null
}

/** Pure. Decides the show_profiles.category_pattern key to query for a given
 * show + raw category string. Returns null when there is no usable category
 * (caller should query the show-level NULL row only). */
export function resolveEntryFormCategoryKey(
  showName: string,
  category: string | null | undefined
): string | null {
  if (isAoyShow(showName)) {
    const key = normalizeAoyCategory(category ?? '')
    return key || null
  }
  const trimmed = (category ?? '').trim()
  return trimmed || null
}

/** Pure. Given the category-exact row (if any) and the show-level NULL row
 * (if any), picks the entry_form that applies. Category-exact wins; the
 * show-level row is the fallback; no entry_form on either -> null (craft
 * fallback, the safe default per §4). */
export function pickEntryForm(
  categoryRow: EntryFormLookupRow | null,
  showLevelRow: EntryFormLookupRow | null
): EntryFormSpec | null {
  if (categoryRow?.entry_form) return categoryRow.entry_form
  if (showLevelRow?.entry_form) return showLevelRow.entry_form
  return null
}

/** Thin DB wrapper around resolveEntryFormCategoryKey + pickEntryForm.
 * Fetches the category-exact row and the show-level NULL row in parallel and
 * applies the same selection rule. `showName` must be the canonical
 * show_profiles key — see the scope note above.
 *
 * Deno edge functions cannot import Next.js lib modules (established
 * constraint — see the header comment in lib/aoy-taxonomy.ts): Chunk 2/3/4's
 * config drafter/jury/segmenter/coach need their own copy of this resolver,
 * kept byte-identical to this one, joining the existing parity contract
 * rather than starting a new one. */
export async function resolveEntryForm(
  supabase: SupabaseClient,
  showName: string,
  category: string | null | undefined
): Promise<EntryFormSpec | null> {
  const categoryKey = resolveEntryFormCategoryKey(showName, category)

  const [categoryResult, showLevelResult] = await Promise.all([
    categoryKey
      ? supabase
          .from('show_profiles')
          .select('category_pattern, entry_form')
          .eq('show_name', showName)
          .eq('category_pattern', categoryKey)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as EntryFormLookupRow | null }),
    supabase
      .from('show_profiles')
      .select('category_pattern, entry_form')
      .eq('show_name', showName)
      .is('category_pattern', null)
      .limit(1)
      .maybeSingle(),
  ])

  const categoryRow = (categoryResult.data ?? null) as EntryFormLookupRow | null
  const showLevelRow = (showLevelResult.data ?? null) as EntryFormLookupRow | null
  return pickEntryForm(categoryRow, showLevelRow)
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 1 — aggregation helpers (Session 98)
// ═══════════════════════════════════════════════════════════════════════════
//
// Extracted from evaluate-aoy-entry.ts (weighted, S75) and
// evaluate-smarties-entry.ts (holistic, S92). BYTE-EQUIVALENT MATH, not
// byte-equivalent code — the dedicated functions stay untouched (Chunk 3
// guardrail: evaluate-entry.ts SHA-frozen; a mandatory prompt-equivalence
// fixture is owed before either dedicated jury retires, per Chunk 7). Model
// scores are non-deterministic, so the acceptance bar here is that this
// module's aggregation matches the dedicated functions' DETERMINISTIC
// post-parse math on fixed inputs — see
// scripts/entry-form-aggregation-fixture.mjs.

/** Pure. Clamps a raw model score to 0-10; a non-finite input becomes 0
 * (never inflated). */
export function clampScore(v: number): number {
  const n = Number.isFinite(v) ? v : 0
  return Math.max(0, Math.min(10, n))
}

export interface WeightedSectionInput {
  /** raw model score for this section, 0-10 (will be clamped here). */
  score: number
  /** authoritative weight from the persisted spec, never the model. */
  weight: number
  /** an unaddressed/empty section loses its weight: clamped to <=2. */
  isPlaceholder: boolean
}

export interface WeightedSectionResult {
  score: number
  weight: number
  weightedContribution: number
}

export interface WeightedAggregationResult {
  overall: number
  weightSum: number
  weightWarning: string | null
  sections: WeightedSectionResult[]
}

/** Pure. Σ(score×weight)/Σ(weight) on a 0-10 scale, computed in code — the
 * model never applies the percentages (evaluate-aoy-entry.ts, S75). Weights
 * need not sum to 100; normalises by the actual sum and surfaces the same
 * divergence warning the AOY jury shows today. */
export function aggregateWeighted(sections: WeightedSectionInput[]): WeightedAggregationResult {
  const weightSum = sections.reduce((acc, s) => acc + s.weight, 0)
  const weightWarning =
    Math.abs(weightSum - 100) > 0.5
      ? `Section weights sum to ${weightSum}%, not 100%. Score normalised by the actual sum.`
      : null

  let weightedAccum = 0
  const results: WeightedSectionResult[] = sections.map((s) => {
    const clamped = clampScore(s.score)
    const score = s.isPlaceholder ? Math.min(clamped, 2) : clamped
    const contribution = (score * s.weight) / (weightSum || 100)
    weightedAccum += contribution
    return {
      score,
      weight: s.weight,
      weightedContribution: Math.round(contribution * 100) / 100,
    }
  })

  return {
    overall: Math.round(weightedAccum * 10) / 10,
    weightSum,
    weightWarning,
    sections: results,
  }
}

export interface HolisticSectionInput {
  score: number
  isPlaceholder: boolean
}

export interface HolisticAggregationResult {
  overall: number
  sections: { score: number }[]
}

/** Pure. Per-section 0-10 plus a HOLISTIC overall, no weighting math, because
 * SMARTIES (and any other `qualitative` show) publishes no section weighting
 * (evaluate-smarties-entry.ts, S92: the 40/20/20/10 split is unofficial and
 * held out). `modelOverall` is the model's own direct judgment; when it is
 * missing/non-finite, falls back to the lowest section score (conservative,
 * never inflated), same as the dedicated function today. */
export function aggregateHolistic(
  sections: HolisticSectionInput[],
  modelOverall: number | null | undefined
): HolisticAggregationResult {
  const results = sections.map((s) => {
    const clamped = clampScore(s.score)
    return { score: s.isPlaceholder ? Math.min(clamped, 2) : clamped }
  })

  const hasModelOverall = typeof modelOverall === 'number' && Number.isFinite(modelOverall)
  const overall = hasModelOverall
    ? Math.round(clampScore(modelOverall as number) * 10) / 10
    : Math.round(Math.min(...results.map((s) => s.score)) * 10) / 10

  return { overall, sections: results }
}
