/**
 * planner-display.ts — display glue for Portfolio Planner v2's page/components.
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 (as amended) — the FEE display contract and
 * the per-axis qualitative fallback copy. Build session P2.
 *
 * This module is DISPLAY glue only. It computes no allocation (that is
 * lib/planner-engine.ts, and the page/components call NOTHING of their own),
 * and it invents no odds (odds render only through lib/rate-facts.ts +
 * <GatedNumber/>). It resolves a show's sourced entry fee from the canonical
 * ENTRY_FEES store and converts it through the one dated FX rate set in
 * lib/fx.ts, honoring the display contract: chosen currency + native + FX date.
 *
 * ENTRY_FEES.base is already the SINGLE canonical USD entry fee per show
 * (lib/shows-data.ts). So the structured native currency here is USD; the true
 * native tender (SGD 810, £580, ...) lives in the prose `range`/`note` strings
 * and is surfaced as the tier/cycle caption, never re-parsed into a number
 * (parsing prose into a structured native amount is a P3 FX-polish item, not
 * a P2 invention).
 *
 * Show names are FREE TEXT everywhere (Gotchas): fee lookup uses the existing
 * `resolveWinRateKey` fuzzy resolver, never `===`.
 * =============================================================================
 */

import { ENTRY_FEES, resolveWinRateKey } from '@/lib/shows-data'
import { convert, type CurrencyCode } from '@/lib/fx'
import type { PlannerAxis, PlannerFacet, PlannerShowDiscipline } from '@/lib/planner-facets'
import { facetAdmitsDiscipline } from '@/lib/planner-facets'
import type { PlannerAgencyDiscipline } from '@/lib/planner-engine'

/**
 * Map the AGENCY-side discipline to the SHOW-side discipline enum, then ask
 * facetAdmitsDiscipline (the canonical rule in lib/planner-facets.ts) whether a
 * facet is admitted. This mirrors the private mapping inside lib/planner-engine.ts
 * (AGENCY_TO_SHOW_DISCIPLINE) so the target-picker's discipline filter matches
 * the engine's universe filter exactly. full_service maps to null (admit all).
 * Kept here (a P2 file) rather than editing the merged P1 engine.
 */
const AGENCY_TO_SHOW_DISCIPLINE: Record<Exclude<PlannerAgencyDiscipline, 'full_service'>, PlannerShowDiscipline> = {
  media: 'media',
  creative: 'creative',
  PR: 'PR',
  mobile_performance: 'mobile',
}

export function agencyAdmitsFacet(facet: PlannerFacet, agencyDiscipline: PlannerAgencyDiscipline): boolean {
  const showDiscipline = agencyDiscipline === 'full_service' ? null : AGENCY_TO_SHOW_DISCIPLINE[agencyDiscipline]
  return facetAdmitsDiscipline(facet, showDiscipline)
}

/** The currencies a user may pick as their display currency — exactly the FX_RATES set. */
export const DISPLAY_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'SGD', 'HKD', 'CNY']

export type ShowFeeDisplay = {
  /** True iff a sourced, positive entry fee exists for this show. */
  hasFee: boolean
  /** The canonical USD entry fee (ENTRY_FEES.base), or null when none/zero. */
  usdBase: number | null
  /** The fee converted into the chosen display currency, or null when no fee. */
  display: { value: number; currency: CurrencyCode } | null
  /** The canonical native figure (USD — see file header), or null when no fee. */
  native: { value: number; currency: 'USD' } | null
  /** FX date to show alongside a converted figure. Empty when display currency is USD. */
  rateDate: string
  /** The ENTRY_FEES.range string (tier/cycle detail), shown as a caption. */
  rangeNote: string | null
  /** The full ENTRY_FEES.note (provenance), for a details/tooltip surface. */
  note: string | null
}

/**
 * Resolve a show's sourced entry fee for display in `displayCurrency`.
 * Never divides a fee by any rate (the June cost-per-point failure class);
 * never guesses a currency (convert throws on an unsourced currency, but every
 * value here starts from a USD base, so USD -> any FX_RATES currency is always
 * dated and safe).
 */
export function feeForShow(showName: string, displayCurrency: CurrencyCode): ShowFeeDisplay {
  const key = resolveWinRateKey(showName)
  const fee = key ? ENTRY_FEES[key] : undefined
  if (!fee || typeof fee.base !== 'number' || fee.base <= 0) {
    return {
      hasFee: false,
      usdBase: fee && typeof fee.base === 'number' ? fee.base : null,
      display: null,
      native: null,
      rateDate: '',
      rangeNote: fee?.range ?? null,
      note: fee?.note ?? null,
    }
  }
  const conv = convert(fee.base, 'USD', displayCurrency)
  return {
    hasFee: true,
    usdBase: fee.base,
    display: { value: conv.value, currency: displayCurrency },
    native: { value: fee.base, currency: 'USD' },
    rateDate: conv.rate_date,
    rangeNote: fee.range,
    note: fee.note,
  }
}

/**
 * Per-axis qualitative phrase — the honest fallback shown by <GatedNumber/>
 * when a show publishes no rate a number may render from. Grounded in the
 * spec's own axis descriptions (Planner-v2-SPEC-2026-07.md "The four
 * reputation axes"). These are copy, not measured precision.
 *
 * DRAFT COPY (worksheet not finalized, Ben 16 Jul): these phrases sync to the
 * D1 masterclass worksheet in the later P-worksheet pass.
 */
export const AXIS_QUALITATIVE: Record<PlannerAxis, string> = {
  effectiveness: 'Results-led. The reputation that travels to a CMO.',
  craft: 'Hardest per entry; the strongest peer-reputation signal.',
  creative_fame: 'High cost, high visibility, structurally harder for a boutique.',
  specialist: 'Where a smaller or regional agency is most competitive.',
}

/** Non-work lanes (agency titles / people) have no axis — a neutral fallback phrase. */
export const LANE_QUALITATIVE = 'No published rate for this show. We don\'t invent one.'

/** Human labels for the four axes (draft copy, worksheet sync pending). */
export const AXIS_LABEL: Record<PlannerAxis, string> = {
  effectiveness: 'Effectiveness',
  craft: 'Craft',
  creative_fame: 'Creative fame',
  specialist: 'Specialist / regional',
}

/** Format a money value in a currency, no decimals (fees are whole-unit at this precision). */
export function formatMoney(value: number, currency: CurrencyCode): string {
  const rounded = Math.round(value)
  const symbol: Record<CurrencyCode, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    SGD: 'S$',
    HKD: 'HK$',
    CNY: '¥',
  }
  return `${symbol[currency]}${rounded.toLocaleString('en-US')}`
}
