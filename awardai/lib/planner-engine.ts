/**
 * planner-engine.ts — Portfolio Planner v2's deterministic derivation.
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA + USER
 * MODEL & FLOW v2 sections (the amendments win). Build session P1; revised in
 * P2.1 (Planner-v2-P2.1-REVISION-PROMPTS-2026-07.md) for:
 *   #6 REGION GATE — the plan now filters national/regional shows by the user's
 *      market (region was inert before; a China agency was offered PRCA UK etc.)
 *   #5 DISCIPLINE TILT — discipline stopped being a hard universe filter and
 *      became an ordering nudge, so region+discipline together no longer collapse
 *      a lane to one show. Region stays hard; discipline leans.
 *   #4 CAMPAIGNS-READY — the real planning unit. Budget sizes DEPTH (how many
 *      entries you can fund); campaigns-ready sizes BREADTH (how much distinct
 *      work there is to place). entries-per-campaign is DERIVED from the two,
 *      never an assumed fan-out ratio.
 *
 * Pipeline (USER MODEL & FLOW v2 §Step 3, "the Engine"), in order:
 *   1. FILTER the universe: drop facet-excluded + user-excluded shows; apply the
 *      REGION gate (national/regional must match the user's market; global always
 *      eligible; pins bypass). Discipline no longer filters here — it tilts (2/3).
 *   2. WEIGHT axes by discipline + maturity + lens (three preset lenses, never raw sliders)
 *   3. LADDER by geo_scope (national floor -> regional core -> global curated),
 *      with a discipline-affinity tilt so on-discipline shows lead, and a
 *      campaigns-ready BREADTH cap that demotes overflow to flexible_reserve.
 *   4. Respect pins/excludes, brand-mode lane defaults, and DEADLINE AWARENESS
 *      (a closed-cycle show returns `next_cycle` status, never a live recommendation)
 *   5. Output: three lanes (work portfolio by axis / agency titles / people)
 *
 * FUTURE (P2.1 #4 note, do not build yet): campaigns-ready is a COUNT today
 * ({campaignsReady:N}). The intended end-state replaces it with the user's real
 * uploaded projects — an array carrying each project's eligibility window and
 * candidate categories — so the plan can say "based on your projects, their
 * eligibility periods, and the categories that fit, here is the recommendation."
 * To keep that door open WITHOUT painting into a corner: the capacity input is
 * read only inside deriveCapacity() below (one boundary — swap the scalar for a
 * Project[] there and nothing else changes), and every line item keeps its
 * final_date/cycle_status so a later pass can intersect project eligibility with
 * show deadlines. We do NOT model per-show category counts here (that is the
 * project-derived pass); breadth/depth are sized from the two inputs, nothing more.
 *
 * DETERMINISM (the Shankar requirement): same inputs -> identical plan. This
 * module never reads Date.now()/new Date() internally — every derivation takes an
 * explicit `asOfDate`. No randomness anywhere.
 *
 * NO rate, odds, or win-likelihood logic anywhere in this file. Odds come only
 * from lib/rate-facts.ts / <GatedNumber/>. This engine only ever answers "which
 * shows, in what allocation" — never "what are the odds."
 * =============================================================================
 */

import type { PlannerFacet, PlannerAxis, PlannerShowDiscipline, PlannerGeoScope, PlannerRegion } from '@/lib/planner-facets'
import { isExcludedFacet, facetAdmitsDiscipline, regionAdmits, normalizeUserRegion } from '@/lib/planner-facets'
import { sameShow } from '@/lib/show-taxonomy'
import { convert, type CurrencyCode } from '@/lib/fx'
import { DEADLINES_2026, type ShowDeadline } from '@/lib/shows-data'

// ── Agency-side inputs (Step 0-2 of the five-step flow) ─────────────────────

/**
 * The AGENCY's declared/derived discipline (Step 0's new first-class input).
 * Distinct from a show's own PlannerShowDiscipline (lib/planner-facets.ts);
 * 'full_service' has no show-side equivalent and means "no discipline tilt."
 */
export type PlannerAgencyDiscipline = 'media' | 'creative' | 'PR' | 'mobile_performance' | 'full_service'

export type PlannerMaturity = 'beginner' | 'intermediate' | 'advanced'

/** The three preset lenses. No raw sliders — the data cannot back that precision. */
export type PlannerLens = 'maximize_visibility' | 'maximize_odds' | 'maximize_client_travel'

