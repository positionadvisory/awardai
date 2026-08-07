/**
 * planner-v3-engine.ts — Portfolio Planner v3's campaign-driven derivation.
 * =============================================================================
 * Planner-v3-SPEC-campaign-driven-2026-07-16.md (v3.1 REVISED). Build session
 * V3-P1 (data + engine layer, Sonnet). SQL-free: v3 needs no new columns —
 * it reuses show_profiles/dynamic_shows.planner_facets, show_rate_facts_read,
 * ENTRY_FEES, and lib/fx.ts exactly as P2.1 left them. Page/components are
 * V3-P2/P3; this file has zero React, zero client writes.
 *
 * THE REFRAME (spec "The reframe"): v2 answered "given who you are, which shows
 * could you enter" (a filtered universe). v3 answers "given the campaigns
 * you're putting forward, which shows/categories should you invest them in, how
 * many entries, at what budget, in what priority order" — a recommendation off
 * the user's real work.
 *
 * Contract (spec "The engine"): `recommendFor(campaign) → placements` is the
 * primitive; `derivePlanV3` is the multi-campaign roll-up + budget bound. This
 * costs nothing structurally now and later enables a "Where should this
 * campaign go?" button on projects/[id] (the higher-frequency surface).
 *
 * Pipeline, in order (spec "The engine (v3 derivation)"):
 *   1. RESOLVE each direction's raw show name to a canonical show, via the
 *      sameShow/alias machinery (never `===`), plus an explicit per-family
 *      EDITION POLICY for shows whose live direction names fan out into
 *      variants the existing facet/deadline/fee tables don't carry (the MMA
 *      Smarties family: APAC / Vietnam / Global / X Global / China — see
 *      live-data findings below). A no-match is surfaced as "unrecognized
 *      show" with the raw name, NEVER silently dropped.
 *   2. REDUCE directions to candidate entries: de-dup per campaign x resolved
 *      show x category (exact-match category text), cap categories per
 *      campaign per show at MAX_CATEGORIES_PER_SHOW, preferring directions
 *      with activity (an entry_draft or eval attached) when trimming, then
 *      generator order (sort_order).
 *   3. REGION gate (reused from P2.1's lib/planner-facets.ts): a national/
 *      regional show outside the user's market is flag-dropped (excluded from
 *      the recommended/budget set, but never removed from the returned data —
 *      "flag drops", not silent drops).
 *   4. PRIORITY score per candidate entry: entry readiness (the campaign's
 *      latest overall_score, carrying its own scored-show context) blended
 *      with a sourced win/shortlist rate where one is publishable
 *      (lib/rate-facts.ts's mayDisplayNumber gate) — an absent rate makes NO
 *      difficulty contribution (flagged "difficulty unknown"), never a
 *      guessed one. `win_likelihood` is threaded through the types for
 *      debugging visibility ONLY; it is never read by scoring anywhere in this
 *      file (spec: "win_likelihood appears NOWHERE"). Lens re-weights the
 *      blend; discipline is a same-priority tiebreaker (a tilt, never a
 *      filter — P2.1 #5's lesson carried forward), never a hard cut.
 *   5. GROUP by resolved show: categories to enter, entry count (the reduced
 *      set), budget per show (entries x sourced fee, USD; the display-
 *      currency/native/FX-date contract stays in lib/planner-display.ts).
 *   6. BUDGET BOUND: fill highest-priority entries first while the running
 *      spend fits; overflow demotes to `reserve`, never dropped. An unsourced
 *      fee cannot be tested against the budget (we do not invent a number to
 *      test it with), so it never consumes budget capacity and is excluded
 *      from the hard total — flagged, not blocked.
 *   7. TIER = the comms model (core / prestige / specialist / reserve), a
 *      documented v1 heuristic off geo_scope + the facet's specialist axis
 *      (P3's output pass owns the final display framing; this is a real,
 *      testable placeholder, not an invented number).
 *   8. Deterministic: same (input, facets, rate facts, deadlines, asOfDate) ->
 *      identical plan. No Date.now()/new Date() read internally — every
 *      derivation takes an explicit `asOfDate` (mirrors planner-engine.ts's
 *      determinism contract exactly).
 *
 * Live-data findings this file is built against (verified 16 Jul, review
 * session + this session's live-schema openers — see _context.md Session F6 /
 * V3-P1 openers):
 *   - `directions` are generator fan-out, NOT a curated slate (org 24 project
 *     70 alone carries 20 directions at 3 MMA Smarties editions; project 71
 *     carries straight duplicates — 4 near-identical "Brand Awareness &
 *     Positioning" rows at MMA Smarties APAC). Reduction (step 2) exists
 *     because of this, not as defensive polish.
 *   - Exact-name show resolution fails on 60/77 live directions pre-v3 (MMA
 *     edition variants; "Effies North America" has no facet at all). Verified
 *     live 16 Jul: DEADLINES_2026 / SHOW_CATEGORIES / ENTRY_FEES / the
 *     KB_SHOW_ALIASES table (lib/shows-data.ts) carry rows for "MMA Smarties
 *     APAC" and "MMA Smarties Global" only — "MMA Smarties Vietnam" (7 live
 *     directions) and "MMA Smarties X Global" (2 live directions) have ZERO
 *     rows anywhere. This is the exact gap step 1's MMA_EDITION_POLICY closes.
 *   - `overall_score` (evaluations) is entry readiness scored against ONE
 *     show's rubric, joined via entry_draft_id/project_id with no show column
 *     and no direction_id — it does not transfer to a different show. Step 4
 *     always carries the campaign's own `scored_show` alongside the number.
 *
 * NO rate, odds, or win-likelihood logic is invented anywhere in this file.
 * Odds come only from lib/rate-facts.ts (getRateFact/mayDisplayNumber); fees
 * come only from lib/shows-data.ts's ENTRY_FEES via resolveWinRateKey. Reused,
 * never forked: lib/planner-facets.ts (regionAdmits/normalizeUserRegion/
 * facetAdmitsDiscipline/getPlannerFacet), lib/show-taxonomy.ts (sameShow/
 * categoriesForShow/showHasNoCategoryList/showHasNoCategoryConcept),
 * lib/planner-engine.ts (resolveCycleStatus), lib/fx.ts (convert), lib/rate-
 * facts.ts (getRateFact/mayDisplayNumber).
 * =============================================================================
 */

