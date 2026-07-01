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

  // ── v2 field model (Entry Form v2, 1 Jul 2026) — all OPTIONAL, additive. ──
  // A v1 section (no `fields`) is a v2 section with one implicit long_text
  // field spanning the whole section (see normalizeSection). AOY and any
  // unseeded show keep working byte-for-byte because these are all optional and
  // the resolver/jury never require them.
  /**
   * The typed sub-fields that compose this section (SMARTIES a/b/c/d parts).
   * Absent => v1 flat section (one long_text box). See EntryFormField.
   */
  fields?: EntryFormField[]
  /**
   * Section-level word ceiling: the sum of this section's prose fields'
   * word counts must not exceed it (soft warn in the canvas). null => no
   * ceiling. Distinct from per-field `word_limit`. v1 sets neither (word_limit
   * on the section is the per-field limit for the implicit body field).
   */
  word_ceiling?: number | null
  /**
   * Does the jury score this section? Defaults true for a section carrying a
   * weight or appearing in a scored show; a static gate (endorsement letter)
   * sets false. Absent => derived (see isScoredSection): a section is NOT
   * scored only when it is a static row (weight null AND no scored fields),
   * matching the v1 static-row rule.
   */
  scored?: boolean
  /** shown above the sub-fields in the canvas. Falls back to `guidance`. */
  instructions?: string
  /**
   * Optional section-level "provide the source" input rendered after the
   * section's fields (e.g. the optional source under the Campaign Metrics
   * table). Distinct from a field-level or table-column source.
   */
  source?: EntryFormSource
}