/** Mirrors agency_profiles.org_type's CHECK constraint. Drives the brand-mode lane default. */
export type PlannerOrgType = 'agency' | 'brand' | 'production_company' | 'media_agency' | 'consultancy'

export type PlannerInput = {
  discipline: PlannerAgencyDiscipline
  maturity: PlannerMaturity
  /** Free-text home market / region (a picker enum value, or a city/country — normalizeUserRegion handles both). */
  region: string
  budget: number
  budgetCurrency: string
  /**
   * How many award-worthy campaigns the agency believes it has ready (P2.1 #4).
   * The real planning unit — nobody thinks in entries. Sizes plan BREADTH.
   * null = not supplied (breadth uncapped; budget alone sizes the plan).
   */
  campaignsReady: number | null
  targetTitle?: string
  /** Show names the user has explicitly pinned in — always included, bypassing region gate + tilt. */
  pins: string[]
  /** Show names the user has explicitly excluded — removed regardless of any other rule. */
  excludes: string[]
  lens: PlannerLens
  orgType: PlannerOrgType
}

/**
 * agency_profiles.planner_prefs shape (VERSIONED from day one — scenarios ship
 * empty in v1 but the shape is future-proof, USER MODEL & FLOW v2 §5).
 */
export type PlannerPrefs = {
  schema_version: 1
  updated_by: string | null
  current: {
    discipline: PlannerAgencyDiscipline | null
    maturity: PlannerMaturity | null
    region: string | null
    budget: number | null
    budget_currency: string | null
    /** P2.1 #4 — persisted so a saved plan reproduces (the old capacity figure was UI-only and lost on reload). */
    campaigns_ready: number | null
    target_title: string | null
    pins: string[]
    excludes: string[]
    lens: PlannerLens | null
  }
  scenarios: unknown[] // empty in v1 by design; the shape is reserved for v1.5 named scenarios
}

// ── Discipline mapping (agency-side -> show-side) ────────────────────────────

const AGENCY_TO_SHOW_DISCIPLINE: Record<Exclude<PlannerAgencyDiscipline, 'full_service'>, PlannerShowDiscipline> = {
  media: 'media',
  creative: 'creative',
  PR: 'PR',
  mobile_performance: 'mobile',
}

/** null means "full-service: no discipline tilt" (facetAdmitsDiscipline treats null as admit-all). */
function agencyShowDiscipline(discipline: PlannerAgencyDiscipline): PlannerShowDiscipline | null {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}

// ── Capacity anchors (P2.1 #4) ───────────────────────────────────────────────

/**
 * A transparent, documented typical sourced single ENTRY fee, in USD, used only
 * to turn a budget into an affordable-ENTRIES estimate. Entry fees only — never
 * production cost (P2.1 #3: video production varies too wildly to model). Rough
 * planning anchor (cleared sourced fees run ~$625-$778), never a per-show number,
 * never surfaced as precision. One place to tune. Kept in the engine so the page
 * and the fixture share one source.
 */
export const TYPICAL_ENTRY_FEE_USD = 700

/**
 * How many shows one campaign can be spread across before the spread stops being
 * meaningful — the BREADTH multiplier on campaigns-ready. A documented v1
 * heuristic, not a measured fan-out ratio (we do not claim to know how many
 * shows a given campaign "should" enter). One place to tune.
 */
export const TARGET_SHOWS_PER_CAMPAIGN = 3

// ── Axis weighting (Step 3.2: WEIGHT axes by discipline + maturity + lens) ──

const BASE_WEIGHTS_BY_MATURITY: Record<PlannerMaturity, Record<PlannerAxis, number>> = {
  beginner: { effectiveness: 0.35, craft: 0.25, creative_fame: 0.05, specialist: 0.35 },
  intermediate: { effectiveness: 0.3, craft: 0.25, creative_fame: 0.15, specialist: 0.3 },
  advanced: { effectiveness: 0.2, craft: 0.25, creative_fame: 0.3, specialist: 0.25 },
}

/** Multiplicative tilt applied on top of the maturity base, then renormalized. */
const LENS_TILT: Record<PlannerLens, Record<PlannerAxis, number>> = {
  maximize_visibility: { effectiveness: 1.0, craft: 1.1, creative_fame: 1.5, specialist: 1.2 },
  maximize_odds: { effectiveness: 1.1, craft: 0.9, creative_fame: 0.6, specialist: 1.4 },
  maximize_client_travel: { effectiveness: 1.5, craft: 0.9, creative_fame: 0.8, specialist: 0.9 },
}