import type { PlannerFacet, PlannerRegion } from '@/lib/planner-facets'
import { getPlannerFacet, regionAdmits, normalizeUserRegion, facetAdmitsDiscipline } from '@/lib/planner-facets'
import type { PlannerShowDiscipline } from '@/lib/planner-facets'
import {
  sameShow,
  categoriesForShow,
  showHasNoCategoryList,
  showHasNoCategoryConcept,
} from '@/lib/show-taxonomy'
import { isAoyShow, normalizeAoyCategory, AOY_CATEGORY_KEYS } from '@/lib/aoy-taxonomy'
import { convert, type CurrencyCode } from '@/lib/fx'
import { DEADLINES_2026, type ShowDeadline, type EligibilityWindow, type EligibilityRule, ENTRY_FEES, resolveWinRateKey, normaliseKbShow } from '@/lib/shows-data'
import { getRateFact, mayDisplayNumber, type RateFact } from '@/lib/rate-facts'
import { resolveCycleStatus, type PlannerCycleStatus } from '@/lib/planner-engine'
import type { PlannerAgencyDiscipline, PlannerLens } from '@/lib/planner-engine'

// ── Agency-side discipline mapping (mirrors lib/planner-display.ts's own copy,
// which mirrors lib/planner-engine.ts's private AGENCY_TO_SHOW_DISCIPLINE — kept
// here rather than editing either merged file, same precedent) ──────────────

const AGENCY_TO_SHOW_DISCIPLINE: Record<Exclude<PlannerAgencyDiscipline, 'full_service'>, PlannerShowDiscipline> = {
  media: 'media',
  creative: 'creative',
  PR: 'PR',
  mobile_performance: 'mobile',
}

function agencyShowDiscipline(discipline: PlannerAgencyDiscipline): PlannerShowDiscipline | null {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}

// ── Step 1: show RESOLUTION + the MMA edition policy ─────────────────────────

export type EditionPolicyEntry = {
  /** The canonical show name this edition resolves to for facet/deadline/fee lookups. */
  canonical: string
  /** Why this edition isn't its own row — carried through to the UI, never silent. */
  note: string
  /**
   * True when this edition's OWN price is known to differ from the canonical
   * show's fee (a cheaper country program etc.) and no edition-specific
   * ENTRY_FEES row exists — the canonical fee is used as a sourced UPPER-BOUND
   * estimate, flagged, never a fabricated discount.
   */
  feeIsUpperBoundEstimate?: boolean
  /**
   * True when this edition is a real, distinct program the planner
   * deliberately does not recommend into (out of scope), distinct from
   * "unrecognized" (never seen before). Still surfaced, never silently dropped.
   */
  outOfScope?: boolean
}

/**
 * Explicit per-family edition policy (spec: "Explicit edition policy required
 * for the MMA family, and any future family"). Keyed lower-cased/trimmed raw
 * show name -> policy. Verified live 16 Jul against DEADLINES_2026/
 * SHOW_CATEGORIES/ENTRY_FEES/KB_SHOW_ALIASES (lib/shows-data.ts): plain
 * "MMA Smarties APAC" and "MMA Smarties Global" already resolve correctly
 * through the existing sameShow/normaliseKbShow machinery and need NO entry
 * here — this table only covers the variants that machinery does not reach.
 */
export const MMA_EDITION_POLICY: Record<string, EditionPolicyEntry> = {
  'mma smarties vietnam': {
    canonical: 'MMA Smarties APAC',
    note:
      "MMA Smarties Vietnam is a cheaper country program under the same APAC cycle/deadline (shows-data.ts's APAC deadline note: \"Country programs cheaper (Vietnam/Indonesia/Philippines/Thailand/India ~$240–$350)\"). No Vietnam-specific ENTRY_FEES row exists, so budget uses the APAC base fee as a sourced upper-bound estimate — flagged, never invented.",
    feeIsUpperBoundEstimate: true,
  },
  'mma smarties x global': {
    canonical: 'MMA Smarties Global',
    note:
      "\"MMA Smarties X Global\" is the same cycle shows-data.ts already tracks as 'MMA Smarties Global' (that row's own note is written for the X Global fee schedule) — same facet/deadline/fee, no separate row needed.",
  },
  'mma smarties china': {
    canonical: 'MMA Smarties APAC',
    note:
      "MMA Smarties China is a distinct national program the planner excludes, per the existing KB_SHOW_ALIASES precedent ('mma smarties china': null in lib/shows-data.ts) — surfaced here as out-of-scope, never silently dropped.",
    outOfScope: true,
  },
}

export type ShowResolution =
  | { status: 'resolved'; canonicalShow: string; facet: PlannerFacet | null; editionNote?: string; feeIsUpperBoundEstimate?: boolean }
  | { status: 'unrecognized'; rawName: string }
  | { status: 'out_of_scope'; rawName: string; canonicalFamily: string; note: string }

