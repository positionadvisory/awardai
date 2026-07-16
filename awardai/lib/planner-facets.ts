/**
 * planner-facets.ts — typed reader for Portfolio Planner v2's editorial facet
 * mapping, stored on `show_profiles.planner_facets` and `dynamic_shows.planner_facets`
 * (both jsonb, added in migrations/planner-facets-migration-2026-07-16.sql;
 * the `region` field added in migrations/planner-facets-region-2026-07-16.sql).
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA + USER
 * MODEL & FLOW v2 sections. Build session P1 (data + engine layer); the region
 * field + gate added in P2.1 (revision #6 — the geographically-wrong-shows bug).
 *
 * planner_facets is EDITORIAL reference data (which axis/discipline/geo_scope/
 * region a show sits in), grounded in each show's own judging_philosophy text.
 * It is NEVER a per-agency value and NEVER carries a rate/odds/win-likelihood
 * field — odds render only through lib/rate-facts.ts + <GatedNumber/>, already
 * live. This module reads facets only; it does not touch show_rate_facts at all.
 *
 * Show names are free text everywhere in this codebase (Gotchas): matching
 * uses the existing `sameShow`/`normaliseKbShow` machinery, never `===`.
 * =============================================================================
 */

import { supabase } from '@/lib/supabase'
import { sameShow } from '@/lib/show-taxonomy'
import { normaliseKbShow } from '@/lib/shows-data'

export type PlannerFacetKind = 'work' | 'agency_title' | 'people'

/** Work-lane only. Never present on agency_title/people rows. */
export type PlannerAxis = 'effectiveness' | 'craft' | 'creative_fame' | 'specialist'

/**
 * Show-side discipline (what kind of agency work this show judges) — distinct
 * from the AGENCY-side discipline captured in planner_prefs (media / creative /
 * PR / mobile_performance / full_service, see lib/planner-engine.ts). The two
 * are related but not the same enum: a show's discipline is fixed editorial
 * fact; an agency's discipline is a self-declared/derived input.
 */
export type PlannerShowDiscipline =
  | 'creative'
  | 'media'
  | 'mobile'
  | 'PR'
  | 'entertainment'
  | 'sports'
  | 'creator'
  | 'digital'

export type PlannerGeoScope = 'national' | 'regional' | 'global'

/**
 * Structured region, mirroring lib/shows-data.ts's ShowDeadline.region enum so
 * the two vocabularies are one. This is the AUTHORITATIVE editorial region for
 * planner eligibility, corrected where DEADLINES_2026.region is wrong for this
 * purpose (e.g. PRCA UK is tagged 'Global' in DEADLINES but is a UK-national
 * show — seeded here as 'Europe'). Global-scope shows carry 'Global'.
 */
export type PlannerRegion = 'Global' | 'APAC' | 'MENA' | 'China' | 'Europe' | 'Australia' | 'North America'

/** Raw shape stored in the jsonb column. Every field but `kind` is optional. */
export type PlannerFacetData = {
  kind: PlannerFacetKind
  axis?: PlannerAxis
  discipline?: PlannerShowDiscipline
  geo_scope?: PlannerGeoScope
  /**
   * The show's home region (see PlannerRegion). Present on national/regional
   * shows; global shows carry 'Global'. Used by regionAdmits() to gate the
   * work/titles/people lanes by the user's market (P2.1 #6).
   */
  region?: PlannerRegion
  /**
   * Reserved, optional finer market for national shows (e.g. 'UK', 'US'). NOT
   * seeded or read in v1 — v1 gates at the coarse PlannerRegion level. This is
   * the extension seam for a later sub-market pass; leave it here so adding it
   * is a seed-only change, not a schema change.
   */
  market?: string
  /** Present only on shows that cannot be entered directly (e.g. Global SABRE). */
  excluded?: string
  discipline_note?: string
}

/** One resolved facet row, show name attached, from either source table. */
export type PlannerFacet = PlannerFacetData & {
  show_name: string
  /** Which table this facet was read from — useful for debugging drift. */
  source: 'show_profiles' | 'dynamic_shows'
}

/**
 * Fetch every seeded facet from both tables. Unmapped shows (planner_facets
 * IS NULL — the deliberately-unmapped pipeline-only shows, e.g. African
 * Cristal Festival / AWARD Awards / WARC Awards) are simply absent from the
 * result; callers must treat "no facet" as "not yet planner-eligible", never
 * default it to a guessed axis.
 *
 * Read-only, fail-soft: an unavailable facets store degrades to an empty
 * array (the planner engine must then treat every show as unmapped), never
 * throws into a render/derivation path.
 */