/** A small discipline nudge on top of maturity + lens. full_service gets no nudge (all 1.0). */
const DISCIPLINE_TILT: Record<PlannerAgencyDiscipline, Record<PlannerAxis, number>> = {
  media: { effectiveness: 1.2, craft: 0.9, creative_fame: 0.9, specialist: 1.1 },
  creative: { effectiveness: 0.95, craft: 1.15, creative_fame: 1.1, specialist: 1.0 },
  PR: { effectiveness: 1.05, craft: 0.85, creative_fame: 0.75, specialist: 1.25 },
  mobile_performance: { effectiveness: 1.25, craft: 0.85, creative_fame: 0.8, specialist: 1.05 },
  full_service: { effectiveness: 1.0, craft: 1.0, creative_fame: 1.0, specialist: 1.0 },
}

const AXES: PlannerAxis[] = ['effectiveness', 'craft', 'creative_fame', 'specialist']

/** Normalized (sums to 1) axis weights for a given maturity + lens + discipline. Deterministic, pure. */
export function computeAxisWeights(
  maturity: PlannerMaturity,
  lens: PlannerLens,
  discipline: PlannerAgencyDiscipline,
): Record<PlannerAxis, number> {
  const base = BASE_WEIGHTS_BY_MATURITY[maturity]
  const lensT = LENS_TILT[lens]
  const discT = DISCIPLINE_TILT[discipline]
  const raw: Record<PlannerAxis, number> = { effectiveness: 0, craft: 0, creative_fame: 0, specialist: 0 }
  let total = 0
  for (const axis of AXES) {
    const v = base[axis] * lensT[axis] * discT[axis]
    raw[axis] = v
    total += v
  }
  const normalized: Record<PlannerAxis, number> = { effectiveness: 0, craft: 0, creative_fame: 0, specialist: 0 }
  for (const axis of AXES) {
    normalized[axis] = total > 0 ? raw[axis] / total : 0.25
  }
  return normalized
}

// ── Geo ladder (Step 3.3: national floor -> regional core -> global curated) ─

const GLOBAL_SLOT_CAP_BY_MATURITY: Record<PlannerMaturity, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 4,
}

const GEO_PRIORITY: Record<PlannerGeoScope, number> = { national: 0, regional: 1, global: 2 }

// ── Deadline awareness ───────────────────────────────────────────────────────

export type PlannerCycleStatus = 'live' | 'next_cycle' | 'unknown_cycle'

export function resolveCycleStatus(
  showName: string,
  asOfDate: string,
  deadlines: ShowDeadline[] = DEADLINES_2026,
): { status: PlannerCycleStatus; finalDate: string | null } {
  const found = deadlines.find(d => sameShow(d.show, showName))
  if (!found || !found.finalDate) {
    return { status: 'unknown_cycle', finalDate: null }
  }
  const asOf = new Date(asOfDate + 'T00:00:00')
  const final = new Date(found.finalDate + 'T00:00:00')
  return { status: final < asOf ? 'next_cycle' : 'live', finalDate: found.finalDate }
}

// ── Capacity derivation (P2.1 #4) ────────────────────────────────────────────

/**
 * Turn budget + campaigns-ready into the transparent capacity block. Budget is
 * DEPTH (affordable entries); campaigns-ready is BREADTH. entries-per-campaign
 * is DERIVED (affordable / campaigns) — division of two user inputs, not an
 * assumed fan-out. THIS FUNCTION IS THE ONE BOUNDARY the future project-derived
 * model swaps through: replace `campaignsReady: number | null` with the user's
 * Project[] here and nothing downstream changes.
 */
export type PlannerCapacity = {
  budget_usd: number
  typical_entry_fee_usd: number
  affordable_entries: number
  campaigns_ready: number | null
  /** affordable_entries / campaigns_ready, or null if campaigns not supplied. */
  entries_per_campaign: number | null
  /** True when the budget cannot fund even one entry per campaign (raise budget or cut campaigns). */
  under_budgeted: boolean
  /** Max recommended (non-reserve) work shows given the campaigns supply. null = uncapped. */
  max_recommended_shows: number | null
}

function safeBudgetUsd(budget: number, currency: string): number {
  try {
    return convert(Math.max(0, budget || 0), currency as CurrencyCode, 'USD').value
  } catch {
    // An unsourced currency has no dated rate (fx.convert throws by design).
    // Degrade to 0 affordable entries rather than crash the derivation.
    return 0
  }
}