/**
 * Resolve a direction's raw, free-text `best_show` to a canonical show for
 * facet/deadline/fee lookups. Order: (1) the explicit edition policy above
 * (family variants known to need mapping), (2) the existing sameShow/
 * normaliseKbShow machinery via a facet/deadline/fee-key match on the
 * (possibly edition-mapped) canonical name. A show can be legitimately
 * unmapped in planner_facets (a pipeline-only show) yet still resolve for
 * deadline/fee purposes — facet absence alone is NOT "unrecognized". Only
 * when NEITHER a facet NOR a deadline row NOR an ENTRY_FEES key NOR an
 * edition-policy entry exists anywhere does this return `unrecognized` — the
 * mandatory "never silently dropped" case.
 */
export function resolveShowV3(rawName: string | null | undefined, facets: PlannerFacet[]): ShowResolution {
  const raw = (rawName ?? '').trim()
  if (!raw) return { status: 'unrecognized', rawName: raw }

  const policyKey = raw.toLowerCase()
  const policy = MMA_EDITION_POLICY[policyKey]

  if (policy?.outOfScope) {
    return { status: 'out_of_scope', rawName: raw, canonicalFamily: policy.canonical, note: policy.note }
  }

  const canonicalName = policy ? policy.canonical : raw
  const facet = getPlannerFacet(facets, canonicalName)
  const hasDeadline = DEADLINES_2026.some((d: ShowDeadline) => sameShow(d.show, canonicalName))
  const hasFeeKey = !!resolveWinRateKey(canonicalName)

  if (!facet && !hasDeadline && !hasFeeKey && !policy) {
    return { status: 'unrecognized', rawName: raw }
  }

  return {
    status: 'resolved',
    canonicalShow: canonicalName,
    facet,
    editionNote: policy?.note,
    feeIsUpperBoundEstimate: policy?.feeIsUpperBoundEstimate,
  }
}

// ── Category cross-check (spec "resolved questions" #4) ──────────────────────

export type CategoryFlag = 'ok' | 'no_taxonomy' | 'drift'

/**
 * Cross-check a direction's best_category against categoriesForShow, where a
 * taxonomy exists. Never blocks: drift is a flag, not a rejection. Shows with
 * NO category concept at all (Women to Watch) always read 'ok' (there is
 * nothing to drift against). Shows with a real but undocumented taxonomy
 * (showHasNoCategoryList — SABRE, Clio Entertainment/Sports/Creators, ANDY,
 * Gerety, ROI Festival) read 'no_taxonomy', never 'drift'.
 */
export function categoryCrossCheck(canonicalShow: string, category: string | null): CategoryFlag {
  if (showHasNoCategoryConcept(canonicalShow)) return 'ok'
  // AOY categories are track/market-prefixed free text and Campaign Asia AOY is
  // not in SHOW_CATEGORIES, so the generic list check below would wrongly read
  // 'no taxonomy'. Validate via the canonical AOY normalizer + the 63 rubric stems
  // (read-only reuse of the parity-locked lib/aoy-taxonomy; strips the market/
  // sub-region prefix so 'China PR Agency of the Year' -> 'PR Agency of the Year').
  if (isAoyShow(canonicalShow)) {
    if (!category) return 'drift'
    const stem = normalizeAoyCategory(category)
    return AOY_CATEGORY_KEYS.some(k => k.toLowerCase() === stem.toLowerCase()) ? 'ok' : 'drift'
  }
  if (showHasNoCategoryList(canonicalShow)) return 'no_taxonomy'
  const list = categoriesForShow(canonicalShow)
  if (list.length === 0) return 'no_taxonomy'
  if (!category) return 'drift'
  const found = list.some(c => c.trim().toLowerCase() === category.trim().toLowerCase())
  return found ? 'ok' : 'drift'
}

// ── Inputs ────────────────────────────────────────────────────────────────────

/** One direction row, trimmed to what the v3 engine reads. win_likelihood is
 * carried for debugging/telemetry ONLY — never read by scoreEntry/derivePlanV3.
 */
export type PlannerV3Direction = {
  direction_id: number
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null
  /** True iff this direction has an entry_draft and/or an evaluation attached. */
  has_activity: boolean
  sort_order: number
}

/** A campaign selected into the plan (the sorted-picker output, spec "Input model"). */
export type SelectedCampaign = {
  project_id: number
  campaign_name: string
  /** Latest overall_score (0-10), i.e. "entry readiness" — never "campaign quality". */
  entry_readiness: number
  /** The show that score was measured against — always carried alongside the number. */
  scored_show: string | null
  directions: PlannerV3Direction[]
  /** Optional user-supplied "first publicly aired/published" date (ISO YYYY-MM-DD).
   *  Nullable/absent = not provided; the eligibility check then stays unverifiable,
   *  never a silent pass. No schema column this cycle (planner-input only). */
  first_aired?: string | null
}

export type PriorityContext = {
  discipline: PlannerAgencyDiscipline
  lens: PlannerLens
}

export type PlannerV3Input = {
  campaigns: SelectedCampaign[]
  budget: number
  budgetCurrency: CurrencyCode
  /** Free-text home market (normalizeUserRegion handles enum/city/country). */
  region: string
  discipline: PlannerAgencyDiscipline
  lens: PlannerLens
  asOfDate: string
}

// ── Step 2: REDUCTION (dedup + category cap) ─────────────────────────────────

/** Cap on distinct categories entered per campaign per show (spec: "2-3"). */
export const MAX_CATEGORIES_PER_SHOW = 3