export async function fetchPlannerFacets(): Promise<PlannerFacet[]> {
  const [spRes, dsRes] = await Promise.all([
    supabase.from('show_profiles').select('show_name, planner_facets').not('planner_facets', 'is', null),
    supabase.from('dynamic_shows').select('show_name, planner_facets').not('planner_facets', 'is', null),
  ])

  const out: PlannerFacet[] = []
  const seen = new Set<string>()

  // show_profiles first: it is the primary source for shows with DEADLINES_2026
  // coverage (fees + deadlines resolve against that same show name).
  if (!spRes.error && spRes.data) {
    for (const row of spRes.data as { show_name: string; planner_facets: PlannerFacetData }[]) {
      const key = (normaliseKbShow(row.show_name) ?? row.show_name).trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...row.planner_facets, show_name: row.show_name, source: 'show_profiles' })
    }
  }

  // dynamic_shows: adds shows not already captured (or seeds ones tracked only
  // here — Epica/Webby/The Drum/One Show Indies/the 4 AOY dynamic rows/The
  // Indie Awards per the spec's explicit dynamic-show-facets list). A show
  // present in BOTH tables was seeded byte-consistent in the P1 migration, so
  // first-write-wins here is harmless.
  if (!dsRes.error && dsRes.data) {
    for (const row of dsRes.data as { show_name: string; planner_facets: PlannerFacetData }[]) {
      const key = (normaliseKbShow(row.show_name) ?? row.show_name).trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...row.planner_facets, show_name: row.show_name, source: 'dynamic_shows' })
    }
  }

  return out
}

/** The single facet for a show, or null if unmapped. Free-text safe. */
export function getPlannerFacet(
  facets: PlannerFacet[],
  show: string | null | undefined,
): PlannerFacet | null {
  if (!show) return null
  const match = facets.find(f => sameShow(f.show_name, show))
  return match ?? null
}

/**
 * True iff this facet marks the show as not directly enterable (e.g. Global
 * SABRE — winners are selected by PRovoke editorial leadership from regional
 * performance; budget cannot buy it directly). The engine must hard-exclude
 * on this before any weighting/ladder logic runs.
 */
export function isExcludedFacet(facet: PlannerFacetData | null | undefined): boolean {
  return !!facet?.excluded
}

/**
 * Does this show's own discipline (if any) admit the agency's declared/derived
 * discipline? Discipline-agnostic cases (no discipline on the facet at all, or
 * a non-work kind, or a full-service agency) always admit.
 *
 * NOTE (P2.1 #5): discipline is no longer a hard UNIVERSE filter in the work
 * lane — it became a TILT (an ordering nudge, so on-discipline shows lead)
 * because region + discipline hard-gated together collapsed a media agency's
 * lane to a single show. This predicate is still the source of truth for
 * "is this show on the agency's discipline" — the engine now uses it as a sort
 * key and the target picker (lib/planner-display.ts) still uses it to focus the
 * title list — but it no longer removes a show from the plan by itself.
 */
export function facetAdmitsDiscipline(
  facet: PlannerFacetData,
  agencyShowDiscipline: PlannerShowDiscipline | null,
): boolean {
  if (facet.kind !== 'work') return true // agency_title / people are discipline-agnostic
  if (!facet.discipline) return true // discipline-agnostic work show
  if (agencyShowDiscipline === null) return true // full-service: sees everything
  return facet.discipline === agencyShowDiscipline
}

// ── Region gate (P2.1 #6) ────────────────────────────────────────────────────

/**
 * Which show regions a user in a given home market may enter. Global-scope
 * shows are ALWAYS eligible (handled in regionAdmits by geo_scope, not here),
 * so this map only governs national/regional shows. The containment reflects
 * real geographic eligibility: a China agency competes in China-national shows
 * AND the wider APAC regional shows; an Australia agency likewise. Coarse
 * markets (a German agency reads as 'Europe' and so may see UK-national shows)
 * are an accepted v1 limitation — the finer `market` field is the later fix.
 * 'Global' as a user home market means "no market constraint" (match all).
 */
export const REGION_ELIGIBILITY: Record<PlannerRegion, PlannerRegion[]> = {
  Global: ['Global', 'APAC', 'MENA', 'China', 'Europe', 'Australia', 'North America'],
  APAC: ['Global', 'APAC'],
  China: ['Global', 'China', 'APAC'],
  Australia: ['Global', 'Australia', 'APAC'],
  Europe: ['Global', 'Europe'],
  MENA: ['Global', 'MENA'],
  'North America': ['Global', 'North America'],
}

