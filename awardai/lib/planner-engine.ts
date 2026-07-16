/**
 * planner-engine.ts — Portfolio Planner v2's deterministic derivation.
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA + USER
 * MODEL & FLOW v2 sections (the amendments win). Build session P1.
 *
 * Pipeline (USER MODEL & FLOW v2 §Step 3, "the Engine"), in order:
 *   1. FILTER the universe by discipline (facet match + discipline-agnostic shows)
 *   2. WEIGHT axes by discipline + maturity + lens (three preset lenses, never raw sliders)
 *   3. LADDER by geo_scope (national floor -> regional core -> global curated, tilt by maturity)
 *   4. Respect pins/excludes, brand-mode lane defaults, and DEADLINE AWARENESS
 *      (a closed-cycle show returns `next_cycle` status, never a live recommendation)
 *   5. Output: three lanes (work portfolio by axis / agency titles / people)
 *
 * DETERMINISM (the Shankar requirement, USER MODEL & FLOW v2 §Iteration
 * mechanics): same inputs -> identical plan. This module never reads
 * `Date.now()`/`new Date()` internally — every derivation takes an explicit
 * `asOfDate` so callers (and the fixture) get byte-identical output for
 * byte-identical input. No randomness anywhere.
 *
 * NO rate, odds, or win-likelihood logic anywhere in this file. Odds come only
 * from lib/rate-facts.ts / <GatedNumber/>, already live (Phase 2 of the
 * win-rate reconciliation). This engine only ever answers "which shows, in
 * what allocation" — never "what are the odds."
 * =============================================================================
 */

import type { PlannerFacet, PlannerAxis, PlannerShowDiscipline, PlannerGeoScope } from '@/lib/planner-facets'
import { isExcludedFacet, facetAdmitsDiscipline } from '@/lib/planner-facets'
import { sameShow } from '@/lib/show-taxonomy'
import { DEADLINES_2026, type ShowDeadline } from '@/lib/shows-data'

// ── Agency-side inputs (Step 0-2 of the five-step flow) ─────────────────────

/**
 * The AGENCY's declared/derived discipline (Step 0's new first-class input —
 * "the new first-class input Part 2 was missing"). Distinct from a show's own
 * PlannerShowDiscipline (lib/planner-facets.ts); 'full_service' has no show-side
 * equivalent and means "apply no discipline filter at all."
 */
export type PlannerAgencyDiscipline = 'media' | 'creative' | 'PR' | 'mobile_performance' | 'full_service'

export type PlannerMaturity = 'beginner' | 'intermediate' | 'advanced'

/** The three preset lenses (USER MODEL & FLOW v2 §Iteration mechanics, tier 2). No raw sliders — the data cannot back that precision. */
export type PlannerLens = 'maximize_visibility' | 'maximize_odds' | 'maximize_client_travel'

/** Mirrors agency_profiles.org_type's CHECK constraint. Drives the brand-mode lane default. */
export type PlannerOrgType = 'agency' | 'brand' | 'production_company' | 'media_agency' | 'consultancy'