export type ReducedEntry = {
  campaign: SelectedCampaign
  resolution: Extract<ShowResolution, { status: 'resolved' }>
  category: string | null
  categoryFlag: CategoryFlag
  /** The single surviving direction id after dedup (used for traceability/UI). */
  direction_id: number
  /** How many raw directions collapsed into this one entry (>1 = a real dup). */
  deduped_count: number
}

export type UnresolvedEntry = {
  campaign: SelectedCampaign
  rawShowName: string
  reason: 'unrecognized' | 'out_of_scope'
  note?: string
}

/** Prefer a direction WITH activity (entry_draft/eval) over one without; break ties by generator order. */
function preferActivityThenOrder(a: PlannerV3Direction, b: PlannerV3Direction): number {
  if (a.has_activity !== b.has_activity) return a.has_activity ? -1 : 1
  return a.sort_order - b.sort_order
}

/**
 * Reduce one campaign's raw directions to deduped, capped candidate entries
 * (spec step 2). De-dup key = resolved show x exact-match category text
 * (case/space-insensitive) — this is what collapses org 24 project 73's
 * straight duplicates (e.g. two "Data-Driven Marketing" directions at MMA
 * Smarties APAC) into one entry. The cap then trims any campaign x show pair
 * still over MAX_CATEGORIES_PER_SHOW, same preference order.
 */
export function reduceCampaign(
  campaign: SelectedCampaign,
  facets: PlannerFacet[],
): { entries: ReducedEntry[]; unresolved: UnresolvedEntry[] } {
  // Directions are grouped by their CANONICAL show key so editions of the same
  // family (e.g. plain "MMA Smarties APAC" and "MMA Smarties Vietnam") collapse
  // into one show bucket. But each direction's OWN resolution (edition note,
  // fee-is-estimate flag) must survive independently — a Vietnam-edition
  // direction is still a fee estimate even when it shares a bucket with a
  // plain-APAC direction that resolved first. Grouping by canonical show name
  // is correct; collapsing every direction in the group onto ONE bucket-level
  // resolution object is not, so resolutions are kept per-direction here and
  // only the surviving winner's own resolution is attached to its entry.
  const resolutionByDirection = new Map<number, Extract<ShowResolution, { status: 'resolved' }>>()
  const byShow = new Map<string, PlannerV3Direction[]>()
  const unresolved: UnresolvedEntry[] = []

  for (const d of campaign.directions) {
    const resolution = resolveShowV3(d.best_show, facets)
    if (resolution.status === 'unrecognized') {
      unresolved.push({ campaign, rawShowName: d.best_show ?? '(no show)', reason: 'unrecognized' })
      continue
    }
    if (resolution.status === 'out_of_scope') {
      unresolved.push({ campaign, rawShowName: d.best_show ?? '', reason: 'out_of_scope', note: resolution.note })
      continue
    }
    resolutionByDirection.set(d.direction_id, resolution)
    const key = resolution.canonicalShow.trim().toLowerCase()
    const bucket = byShow.get(key)
    if (bucket) bucket.push(d)
    else byShow.set(key, [d])
  }

  const entries: ReducedEntry[] = []
  for (const dirs of Array.from(byShow.values())) {
    const byCategory = new Map<string, PlannerV3Direction[]>()
    for (const d of dirs) {
      const catKey = (d.best_category ?? '').trim().toLowerCase() || `__no_category_${d.direction_id}`
      const group = byCategory.get(catKey)
      if (group) group.push(d)
      else byCategory.set(catKey, [d])
    }

    const dedupedWinners = Array.from(byCategory.values()).map(group => {
      const sorted = group.slice().sort(preferActivityThenOrder)
      return { winner: sorted[0], deduped_count: group.length }
    })

    const capped = dedupedWinners
      .slice()
      .sort((a, b) => preferActivityThenOrder(a.winner, b.winner))
      .slice(0, MAX_CATEGORIES_PER_SHOW)

    for (const { winner, deduped_count } of capped) {
      const resolution = resolutionByDirection.get(winner.direction_id)!
      entries.push({
        campaign,
        resolution,
        category: winner.best_category,
        categoryFlag: categoryCrossCheck(resolution.canonicalShow, winner.best_category),
        direction_id: winner.direction_id,
        deduped_count,
      })
    }
  }

  return { entries, unresolved }
}

// ── Step 4: PRIORITY scoring (entry readiness x sourced rate; NEVER win_likelihood) ─