export function deriveCapacity(input: PlannerInput): PlannerCapacity {
  const budgetUsd = safeBudgetUsd(input.budget, input.budgetCurrency)
  const affordableEntries = TYPICAL_ENTRY_FEE_USD > 0 ? Math.floor(budgetUsd / TYPICAL_ENTRY_FEE_USD) : 0
  const campaigns = input.campaignsReady != null && input.campaignsReady > 0 ? input.campaignsReady : null
  const entriesPerCampaign = campaigns ? affordableEntries / campaigns : null
  const underBudgeted = entriesPerCampaign !== null && entriesPerCampaign < 1
  const maxRecommended = campaigns ? Math.max(1, campaigns * TARGET_SHOWS_PER_CAMPAIGN) : null
  return {
    budget_usd: budgetUsd,
    typical_entry_fee_usd: TYPICAL_ENTRY_FEE_USD,
    affordable_entries: affordableEntries,
    campaigns_ready: campaigns,
    entries_per_campaign: entriesPerCampaign,
    under_budgeted: underBudgeted,
    max_recommended_shows: maxRecommended,
  }
}

// ── Output shape ──────────────────────────────────────────────────────────────

export type PlannerLineItem = {
  show_name: string
  facet: PlannerFacet
  cycle_status: PlannerCycleStatus
  final_date: string | null
  /** Which allocation tier this line sits in, work-lane only ('titles'/'people' lines omit this). */
  tier?: 'core' | 'prestige' | 'flexible_reserve'
  /** True iff this work show is on the agency's discipline (P2.1 #5 tilt — used for display, not filtering). */
  on_discipline?: boolean
  pinned: boolean
}

export type PlannerCoverageGap = {
  region: string
  reason: string
}

export type PlannerPlan = {
  input: PlannerInput
  as_of_date: string
  /** The user's home market normalised to a PlannerRegion (what the gate actually used). */
  resolved_region: PlannerRegion
  axis_weights: Record<PlannerAxis, number>
  capacity: PlannerCapacity
  work: PlannerLineItem[]
  agency_titles: PlannerLineItem[]
  people: PlannerLineItem[]
  lane_defaults: { agency_titles_visible: boolean; people_visible: boolean }
  coverage_gaps: PlannerCoverageGap[]
  excluded_not_directly_enterable: string[]
}

// ── The derivation ────────────────────────────────────────────────────────────

/**
 * Deterministic: same (input, facets, deadlines, asOfDate) -> identical plan.
 * Pure function — no I/O, no Date.now(), no randomness.
 */