export type PlannerInput = {
  discipline: PlannerAgencyDiscipline
  maturity: PlannerMaturity
  region: string
  budget: number
  budgetCurrency: string
  targetTitle?: string
  /** Show names the user has explicitly pinned in — always included, bypassing the discipline filter. */
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

/** null means "full-service: no discipline filter" (facetAdmitsDiscipline treats null as admit-all). */
function agencyShowDiscipline(discipline: PlannerAgencyDiscipline): PlannerShowDiscipline | null {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}

// ── Axis weighting (Step 3.2: WEIGHT axes by discipline + maturity + lens) ──

/**
 * v1 heuristic weighting. The USER MODEL & FLOW v2 spec deliberately rejects
 * raw KPI sliders ("sliders imply precision the data cannot back") in favour
 * of three preset lenses — but it does not hand down exact numeric weights,
 * because none of this is backed by a rate the way fees/GatedNumber facts are.
 * These base weights are a transparent, documented, ONE-PLACE-TO-TUNE starting
 * point (this const only), never surfaced to the user as measured precision.
 * Ben can retune BASE_WEIGHTS_BY_MATURITY / LENS_TILT / DISCIPLINE_TILT without
 * touching the derivation logic.
 */
const BASE_WEIGHTS_BY_MATURITY: Record<PlannerMaturity, Record<PlannerAxis, number>> = {
  // Beginner: Core = effectiveness + specialist (per spec's "usually
  // effectiveness + craft + specialist for a beginner/intermediate"), minimal
  // creative-fame (Prestige is "minimal or absent for beginner").
  beginner: { effectiveness: 0.35, craft: 0.25, creative_fame: 0.05, specialist: 0.35 },
  intermediate: { effectiveness: 0.3, craft: 0.25, creative_fame: 0.15, specialist: 0.3 },
  // Advanced: Prestige (creative_fame) grows, curated/best-only per spec.
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

/**
 * How many global-scope slots the ladder allows per axis, by maturity. The
 * WPP Media Vietnam pattern: national must-win -> regional core -> global
 * prestige, tilt by maturity — beginner gets almost no global slots, advanced
 * gets the most (Prestige "entered curated / best-only, sized down").
 */
const GLOBAL_SLOT_CAP_BY_MATURITY: Record<PlannerMaturity, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 4,
}

const GEO_PRIORITY: Record<PlannerGeoScope, number> = { national: 0, regional: 1, global: 2 }

// ── Deadline awareness ───────────────────────────────────────────────────────

export type PlannerCycleStatus = 'live' | 'next_cycle' | 'unknown_cycle'

/**
 * Resolve a show's deadline status against `asOfDate`. A closed-cycle show
 * (its DEADLINES_2026 finalDate already passed relative to asOfDate) returns
 * 'next_cycle' — never a live recommendation. A show with no deadline data at
 * all (a dynamic_shows-only show with no DEADLINES_2026 entry and no
 * deadline_date) returns 'unknown_cycle', also never counted as live.
 */
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

// ── Output shape ──────────────────────────────────────────────────────────────

export type PlannerLineItem = {
  show_name: string
  facet: PlannerFacet
  cycle_status: PlannerCycleStatus
  final_date: string | null
  /** Which allocation tier this line sits in, work-lane only ('titles'/'people' lines omit this). */
  tier?: 'core' | 'prestige' | 'flexible_reserve'
  pinned: boolean
}

export type PlannerCoverageGap = {
  region: string
  reason: string
}

export type PlannerPlan = {
  input: PlannerInput
  as_of_date: string
  axis_weights: Record<PlannerAxis, number>
  work: PlannerLineItem[]
  agency_titles: PlannerLineItem[]
  people: PlannerLineItem[]
  /**
   * Brand-mode lane visibility default. "Defaults tilt, never restrict"
   * (Ben, 16 Jul): the titles lane is still fully computed above; this is
   * only a UI default the caller may honor or override, never a removal of
   * axis/lane choice.
   */
  lane_defaults: { agency_titles_visible: boolean; people_visible: boolean }
  coverage_gaps: PlannerCoverageGap[]
  excluded_not_directly_enterable: string[]
}

// ── The derivation ────────────────────────────────────────────────────────────

/**
 * Deterministic: same (input, facets, deadlines, asOfDate) -> identical plan.
 * Pure function — no I/O, no Date.now(), no randomness. Callers fetch
 * `facets` via lib/planner-facets.ts's fetchPlannerFacets() and pass
 * DEADLINES_2026 (or a fixture's fixed deadline list) plus an explicit
 * asOfDate.
 */
export function derivePlan(
  input: PlannerInput,
  facets: PlannerFacet[],
  asOfDate: string,
  deadlines: ShowDeadline[] = DEADLINES_2026,
): PlannerPlan {
  const showDiscipline = agencyShowDiscipline(input.discipline)
  const excludedNotEnterable: string[] = []

  const isPinned = (name: string) => input.pins.some(p => sameShow(p, name))
  const isUserExcluded = (name: string) => input.excludes.some(e => sameShow(e, name))

  // STEP 1 — FILTER (facet-excluded shows removed entirely; user excludes
  // removed entirely; discipline filter applies unless pinned or the facet/
  // agency admits it).
  const filtered = facets.filter(f => {
    if (isExcludedFacet(f)) {
      excludedNotEnterable.push(f.show_name)
      return false
    }
    if (isUserExcluded(f.show_name)) return false
    if (isPinned(f.show_name)) return true
    return facetAdmitsDiscipline(f, showDiscipline)
  })

  const axisWeights = computeAxisWeights(input.maturity, input.lens, input.discipline)

  // Build a line item with cycle status resolved (deadline awareness).
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

  // STEP 3 — LADDER, applied within the work lane only. Sort by geo priority
  // (national first) then by axis weight (higher-weighted axis first) so the
  // "national floor -> regional core -> global curated" ordering is stable
  // and deterministic. Cap global-scope lines per the maturity slot cap;
  // anything beyond the cap for a global show still appears but demoted to
  // 'flexible_reserve' rather than dropped, so pins are never silently lost.
  const workFacets = filtered.filter(f => f.kind === 'work')
  const workSorted = workFacets.slice().sort((a, b) => {
    const ga = GEO_PRIORITY[a.geo_scope ?? 'global']
    const gb = GEO_PRIORITY[b.geo_scope ?? 'global']
    if (ga !== gb) return ga - gb
    const wa = a.axis ? axisWeights[a.axis] : 0
    const wb = b.axis ? axisWeights[b.axis] : 0
    if (wa !== wb) return wb - wa
    // Final deterministic tiebreak: alphabetical by show name.
    return a.show_name.localeCompare(b.show_name)
  })

  let globalSlotsUsed = 0
  const globalCap = GLOBAL_SLOT_CAP_BY_MATURITY[input.maturity]
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
      // national + regional make up Core, per spec ("Core -- the axes that
      // fit the agency's stage and target, usually effectiveness + craft +
      // specialist for a beginner/intermediate").
      tier = 'core'
    }
    return { ...li, tier }
  })

  // AGENCY TITLES + PEOPLE lanes: no axis/geo ladder (kind-only lanes), still
  // deadline-aware, still respect pins/excludes from the same filter pass.
  const agencyTitles = filtered.filter(f => f.kind === 'agency_title').map(toLineItem)
  const people = filtered.filter(f => f.kind === 'people').map(toLineItem)

  // Brand-mode lane default: "a lane-visibility default, not a capability
  // limit" (Ben, 16 Jul) — in-house teams default to the work lane with
  // agency-titles hidden, but the titles lane above is still fully computed;
  // only this flag changes, never the computed content.
  const isBrand = input.orgType === 'brand'
  const laneDefaults = {
    agency_titles_visible: !isBrand,
    people_visible: true,
  }

  // Coverage gap: no live national-floor candidate for the requested region
  // in the work lane. Flagged, never silently dropped (USER MODEL & FLOW v2
  // §Step 4) — but this engine does not invent a specific missing show name;
  // that requires an "ideal set per market" reference this session does not
  // build (e.g. MMA Vietnam-class gaps), so it is surfaced as a general flag
  // for the caller to route into show_requests (P3's job), not synthesized here.
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

  return {
    input,
    as_of_date: asOfDate,
    axis_weights: axisWeights,
    work,
    agency_titles: agencyTitles,
    people,
    lane_defaults: laneDefaults,
    coverage_gaps: coverageGaps,
    excluded_not_directly_enterable: excludedNotEnterable,
  }
}