/** How much a lens leans on the sourced rate vs. entry readiness in the blend. */
const LENS_RATE_WEIGHT: Record<PlannerLens, number> = {
  maximize_visibility: 0.2,
  maximize_odds: 0.6,
  maximize_client_travel: 0.3,
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export type ScoredEntry = ReducedEntry & {
  priority_score: number
  rate_fact: RateFact | null
  /** Both displayable facts, surfaced separately in the UI (rate_fact is the scoring one). */
  shortlist_fact: RateFact | null
  win_fact: RateFact | null
  difficulty_known: boolean
  on_discipline: boolean
}

/**
 * Score one reduced entry. Entry readiness (campaign.entry_readiness / 10) is
 * ALWAYS present; a sourced win/shortlist rate (via getRateFact + the
 * mayDisplayNumber publish gate) blends in only when publishable — an absent
 * or unpublishable rate contributes NOTHING (never a guessed difficulty), and
 * `difficulty_known` flags that honestly. `win_likelihood` is never read here.
 */
export function scoreEntry(entry: ReducedEntry, rateFacts: RateFact[], ctx: PriorityContext): ScoredEntry {
  const readiness01 = clamp01(entry.campaign.entry_readiness / 10)

  const shortlistFact = getRateFact(rateFacts, entry.resolution.canonicalShow, 'shortlist_rate')
  const winFact = getRateFact(rateFacts, entry.resolution.canonicalShow, 'win_rate')
  const displayableShortlist = mayDisplayNumber(shortlistFact) ? shortlistFact : null
  const displayableWin = mayDisplayNumber(winFact) ? winFact : null
  // Prefer shortlist_rate (the broader, more forgiving odds signal) when both
  // are displayable; fall back to win_rate; else no rate at all.
  const bestFact = displayableShortlist ?? displayableWin ?? null
  const difficultyKnown = bestFact !== null && bestFact.value !== null

  const rate01 = difficultyKnown ? clamp01((bestFact!.value as number) / 100) : 0
  const rateWeight = difficultyKnown ? LENS_RATE_WEIGHT[ctx.lens] : 0
  const readinessWeight = 1 - rateWeight
  const priority_score = readinessWeight * readiness01 + rateWeight * rate01

  const showDiscipline = agencyShowDiscipline(ctx.discipline)
  const on_discipline = entry.resolution.facet ? facetAdmitsDiscipline(entry.resolution.facet, showDiscipline) : true

  return { ...entry, priority_score, rate_fact: bestFact, shortlist_fact: displayableShortlist, win_fact: displayableWin, difficulty_known: difficultyKnown, on_discipline }
}

// ── recommendFor(campaign) → placements — THE PRIMITIVE ──────────────────────

export type CampaignPlacements = {
  campaign: SelectedCampaign
  placements: ScoredEntry[]
  unresolved: UnresolvedEntry[]
}

/**
 * The primitive (spec: "recommendFor(campaign) → placements is the primitive;
 * the plan is the multi-campaign roll-up + budget bound"). Reduces, resolves,
 * and scores ONE campaign's directions — no region gate, no budget bounding,
 * no tiering (those are plan-level concerns in derivePlanV3, since budget is
 * shared across every selected campaign). This is the seam a future
 * "Where should this campaign go?" button on projects/[id] calls directly.
 */
export function recommendFor(
  campaign: SelectedCampaign,
  facets: PlannerFacet[],
  rateFacts: RateFact[],
  ctx: PriorityContext,
): CampaignPlacements {
  const { entries, unresolved } = reduceCampaign(campaign, facets)
  const placements = entries.map(e => scoreEntry(e, rateFacts, ctx))
  return { campaign, placements, unresolved }
}

// ── Plan-level: region gate, budget bounding, grouping, tiering ─────────────

export type PlannerV3Tier = 'core' | 'prestige' | 'specialist' | 'reserve'

/**
 * Per-entry eligibility determination. The engine NEVER silently passes or drops:
 * every state carries a `reason` the UI renders verbatim.
 *
 *  in_window       the first-aired date falls inside a FIRST_PUBLICATION window.
 *  out_of_window   it falls outside one. Demoted out of "Enter this cycle", never dropped.
 *  unverifiable    evaluable window, but no first-aired date was supplied.
 *  not_evaluable   we hold a window whose `rule` cannot be answered by a first-aired
 *                  date (RAN_DURING, RESULTS_PERIOD, PERFORMANCE_YEAR, UNCLASSIFIED).
 *                  Distinct from 'no window on file' (which sets no read at all) and
 *                  from 'unverifiable' (evaluable, just missing the date). Added
 *                  7 Aug 2026 with the EligibilityRule discriminator.
 *  not_applicable  the show's subject is NOT a campaign (agency-performance shows,
 *                  people/nomination shows), so there is no campaign date to check
 *                  and never will be. A positive statement, not a failure to check.
 *
 * `window` is null on not_applicable: there is no window to cite, and inventing an
 * empty one would let a caller render a date range that does not exist.
 */
export type EntryEligibility = {
  status: 'in_window' | 'out_of_window' | 'unverifiable' | 'not_evaluable' | 'not_applicable'
  window: EligibilityWindow | null
  campaignDate: string | null
  reason: string
}

export type PlacedEntry = ScoredEntry & {
  status: 'recommended' | 'reserve'
  /** Sourced fee in USD, or null when unsourced (never invented). */
  fee_usd: number | null
  /** True when fee_usd is a family/edition upper-bound estimate (e.g. MMA Smarties Vietnam via APAC). */
  fee_is_estimate: boolean
  region_dropped: boolean
  /** Optional eligibility read; absent = the show has no window on file (no claim). */
  eligibility?: EntryEligibility
}

export type ShowBlock = {
  show_name: string
  tier: PlannerV3Tier
  entries: PlacedEntry[]
  entry_count: number
  /** null when every entry's fee is unsourced (excluded from budget_total_usd, see fee_flag). */
  budget_usd: number | null
  fee_flag: 'ok' | 'partial_unsourced' | 'fully_unsourced'
  cycle_status: PlannerCycleStatus
  final_date: string | null
  /** Roll-up of eligibility across recommended entries. FOUR of these six states mean
   *  "no verdict was reached", and each says something different about why. Collapsing
   *  any of them into 'ok' is an unearned assurance (the 27 Jul 2026 'no_window' fix, and
   *  the 7 Aug 2026 rule-discriminator fix, are the same lesson twice).
   *  'no_window'      = this show publishes no window we hold; NOTHING was checked. The
   *                     common case: only 2 of the DEADLINES_2026 rows carry a window.
   *  'not_evaluable'  = we hold a window, but its rule cannot be answered by a first-aired
   *                     date. We are refusing, not failing.
   *  'not_applicable' = the show is not judged on a campaign at all, so no check exists
   *                     to run. Never render this as "not checked".
   *  'verify'         = evaluable, awaiting a date from the user. */
  eligibility_status: 'ok' | 'out_of_window' | 'verify' | 'no_window' | 'not_evaluable' | 'not_applicable'
}

export type PlannerV3Plan = {
  as_of_date: string
  resolved_region: PlannerRegion
  /** "N recommended entries across M shows" — spec's headline contract. Recommended-tier entries only. */
  headline_recommended_count: number
  headline_show_count: number
  shows: ShowBlock[]
  region_dropped: PlacedEntry[]
  unresolved: UnresolvedEntry[]
  /** Sum of every recommended+reserve entry's KNOWN fee only — unsourced fees never launder into this. */
  budget_total_usd: number
  /** Show names excluded from budget_total_usd because their fee is unsourced. */
  budget_excluded_shows: string[]
  zero_state: boolean
}

function safeBudgetUsd(budget: number, currency: CurrencyCode): number {
  try {
    return convert(Math.max(0, budget || 0), currency, 'USD').value
  } catch {
    // An unsourced currency has no dated rate (fx.convert throws by design).
    // Degrade to 0 affordable budget rather than crash the derivation.
    return 0
  }
}

function feeForResolution(resolution: Extract<ShowResolution, { status: 'resolved' }>): { fee_usd: number | null; is_estimate: boolean } {
  const key = resolveWinRateKey(resolution.canonicalShow)
  const fee = key ? ENTRY_FEES[key] : undefined
  if (!fee || typeof fee.base !== 'number' || fee.base <= 0) {
    return { fee_usd: null, is_estimate: false }
  }
  return { fee_usd: fee.base, is_estimate: !!resolution.feeIsUpperBoundEstimate }
}

// ── Eligibility (window ∩ campaign date) ─────────────────────────────────────
// Additive dimension over resolveCycleStatus: that fn answers "is the show's entry
// cycle open on asOfDate"; this answers "does the WORK qualify for that cycle's
// eligibility window". ISO YYYY-MM-DD strings compare lexicographically =
// chronologically, so no Date object is needed (keeps the derivation pure). Set
// ONLY when the show carries an eligibilityWindow; an absent window = no claim.

const _ELIG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtEligDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const mo = parseInt(m[2], 10)
  if (mo < 1 || mo > 12) return iso
  return parseInt(m[3], 10) + " " + _ELIG_MONTHS[mo - 1] + " " + m[1]
}