export function derivePlan(
  input: PlannerInput,
  facets: PlannerFacet[],
  asOfDate: string,
  deadlines: ShowDeadline[] = DEADLINES_2026,
): PlannerPlan {
  const showDiscipline = agencyShowDiscipline(input.discipline)
  const userRegion = normalizeUserRegion(input.region)
  const excludedNotEnterable: string[] = []

  const isPinned = (name: string) => input.pins.some(p => sameShow(p, name))
  const isUserExcluded = (name: string) => input.excludes.some(e => sameShow(e, name))

  // STEP 1 — FILTER. Facet-excluded + user-excluded shows are removed. The
  // REGION gate (P2.1 #6) removes national/regional shows outside the user's
  // market. Pins bypass region. Discipline NO LONGER filters here (P2.1 #5) —
  // it becomes a sort tilt below.
  const filtered = facets.filter(f => {
    if (isExcludedFacet(f)) {
      excludedNotEnterable.push(f.show_name)
      return false
    }
    if (isUserExcluded(f.show_name)) return false
    if (isPinned(f.show_name)) return true
    return regionAdmits(userRegion, f)
  })

  const axisWeights = computeAxisWeights(input.maturity, input.lens, input.discipline)
  const capacity = deriveCapacity(input)

  const toLineItem = (f: PlannerFacet): PlannerLineItem => {
    const { status, finalDate } = resolveCycleStatus(f.show_name, asOfDate, deadlines)
    return {
      show_name: f.show_name,
      facet: f,
      cycle_status: status,
      final_date: finalDate,
      pinned: isPinned(f.show_name),
    }
  }

  // STEP 3 — LADDER (work lane only). Sort by geo priority (national first),
  // then by DISCIPLINE AFFINITY (on-discipline shows lead — the P2.1 #5 tilt),
  // then by axis weight, then alphabetical. Discipline no longer removes shows;
  // it only leans the order.
  const admitsDisc = (f: PlannerFacet) => facetAdmitsDiscipline(f, showDiscipline)
  const workFacets = filtered.filter(f => f.kind === 'work')
  const workSorted = workFacets.slice().sort((a, b) => {
    const ga = GEO_PRIORITY[a.geo_scope ?? 'global']
    const gb = GEO_PRIORITY[b.geo_scope ?? 'global']
    if (ga !== gb) return ga - gb
    const da = admitsDisc(a) ? 0 : 1
    const db = admitsDisc(b) ? 0 : 1
    if (da !== db) return da - db
    const wa = a.axis ? axisWeights[a.axis] : 0
    const wb = b.axis ? axisWeights[b.axis] : 0
    if (wa !== wb) return wb - wa
    return a.show_name.localeCompare(b.show_name)
  })

  // Tiering: national/regional -> core, global -> prestige (capped by maturity),
  // overflow global -> flexible_reserve. THEN the campaigns-ready BREADTH cap
  // (P2.1 #4): only the first max_recommended_shows non-reserve lines stay
  // recommended; the rest demote to flexible_reserve (never dropped). Pins are
  // immune to both caps. workSorted is already in priority order, so the cap
  // trims the lowest-priority overflow.
  let globalSlotsUsed = 0
  const globalCap = GLOBAL_SLOT_CAP_BY_MATURITY[input.maturity]
  const maxRecommended = capacity.max_recommended_shows
  let recommendedUsed = 0
  const work: PlannerLineItem[] = workSorted.map(f => {
    const li = toLineItem(f)
    const geo = f.geo_scope ?? 'global'
    let tier: PlannerLineItem['tier']
    if (geo === 'global') {
      if (li.pinned || globalSlotsUsed < globalCap) {
        tier = 'prestige'
        if (!li.pinned) globalSlotsUsed += 1
      } else {
        tier = 'flexible_reserve'
      }
    } else {
      tier = 'core'
    }
    // Campaigns-ready breadth cap (pins immune).
    if (tier !== 'flexible_reserve' && !li.pinned) {
      if (maxRecommended !== null && recommendedUsed >= maxRecommended) {
        tier = 'flexible_reserve'
      } else {
        recommendedUsed += 1
      }
    } else if (tier !== 'flexible_reserve' && li.pinned) {
      recommendedUsed += 1
    }
    return { ...li, tier, on_discipline: admitsDisc(f) }
  })

  // AGENCY TITLES + PEOPLE lanes: no axis/geo ladder, but STILL region-gated
  // (a China agency should not be offered Campaign UK/US AOY — P2.1 #6) and
  // deadline-aware. Pins already bypassed the region gate in the filter pass.
  const agencyTitles = filtered.filter(f => f.kind === 'agency_title').map(toLineItem)
  const people = filtered.filter(f => f.kind === 'people').map(toLineItem)

  const isBrand = input.orgType === 'brand'
  const laneDefaults = {
    agency_titles_visible: !isBrand,
    people_visible: true,
  }

  // Coverage gaps. (1) No live national-floor candidate for the region. (2)
  // Discipline-tilt fallback: a discipline-specific agency whose recommended
  // work lane has NO on-discipline show — surface it so the cross-discipline
  // lean is explicit, not silent (P2.1 #5).
  const coverageGaps: PlannerCoverageGap[] = []
  const hasNationalFloor = work.some(
    li => (li.facet.geo_scope ?? 'global') === 'national' && li.cycle_status === 'live',
  )
  if (!hasNationalFloor) {
    coverageGaps.push({
      region: input.region,
      reason:
        'No live national-scope show is covered for this region/discipline yet. Flag for a show request rather than defaulting to a regional/global-only plan silently.',
    })
  }
  const recommended = work.filter(li => li.tier !== 'flexible_reserve')
  if (showDiscipline !== null && recommended.length > 0 && !recommended.some(li => li.on_discipline)) {
    coverageGaps.push({
      region: input.region,
      reason:
        'No show on your exact discipline is available for this market, so the plan leans on adjacent-discipline shows. A tighter fit may need a show request.',
    })
  }

  return {
    input,
    as_of_date: asOfDate,
    resolved_region: userRegion,
    axis_weights: axisWeights,
    capacity,
    work,
    agency_titles: agencyTitles,
    people,
    lane_defaults: laneDefaults,
    coverage_gaps: coverageGaps,
    excluded_not_directly_enterable: excludedNotEnterable,
  }
}
