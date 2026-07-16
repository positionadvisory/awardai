/**
 * planner-facets.ts — typed reader for Portfolio Planner v2's editorial facet
 * mapping, stored on `show_profiles.planner_facets` and `dynamic_shows.planner_facets`
 * (both jsonb, added in migrations/planner-facets-migration-2026-07-16.sql).
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA + USER
 * MODEL & FLOW v2 sections. Build session P1 (data + engine layer).
 *
 * planner_facets is EDITORIAL reference data (which axis/discipline/geo_scope a
 * show sits in), grounded in each show's own judging_philosophy text. It is
 * NEVER a per-agency value and NEVER carries a rate/odds/win-likelihood field —
 * odds render only through lib/rate-facts.ts + <GatedNumber/>, already live.
 * This module reads facets only; it does not touch show_rate_facts at all.
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

/** Raw shape stored in the jsonb column. Every field but `kind` is optional. */
export type PlannerFacetData = {
  kind: PlannerFacetKind
  axis?: PlannerAxis
  discipline?: PlannerShowDiscipline
  geo_scope?: PlannerGeoScope
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
 * a non-work kind, or a full-service agency) always admit — this is the
 * "discipline FILTER (facet match + discipline-agnostic shows)" rule from the
 * spec's engine step. See lib/planner-engine.ts for the agency-side discipline
 * enum and the mapping between the two.
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