const REGION_ENUM: PlannerRegion[] = ['Global', 'APAC', 'MENA', 'China', 'Europe', 'Australia', 'North America']

/**
 * City/country keyword → PlannerRegion. Keyed to the major agency hubs. This is
 * used BOTH to normalise a free-text saved/derived region (the old field was a
 * city like "Shanghai") AND to seed the default selection in the region picker.
 * Unrecognised input falls back to 'Global' (match-all) — we would rather
 * over-include than wrongly hide, and the region picker lets the user correct
 * it. Order matters: more specific buckets (China, Australia) are checked
 * before the broad APAC bucket.
 */
const REGION_KEYWORDS: { region: PlannerRegion; needles: string[] }[] = [
  { region: 'China', needles: ['china', 'prc', 'shanghai', 'beijing', 'guangzhou', 'shenzhen', 'chengdu', 'hangzhou', 'hong kong', 'hongkong', 'taiwan', 'taipei'] },
  { region: 'Australia', needles: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'new zealand', 'auckland', 'wellington'] },
  { region: 'North America', needles: ['north america', 'united states', 'u.s.', 'usa', ' us ', 'america', 'new york', 'nyc', 'chicago', 'los angeles', 'san francisco', 'boston', 'seattle', 'atlanta', 'canada', 'toronto', 'vancouver'] },
  { region: 'Europe', needles: ['europe', 'united kingdom', 'u.k.', ' uk ', 'britain', 'england', 'london', 'manchester', 'scotland', 'ireland', 'dublin', 'france', 'paris', 'germany', 'berlin', 'munich', 'hamburg', 'spain', 'madrid', 'barcelona', 'italy', 'milan', 'rome', 'netherlands', 'amsterdam', 'sweden', 'stockholm', 'denmark', 'copenhagen', 'norway', 'oslo', 'finland', 'helsinki', 'poland', 'warsaw', 'portugal', 'lisbon', 'switzerland', 'zurich', 'geneva', 'belgium', 'brussels', 'austria', 'vienna'] },
  { region: 'MENA', needles: ['mena', 'middle east', 'dubai', 'uae', 'u.a.e', 'abu dhabi', 'saudi', 'riyadh', 'jeddah', 'qatar', 'doha', 'kuwait', 'bahrain', 'oman', 'egypt', 'cairo', 'turkiye', 'türkiye', 'turkey', 'istanbul', 'africa', 'johannesburg', 'cape town', 'nairobi', 'lagos'] },
  { region: 'APAC', needles: ['apac', 'asia pacific', 'asia-pacific', 'asean', 'asia', 'singapore', 'bangkok', 'thailand', 'tokyo', 'japan', 'osaka', 'seoul', 'korea', 'india', 'mumbai', 'delhi', 'bengaluru', 'bangalore', 'jakarta', 'indonesia', 'manila', 'philippines', 'vietnam', 'hanoi', 'ho chi minh', 'saigon', 'kuala lumpur', 'malaysia', 'pacific'] },
]

/**
 * Normalise a free-text home market / region to a PlannerRegion. Accepts an
 * enum value verbatim (the region picker stores these), a city, or a country.
 * Deterministic and pure. Falls back to 'Global' (match-all) on no match.
 */
export function normalizeUserRegion(raw: string | null | undefined): PlannerRegion {
  const s = (raw ?? '').trim()
  if (!s) return 'Global'
  // Exact enum match first (the picker stores these).
  const exact = REGION_ENUM.find(r => r.toLowerCase() === s.toLowerCase())
  if (exact) return exact
  // Pad so word-boundary needles like ' us ' / ' uk ' match at edges too.
  const hay = ` ${s.toLowerCase()} `
  for (const { region, needles } of REGION_KEYWORDS) {
    if (needles.some(n => hay.includes(n))) return region
  }
  return 'Global'
}

/**
 * Region gate (P2.1 #6): may a user in `userRegion` enter this show? Global
 * shows are always eligible. National/regional shows must have their region in
 * the user's eligibility set. A national/regional show with NO seeded region
 * fails OPEN (stays visible) rather than being hidden — an unseeded region is a
 * data gap, and hiding a show on missing data is worse than showing it; such
 * shows should be caught and seeded, not silently dropped.
 */
export function regionAdmits(userRegion: PlannerRegion, facet: PlannerFacetData): boolean {
  const geo = facet.geo_scope ?? 'global'
  if (geo === 'global') return true
  if (!facet.region) return true // fail-open on an unseeded region (data gap)
  const eligible = REGION_ELIGIBILITY[userRegion] ?? REGION_ELIGIBILITY.Global
  return eligible.includes(facet.region)
}