// Shows where a CAMPAIGN first-aired date is a category error rather than a
// missing datum (added 7 Aug 2026). Campaign Asia AOY judges an agency's own
// performance year, and the Women to Watch / Women Leading Change family judges a
// PERSON: there is no campaign, so there is no date, so "not checked" is the wrong
// thing to tell the user forever. Matched tolerantly via sameShow so name variants
// land; the AOY family is matched by isAoyShow instead because it appears under
// several names (16 live directions across 3 variants as of 6 Aug 2026).
// This is deliberately a curated list, not a read of entry_form.entry_subject:
// the engine is a pure derivation with no DB access, same as PRESTIGE_SHOW_NAMES.
const NO_CAMPAIGN_DATE_SHOWS: string[] = [
  'Campaign Asia Women to Watch APAC',
  'Campaign Asia Women Leading Change',
]

/** True when a campaign first-aired date is a meaningful question for this show.
 *
 * BOTH the raw and the alias-normalised name are tested against isAoyShow, and that
 * is load-bearing, not belt-and-braces. resolveShowV3 sets `canonicalShow` to the
 * RAW direction text unless MMA_EDITION_POLICY rewrites it (the known defect
 * asserted by fixture 9f), so an AOY direction entered under the real alias
 * 'campaign asia aoty' resolves its facet, fee and deadline correctly through
 * sameShow while isAoyShow on the raw string returns FALSE: it contains
 * 'campaign asia' but not 'agency of the year'. Testing only the raw name would
 * therefore have missed exactly the aliased AOY rows this gate exists for, and left
 * them reading "not checked" forever. NO_CAMPAIGN_DATE_SHOWS never had the problem
 * because sameShow alias-normalises both sides itself.
 * Caught by fixture 9i on first run, 7 Aug 2026. */
function eligibilityIsApplicable(canonicalShow: string): boolean {
  const normalised = normaliseKbShow(canonicalShow) ?? canonicalShow
  if (isAoyShow(canonicalShow) || isAoyShow(normalised)) return false
  return !NO_CAMPAIGN_DATE_SHOWS.some(n => sameShow(n, canonicalShow))
}

/** Human-readable label for a rule we cannot evaluate, used in the refusal reason. */
function unevaluableRuleText(rule: EligibilityRule): string {
  switch (rule) {
    case 'RAN_DURING':
      return "this show asks whether the work RAN during its window, not when it first ran, so a first-aired date cannot settle it"
    case 'RESULTS_PERIOD':
      return "this show's window bounds when the RESULTS were measured, not when the work first ran"
    case 'PERFORMANCE_YEAR':
      return "this show's window is an agency performance year, not a campaign date range"
    case 'UNCLASSIFIED':
      return "this show's own rules do not state what its date range measures, so we will not guess"
    default:
      return "this show's eligibility rule cannot be evaluated from a first-aired date"
  }
}

