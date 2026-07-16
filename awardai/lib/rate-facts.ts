/**
 * rate-facts.ts — the single shared publishability layer for show win/shortlist/
 * gold/grand-prix rates.
 * =============================================================================
 * Win-rate reconciliation, Phase 2 (WinRate-Reconciliation-PLAN-2026-07.md §3 §5).
 *
 * Reads the Phase-1 canonical store via the client-facing view
 * `show_rate_facts_read` (service-role table `show_rate_facts` is REVOKEd from
 * anon/authenticated; the view exposes only the non-REFUTED, non-superseded rows
 * and is GRANTed SELECT — read-only, no client write anywhere in this module).
 *
 * This is the ONE place the "which grade may render a number" rule lives. The
 * old scattered constants (WIN_RATES rate fields, BASE_WIN_RATES, the ROI index)
 * are retired; anything that wants to show a rate goes through `getRateFact` +
 * `mayDisplayNumber`, and renders via <GatedNumber/>. Nothing else invents a rate.
 *
 * Publish gate (plan §3 "publishability is derivable, not stored"):
 *   FESTIVAL_STATED / SOURCED  → a number may render (with its label)
 *   THIRD_PARTY                → a number may render ONLY with attribution
 *   ESTIMATE / NONE_PUBLISHED  → never a number (qualitative fallback + tooltip)
 *   REFUTED                    → never surfaced at all (already excluded by the view)
 *
 * Show-name matching uses the existing free-text-safe machinery (`sameShow`,
 * `normaliseKbShow`), never `===` — show names are free text everywhere in this
 * codebase (Gotchas). Canonical-name drift between the facts store and the app's
 * show names (e.g. facts `Clio` vs app `Clio Awards`, facts `LIA` vs app
 * `London International Awards`) is a Phase-3 reconciliation item; both of those
 * are NONE_PUBLISHED, so an unmatched row and a matched one resolve to the same
 * qualitative fallback either way — harmless until Phase 3 lands.
 * =============================================================================
 */

import { supabase } from '@/lib/supabase'
import { sameShow } from '@/lib/show-taxonomy'
import { normaliseKbShow } from '@/lib/shows-data'

export type RateMetric = 'shortlist_rate' | 'win_rate' | 'gold_rate' | 'grandprix_rate'

export type RateGrade =
  | 'FESTIVAL_STATED'
  | 'SOURCED'
  | 'THIRD_PARTY'
  | 'ESTIMATE'
  | 'NONE_PUBLISHED'
  | 'REFUTED'

/** One row of `show_rate_facts_read` (the client-facing view). */
export type RateFact = {
  id: number
  show_name: string
  metric: RateMetric
  value: number | null
  grade: RateGrade
  denominator: string | null
  category_scope: string
  cycle_year: number | null
  source_url: string | null
  source_quote: string | null
  attributed_to: string | null
  note: string | null
  last_verified_at: string
}

/**
 * Fetch every live rate fact (the view already excludes REFUTED + superseded rows).
 * The client is untyped (lib/supabase.ts has no Database generic — Gotchas S141),
 * so the result is cast explicitly rather than left implicit-any.
 */
export async function fetchRateFacts(): Promise<RateFact[]> {
  const { data, error } = await supabase.from('show_rate_facts_read').select('*')
  if (error) {
    // Read-only, fail-soft: an unavailable facts store must degrade to the
    // qualitative fallback everywhere, never throw into a render path.
    return []
  }
  return (data ?? []) as RateFact[]
}

/** Does this fact's show name refer to the requested show? Free-text safe. */
function factMatchesShow(factName: string, requested: string): boolean {
  if (sameShow(factName, requested)) return true
  // Fuzzy fallback for canonical-name drift, mirroring resolveWinRateKey's
  // includes-logic. Both sides normalised through the alias machinery first.
  const nf = (normaliseKbShow(factName) ?? factName).trim().toLowerCase()
  const nr = (normaliseKbShow(requested) ?? requested).trim().toLowerCase()
  if (!nf || !nr) return false
  return nf.includes(nr) || nr.includes(nf)
}

// Lower = more authoritative. Drives which single row wins when several match.
const GRADE_PRIORITY: Record<RateGrade, number> = {
  FESTIVAL_STATED: 0,
  SOURCED: 1,
  THIRD_PARTY: 2,
  NONE_PUBLISHED: 3,
  ESTIMATE: 4,
  REFUTED: 5,
}

/**
 * The single best fact for a show + metric, or null if none is known.
 *
 * Selection is deterministic: most authoritative grade first; within a grade,
 * a standing figure (cycle_year null) beats a dated one, otherwise the most
 * recent cycle_year wins. A NONE_PUBLISHED row is a real answer ("researched,
 * nothing published") and is returned so the caller can show the honest
 * fallback — distinct from a missing row ("not yet researched"), which is null.
 */
export function getRateFact(
  facts: RateFact[],
  show: string | null | undefined,
  metric: RateMetric,
): RateFact | null {
  if (!show) return null
  const matches = facts.filter(
    (f: RateFact) => f.metric === metric && factMatchesShow(f.show_name, show),
  )
  if (matches.length === 0) return null
  const sorted = matches.slice().sort((a: RateFact, b: RateFact) => {
    const pg = GRADE_PRIORITY[a.grade] - GRADE_PRIORITY[b.grade]
    if (pg !== 0) return pg
    // Standing (null cycle_year) ranks above any dated row; else newest year.
    const ay = a.cycle_year ?? Number.POSITIVE_INFINITY
    const by = b.cycle_year ?? Number.POSITIVE_INFINITY
    return by - ay
  })
  return sorted[0]
}

/**
 * The publish gate. True iff this fact may render as a NUMBER in customer UI.
 * A THIRD_PARTY figure may render only when it carries its attribution.
 * ESTIMATE / NONE_PUBLISHED / REFUTED / a missing fact never render a number.
 */
export function mayDisplayNumber(fact: RateFact | null | undefined): boolean {
  if (!fact || fact.value === null) return false
  if (fact.grade === 'FESTIVAL_STATED' || fact.grade === 'SOURCED') return true
  if (fact.grade === 'THIRD_PARTY') return !!fact.attributed_to
  return false
}

/**
 * Short provenance label for a displayable fact, e.g. "festival-stated",
 * "festival-stated, 2020", "per B&T (2022)". Empty string when no number renders.
 */
export function rateFactLabel(fact: RateFact | null | undefined): string {
  if (!mayDisplayNumber(fact) || !fact) return ''
  const year = fact.cycle_year ? `, ${fact.cycle_year}` : ''
  if (fact.grade === 'FESTIVAL_STATED') return `festival-stated${year}`
  if (fact.grade === 'SOURCED') return `sourced${year}`
  if (fact.grade === 'THIRD_PARTY') return `per ${fact.attributed_to}${year}`
  return ''
}