export interface EntryFormSpec {
  /**
   * 1 (or absent) => v1 flat sections. 2 => sections MAY carry typed `fields`.
   * Detection also works structurally (any section with `fields` is v2), so
   * this is advisory metadata, not a hard gate — normalizeSection handles both
   * regardless. Set 2 on the re-seeded SMARTIES spec (Entry Form v2 §8).
   */
  form_version?: number
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

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY FORM v2 — typed field model (1 Jul 2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY: the v1 flat model (one section = one prose box) cannot represent the real
// MMA SMARTIES 2026 kit: labelled sub-parts, one-sentence fields, currency /
// percent fields, a repeatable Objectives list, two typed metric tables with a
// required per-row source, a Results-from-Objectives cross-reference, and an
// optional ROI ratio. v2 adds a typed field union UNDER each section. It is an
// ADDITIVE SUPERSET: a v1 section (no `fields`) normalizes to a v2 section with
// one implicit long_text field, so AOY and every unseeded show are unchanged.
// Spec: Show-Customization-EntryForm-v2-DESIGN-SPEC-2026-07-01.md §4/§5.
//
// LOAD-BEARING PIPELINE DECISION (§6): the jury still scores the four top-level
// SECTIONS. The typed sub-fields are INPUTS that COMPOSE into one section text
// (composeSectionText below), stored in entry_drafts.version_a / custom_text,
// exactly the rows the jury reads today. So evaluate-entry-config.ts and the
// byte-frozen evaluate-entry.ts are UNTOUCHED. The composed-text FORMAT is
// defined ONCE here and copied verbatim into the Deno drafter
// (generate-entry-draft.ts) + the jury fixture baseline — it joins the existing
// parity contract (the WIN_RATES/ENTRY_FEES two-representation trap). Deno edge
// functions cannot import this module, so any copy MUST stay byte-identical.

/** Optional "provide the source" input attached to a field, sub-part, or
 * section. `required:true` is used only inside a table's source COLUMN; a
 * sub-part / section source is `required:false` ("...if any"). */
export interface EntryFormSource {
  enabled: boolean
  required: boolean
}

/** One column of a `table` field. A column with type/role 'source' is the
 * per-row source input (required for the metric tables). */
export interface EntryFormTableColumn {
  key: string
  label: string
  /** 'text' is a free cell; 'source' is the per-row source cell. */
  type: 'text' | 'source'
  required: boolean
  example?: string | null
}

export type EntryFormFieldType =
  | 'long_text'
  | 'short_text'
  | 'currency'
  | 'amount_or_percent'
  | 'list'
  | 'table'
  | 'derived_list'
  | 'ratio'

/** A typed sub-field of a section. Common shape + type-specific props. Kept as
 * one interface (all type-specific props optional) rather than a discriminated
 * union so the JSONB round-trips and the canvas/compose switch on `type`. */
export interface EntryFormField {
  key: string
  label: string
  type: EntryFormFieldType
  required?: boolean
  help?: string | null
  /** optional/required source input attached to this field or sub-part. */
  source?: EntryFormSource
  // long_text / short_text
  word_limit?: number | null
  /** short_text: cap to a single sentence (canvas hint + soft validation). */
  one_sentence?: boolean
  // list
  min_items?: number
  item_label?: string
  // table
  columns?: EntryFormTableColumn[]
  min_rows?: number
  // derived_list — references a `list` field in another (or the same) section.
  source_ref?: { section_key: string; field_key: string }
  result_label?: string
  result_required?: boolean
  // ratio
  example?: string | null
}

// ── Stored value shapes (entry_drafts.field_values, per section row) ─────────
// One entry per field, keyed by field.key. Plus an optional section-level
// `section_source` string and a `sources` map for field/sub-part sources.

/** A repeatable list item carries a STABLE id (assigned at creation), so a
 * derived_list result stays linked when the objective text is edited or the
 * list is reordered (§10 decision: key off stable id, never index or text). */
export interface EntryListItem {
  id: string
  text: string
}

/** A derived_list row: the referenced objective's stable id + a self-contained
 * TEXT SNAPSHOT of that objective (refreshed by reconcileDerivedList so
 * composition needs only this section's values) + the authored result. */
export interface EntryDerivedRow {
  ref: string
  objective: string
  result: string
}

/** A table row: column key -> cell string (source column included). */
export type EntryTableRow = Record<string, string>

/** Per-section structured values. Field values are keyed by field.key; the
 * concrete type depends on the field's `type`. `sources` holds field/sub-part
 * source strings keyed by field.key; `section_source` is the section-level one. */
export interface EntryFieldValues {
  [fieldKey: string]:
    | string
    | EntryListItem[]
    | EntryDerivedRow[]
    | EntryTableRow[]
    | Record<string, string>
    | undefined
  sources?: Record<string, string>
  section_source?: string
}

// ── Detection + normalization ────────────────────────────────────────────────

/** A section is v2 iff it declares typed `fields`. */
export function isV2Section(section: EntryFormSection): boolean {
  return Array.isArray(section.fields) && section.fields.length > 0
}

/** A spec is v2 iff form_version>=2 OR any section declares `fields`. Structural
 * detection wins, so an un-versioned but field-carrying spec still resolves. */
export function isV2Spec(spec: EntryFormSpec): boolean {
  if ((spec.form_version ?? 1) >= 2) return true
  return Array.isArray(spec.sections) && spec.sections.some(isV2Section)
}

/** A section with its `fields` guaranteed present. A v1 flat section becomes a
 * v2 section with ONE implicit long_text field spanning the whole section, so
 * every downstream consumer (canvas, compose, drafter) handles one code path. */
export interface NormalizedSection extends EntryFormSection {
  fields: EntryFormField[]
}

/** Pure. v1 flat section -> a v2 section with a single implicit `body`
 * long_text field carrying the v1 word_limit + guidance. v2 sections pass
 * through with `instructions`/`word_ceiling` defaulted. */
export function normalizeSection(section: EntryFormSection): NormalizedSection {
  if (isV2Section(section)) {
    return {
      ...section,
      fields: section.fields as EntryFormField[],
      word_ceiling: section.word_ceiling ?? null,
      instructions: section.instructions ?? section.guidance,
    }
  }
  return {
    ...section,
    fields: [
      {
        key: 'body',
        label: section.label,
        type: 'long_text',
        required: true,
        word_limit: section.word_limit ?? null,
        help: section.guidance,
      },
    ],
    word_ceiling: section.word_ceiling ?? null,
    instructions: section.instructions ?? section.guidance,
  }
}

/** Static row rule (carried from v1 / the AOY endorsement gate): a section is
 * NOT scored when it is explicitly `scored:false`, OR (legacy shape) it carries
 * no weight AND no word_limit AND no typed fields. Everything else is scored. */
export function isScoredSection(section: EntryFormSection): boolean {
  if (section.scored === false) return false // explicit opt-out (static gate)
  if (section.scored === true) return true
  const legacyStatic =
    (section.weight === null || section.weight === undefined) &&
    (section.word_limit === null || section.word_limit === undefined) &&
    !isV2Section(section)
  return !legacyStatic
}

// ── Word counting (shared with the canvas soft-limit UX) ─────────────────────

/** Pure. Whitespace-delimited word count; empty/whitespace -> 0. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  const t = String(text).trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

/** Pure. Sum of word counts across a section's PROSE fields (long_text +
 * short_text) for the section word_ceiling soft check. */
export function sectionWordCount(
  section: EntryFormSection,
  values: EntryFieldValues | null | undefined
): number {
  const norm = normalizeSection(section)
  const v = values ?? {}
  return norm.fields.reduce((sum, f) => {
    if (f.type !== 'long_text' && f.type !== 'short_text') return sum
    const val = v[f.key]
    return sum + (typeof val === 'string' ? countWords(val) : 0)
  }, 0)
}

// ── derived_list reconciliation (§10 decision: stable ids) ───────────────────

/** Pure. Rebuild a derived_list's rows from the live objectives list, keyed by
 * stable id: an existing result is preserved when its objective still exists
 * (text snapshot refreshed); a removed objective drops its row (the caller
 * confirms first if that row had a result — see the canvas); a new objective
 * appends an empty row. Order follows the live objectives list. */
export function reconcileDerivedList(
  existing: EntryDerivedRow[] | null | undefined,
  objectives: EntryListItem[] | null | undefined
): EntryDerivedRow[] {
  const prior = new Map<string, EntryDerivedRow>()
  ;(existing ?? []).forEach((r) => {
    if (r && typeof r.ref === 'string') prior.set(r.ref, r)
  })
  return (objectives ?? [])
    .filter((o) => o && typeof o.id === 'string')
    .map((o) => {
      const kept = prior.get(o.id)
      return {
        ref: o.id,
        objective: o.text ?? '',
        result: kept ? kept.result : '',
      }
    })
}

/** Pure. The derived_list rows whose objective was removed AND that still carry
 * a written result — the canvas warns before dropping these (no silent loss). */
export function orphanedDerivedResults(
  existing: EntryDerivedRow[] | null | undefined,
  objectives: EntryListItem[] | null | undefined
): EntryDerivedRow[] {
  const liveIds = new Set((objectives ?? []).map((o) => o.id))
  return (existing ?? []).filter(
    (r) => r && !liveIds.has(r.ref) && (r.result ?? '').trim().length > 0
  )
}

// ── Composition — the section text the jury reads (defined ONCE) ─────────────
//
// FORMAT (deterministic, byte-stable — copied verbatim into the Deno drafter +
// the jury fixture). A section composes to its fields rendered IN ORDER, each
// non-empty field a block, blocks joined by a blank line. Empty fields are
// skipped (so an unaddressed section composes to ''), which the jury's
// placeholder detection reads as a placeholder exactly as today. A v1 section
// composes to just its body prose (byte-identical to the old flat text), so
// nothing regresses for AOY / craft.

function renderTableRow(row: EntryTableRow, columns: EntryFormTableColumn[]): string {
  const parts = columns
    .map((c) => {
      const cell = (row?.[c.key] ?? '').toString().trim()
      return cell ? `${c.label}: ${cell}` : ''
    })
    .filter(Boolean)
  return parts.join('; ')
}

function renderField(field: EntryFormField, values: EntryFieldValues): string | null {
  const v = values ?? {}
  const sources = (v.sources as Record<string, string> | undefined) ?? {}
  const srcRaw = sources[field.key]
  const srcLine =
    field.source?.enabled && typeof srcRaw === 'string' && srcRaw.trim()
      ? `\nSource: ${srcRaw.trim()}`
      : ''

  switch (field.type) {
    case 'long_text': {
      // Prose block: label header, then the paragraph on its own line.
      const val = typeof v[field.key] === 'string' ? (v[field.key] as string).trim() : ''
      if (!val) return null
      return `${field.label}\n${val}${srcLine}`
    }
    case 'short_text':
    case 'currency':
    case 'amount_or_percent':
    case 'ratio': {
      // One-liners (one-sentence strategy, budget figures, ROI): inline
      // `Label: value`, cleaner than a prose block for a single sentence.
      const val = typeof v[field.key] === 'string' ? (v[field.key] as string).trim() : ''
      if (!val) return null
      return `${field.label}: ${val}${srcLine}`
    }
    case 'list': {
      const items = Array.isArray(v[field.key]) ? (v[field.key] as EntryListItem[]) : []
      const lines = items
        .map((it) => (it && typeof it.text === 'string' ? it.text.trim() : ''))
        .filter(Boolean)
        .map((t) => `- ${t}`)
      if (lines.length === 0) return null
      return `${field.label}:\n${lines.join('\n')}${srcLine}`
    }
    case 'table': {
      const rows = Array.isArray(v[field.key]) ? (v[field.key] as EntryTableRow[]) : []
      const cols = field.columns ?? []
      const lines = rows
        .map((r) => renderTableRow(r, cols))
        .filter(Boolean)
        .map((t) => `- ${t}`)
      if (lines.length === 0) return null
      return `${field.label}:\n${lines.join('\n')}${srcLine}`
    }
    case 'derived_list': {
      const rows = Array.isArray(v[field.key]) ? (v[field.key] as EntryDerivedRow[]) : []
      const lines = rows
        .map((r) => {
          const obj = (r?.objective ?? '').trim()
          const res = (r?.result ?? '').trim()
          if (!obj && !res) return ''
          return `- ${obj}: ${res}`
        })
        .filter(Boolean)
      if (lines.length === 0) return null
      return `${field.label}:\n${lines.join('\n')}`
    }
    default:
      return null
  }
}

/** Pure. Compose a section's typed field values into the single section text
 * the jury + downloads read (entry_drafts.version_a / custom_text). v1 flat
 * section -> the body prose verbatim (no regression). Empty section -> ''.
 * DEFINED ONCE: any copy (Deno drafter, jury fixture) must stay byte-identical. */
export function composeSectionText(
  section: EntryFormSection,
  values: EntryFieldValues | null | undefined
): string {
  const norm = normalizeSection(section)
  const v = values ?? {}
  const blocks = norm.fields
    .map((f) => renderField(f, v))
    .filter((b): b is string => b !== null)
  const sectionSrc =
    section.source?.enabled && typeof v.section_source === 'string' && v.section_source.trim()
      ? `Source: ${v.section_source.trim()}`
      : ''
  if (sectionSrc) blocks.push(sectionSrc)
  return blocks.join('\n\n')
}