function resolveEligibility(
  canonicalShow: string,
  firstAired: string | null | undefined,
  deadlines: ShowDeadline[],
): EntryEligibility | undefined {
  // Applicability is checked FIRST and independently of whether a window exists:
  // for an AOY or people-subject show the answer is "this check does not apply",
  // which is true whether or not we hold dates. Returning undefined here instead
  // would roll up as 'no_window' = "not checked", implying a gap that will never
  // close.
  if (!eligibilityIsApplicable(canonicalShow)) {
    return {
      status: "not_applicable",
      window: null,
      campaignDate: null,
      reason: "Judged on the agency or the nominee, not on a campaign, so there is no campaign date to check against an eligibility window.",
    }
  }
  const found = deadlines.find(d => sameShow(d.show, canonicalShow))
  const window = found?.eligibilityWindow
  if (!window) return undefined // no window on file -> no eligibility claim
  const winText = fmtEligDate(window.start) + " to " + fmtEligDate(window.end)
  // A window whose rule a first-aired date cannot answer. Refuse, with the reason.
  // Comparing anyway is the failure this discriminator exists to prevent: it would
  // confidently mark ELIGIBLE work ineligible, which is worse than not checking.
  if (window.rule !== 'FIRST_PUBLICATION') {
    return {
      status: "not_evaluable",
      window,
      campaignDate: firstAired ?? null,
      reason: "Eligibility not checked: " + unevaluableRuleText(window.rule) + ". The published range is " + winText + ". Confirm against the entry kit.",
    }
  }
  if (!firstAired) {
    return {
      status: "unverifiable",
      window,
      campaignDate: null,
      reason: "Add this campaign's first-aired date to confirm it falls in the " + winText + " eligibility window.",
    }
  }
  if (firstAired >= window.start && firstAired <= window.end) {
    return {
      status: "in_window",
      window,
      campaignDate: firstAired,
      reason: "First ran " + fmtEligDate(firstAired) + ", inside the " + winText + " eligibility window.",
    }
  }
  const before = firstAired < window.start
  return {
    status: "out_of_window",
    window,
    campaignDate: firstAired,
    reason: before
      ? "First ran " + fmtEligDate(firstAired) + ", before this cycle's eligibility window opens (" + fmtEligDate(window.start) + "). Eligible a future cycle, not this one."
      : "First ran " + fmtEligDate(firstAired) + ", after this cycle's eligibility window closed (" + fmtEligDate(window.end) + ").",
  }
}

// Block-level roll-up over a show's RECOMMENDED entries. At least one in-window
// entry keeps the block in "Enter this cycle" (mixed blocks stay, per-entry
// reasons still render); every recommended entry out-of-window demotes the whole
// block; window-but-no-date only -> "verify". No window on any entry -> 'no_window'
// (an explicit "we checked nothing" state, never conflated with 'ok').
//
// not_applicable and not_evaluable are tested with EVERY, not SOME, and use it
// soundly: both are properties of the SHOW (its subject, and its window's rule),
// and a block is one show by construction, so they cannot mix with an evaluated
// state inside a block. Using `every` means that if that invariant ever breaks the
// block falls through to the evaluated branches rather than silently reporting a
// refusal for entries that were actually checked.
function blockEligibilityStatus(recommended: PlacedEntry[]): ShowBlock['eligibility_status'] {
  const elig = recommended.map(e => e.eligibility).filter((x): x is EntryEligibility => !!x)
  if (elig.length === 0) return 'no_window'
  if (elig.every(e => e.status === "not_applicable")) return "not_applicable"
  if (elig.every(e => e.status === "not_evaluable")) return "not_evaluable"
  const hasIn = elig.some(e => e.status === "in_window")
  const hasVerify = elig.some(e => e.status === "unverifiable")
  const hasOut = elig.some(e => e.status === "out_of_window")
  if (hasIn) return hasVerify ? "verify" : "ok"
  if (hasOut) return "out_of_window"
  return "verify"
}

// Curated PRESTIGE tier: marquee, hard-to-win shows, INDEPENDENT of geography
// (Ben's editorial call, 17 Jul 2026): Spikes Asia and Effie APAC are prestige
// plays in Asia despite being regional. Edit this list to change what reads as
// Prestige. Matched tolerantly via sameShow so name variants still land.
const PRESTIGE_SHOW_NAMES: string[] = [
  'Cannes Lions', 'D&AD', 'One Show', 'Clio Awards',
  'Spikes Asia', 'Dubai Lynx', 'Eurobest', 'London International Awards',
  'ADFEST', 'Effie APAC',
]
function isPrestigeShow(canonicalShow: string): boolean {
  return PRESTIGE_SHOW_NAMES.some(n => sameShow(n, canonicalShow))
}

function tierFor(entry: ScoredEntry, status: 'recommended' | 'reserve'): PlannerV3Tier {
  if (status === 'reserve') return 'reserve'
  // Prestige wins over the specialist axis and is NOT geography-derived.
  if (isPrestigeShow(entry.resolution.canonicalShow)) return 'prestige'
  const facet = entry.resolution.facet
  if (facet?.axis === 'specialist') return 'specialist'
  return 'core'
}

/**
 * Deterministic: same (input, facets, rate facts, deadlines) -> identical
 * plan. Pure function — no I/O, no Date.now(), no randomness (mirrors
 * planner-engine.ts's derivePlan contract).
 */
export function derivePlanV3(
  input: PlannerV3Input,
  facets: PlannerFacet[],
  rateFacts: RateFact[],
  deadlines: ShowDeadline[] = DEADLINES_2026,
): PlannerV3Plan {
  const userRegion = normalizeUserRegion(input.region)

  if (input.campaigns.length === 0) {
    return {
      as_of_date: input.asOfDate,
      resolved_region: userRegion,
      headline_recommended_count: 0,
      headline_show_count: 0,
      shows: [],
      region_dropped: [],
      unresolved: [],
      budget_total_usd: 0,
      budget_excluded_shows: [],
      zero_state: true,
    }
  }

  const ctx: PriorityContext = { discipline: input.discipline, lens: input.lens }
  const allUnresolved: UnresolvedEntry[] = []
  const allScored: ScoredEntry[] = []
  for (const campaign of input.campaigns) {
    const { placements, unresolved } = recommendFor(campaign, facets, rateFacts, ctx)
    allUnresolved.push(...unresolved)
    allScored.push(...placements)
  }

  // STEP 3 — region gate. Flag-drop, never remove: a region-inadmissible show
  // is excluded from the recommended/budget set but still returned (visible).
  const withRegion = allScored.map(e => {
    const facet = e.resolution.facet
    const dropped = facet ? !regionAdmits(userRegion, facet) : false
    return { entry: e, region_dropped: dropped }
  })
  const eligible = withRegion.filter(w => !w.region_dropped).map(w => w.entry)
  const regionDroppedEntries = withRegion.filter(w => w.region_dropped).map(w => w.entry)

  // STEP 4 (continued) — final sort: priority desc, then on-discipline first
  // (the P2.1 #5 "tilt, never a filter" lesson), then show name for stability.
  const sorted = eligible.slice().sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score
    if (a.on_discipline !== b.on_discipline) return a.on_discipline ? -1 : 1
    return a.resolution.canonicalShow.localeCompare(b.resolution.canonicalShow)
  })

  // STEP 6 — budget bounding. An unsourced fee cannot be tested against the
  // budget (no invented number to test with), so it never consumes capacity
  // and always ranks into `recommended`; a known fee fills while affordable,
  // then demotes to `reserve` (never dropped).
  const budgetUsd = safeBudgetUsd(input.budget, input.budgetCurrency)
  let spent = 0
  const placed: PlacedEntry[] = []
  for (const entry of sorted) {
    const { fee_usd, is_estimate } = feeForResolution(entry.resolution)
    let status: 'recommended' | 'reserve'
    if (fee_usd === null) {
      status = 'recommended'
    } else if (spent + fee_usd <= budgetUsd) {
      status = 'recommended'
      spent += fee_usd
    } else {
      status = 'reserve'
    }
    const eligibility = resolveEligibility(entry.resolution.canonicalShow, entry.campaign.first_aired, deadlines)
    placed.push({ ...entry, status, fee_usd, fee_is_estimate: is_estimate, region_dropped: false, eligibility })
  }
  const regionDropped: PlacedEntry[] = regionDroppedEntries.map(entry => {
    const { fee_usd, is_estimate } = feeForResolution(entry.resolution)
    return { ...entry, status: 'reserve', fee_usd, fee_is_estimate: is_estimate, region_dropped: true }
  })

  // STEP 5/7 — group by resolved show, tier, attach deadline.
  const byShow = new Map<string, PlacedEntry[]>()
  for (const p of placed) {
    const key = p.resolution.canonicalShow.trim().toLowerCase()
    const group = byShow.get(key)
    if (group) group.push(p)
    else byShow.set(key, [p])
  }

  const shows: ShowBlock[] = Array.from(byShow.values()).map(entries => {
    const showName = entries[0].resolution.canonicalShow
    const { status: cycle_status, finalDate } = resolveCycleStatus(showName, input.asOfDate, deadlines)
    const known = entries.filter(e => e.fee_usd !== null)
    const budget_usd = known.length > 0 ? known.reduce((sum, e) => sum + (e.fee_usd as number), 0) : null
    const fee_flag: ShowBlock['fee_flag'] =
      known.length === entries.length ? 'ok' : known.length === 0 ? 'fully_unsourced' : 'partial_unsourced'
    const tieredEntries = entries.map(e => ({ ...e, tier_computed: tierFor(e, e.status) }))
    // Tier for the block = the tier of its recommended entries (or 'reserve'
    // if every entry in the block is reserve-only).
    const blockTier: PlannerV3Tier = tieredEntries.some(e => e.status === 'recommended')
      ? tierFor(tieredEntries.find(e => e.status === 'recommended')!, 'recommended')
      : 'reserve'
    return {
      show_name: showName,
      tier: blockTier,
      entries: tieredEntries.map(({ tier_computed, ...rest }) => rest),
      entry_count: entries.length,
      budget_usd,
      fee_flag,
      cycle_status,
      final_date: finalDate,
      eligibility_status: blockEligibilityStatus(entries.filter(e => e.status === 'recommended')),
    }
  })

  shows.sort((a, b) => {
    const aBest = Math.max(...a.entries.map(e => e.priority_score))
    const bBest = Math.max(...b.entries.map(e => e.priority_score))
    return bBest - aBest
  })

  const budget_total_usd = shows.reduce((sum, s) => sum + (s.budget_usd ?? 0), 0)
  const budget_excluded_shows = shows.filter(s => s.fee_flag !== 'ok').map(s => s.show_name)
  const recommendedShows = shows.filter(s => s.entries.some(e => e.status === 'recommended'))

  return {
    as_of_date: input.asOfDate,
    resolved_region: userRegion,
    headline_recommended_count: shows.reduce((sum, s) => sum + s.entries.filter(e => e.status === 'recommended').length, 0),
    headline_show_count: recommendedShows.length,
    shows,
    region_dropped: regionDropped,
    unresolved: allUnresolved,
    budget_total_usd,
    budget_excluded_shows,
    zero_state: false,
  }
}
