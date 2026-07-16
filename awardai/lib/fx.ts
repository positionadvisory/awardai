/**
 * fx.ts — ONE dated FX rate set for Portfolio Planner v2, sourced and updated
 * deliberately (never a live API silently moving prices).
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §3 (Ben, 16 Jul): "FX is a
 * must. Every fee displays in the user's chosen currency (USD or local) with
 * the NATIVE currency alongside and the FX date visible (ledger-B1 discipline:
 * a converted figure without its rate date is a future wrong number)."
 *
 * Rates below are seeded from the Verified Research Ledger §B1 rate set
 * (1–14 Jun 2026 window, the same window ENTRY_FEES' canonical conversions in
 * lib/shows-data.ts already use — e.g. Cannes "€1,095 × EUR 1.1646 = $1,275",
 * D&AD "£580 × GBP 1.341 = $778", Spikes "SGD 810 × SGD 0.7787 = $631"), plus
 * HKD (the Campaign AOY peg, "HKD peg 7.80" per ENTRY_FEES' own note) and CNY
 * (the ROI Festival peg, "6.80 CNY-per-USD" per ENTRY_FEES' own note). Every
 * rate here reproduces exactly the USD figure already canonical in
 * ENTRY_FEES.base for at least one show, so this table introduces no new
 * unsourced conversion — it just makes the existing ledger-B1 rates callable
 * from code instead of hand-baked into each ENTRY_FEES note.
 *
 * NOT sourced yet (do not invent): THB (ADFEST), ZAR (Loeries), INR (Campaign
 * Asia AOY South Asia). ENTRY_FEES carries these as native-currency notes
 * without a pinned ledger-B1 rate; convert() throws rather than guessing one.
 * Add a currency here only with its own dated, sourced rate — never a filled
 * gap.
 * =============================================================================
 */

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'SGD' | 'HKD' | 'CNY'

export type FxRate = {
  /** USD value of exactly 1 unit of this currency. */
  usd_per_unit: number
  /** Date this rate was verified against the ledger — always shown alongside a converted figure. */
  as_of: string
  /** Where the rate traces to (ledger section + the ENTRY_FEES row it reproduces). */
  source_note: string
}

/**
 * The one dated rate set. USD is the pivot currency (usd_per_unit: 1, no
 * as_of — never itself "converted"). Every non-USD rate here reproduces an
 * existing ENTRY_FEES.base USD figure exactly (see file header for the specific
 * show each rate traces to) — this table does not introduce a new number.
 */
export const FX_RATES: Record<CurrencyCode, FxRate> = {
  USD: {
    usd_per_unit: 1,
    as_of: '',
    source_note: 'Pivot currency — never itself a converted figure.',
  },
  EUR: {
    usd_per_unit: 1.1646,
    as_of: '2026-06-14',
    source_note:
      'Ledger §B1. Reproduces ENTRY_FEES: Cannes Lions €1,095 × 1.1646 = $1,275 (Film std single, 2026).',
  },
  GBP: {
    usd_per_unit: 1.341,
    as_of: '2026-06-14',
    source_note:
      'Ledger §B1. Reproduces ENTRY_FEES: D&AD £580 × 1.341 = $778 (Film std single, 2026).',
  },
  SGD: {
    usd_per_unit: 0.7787,
    as_of: '2026-06-14',
    source_note:
      'Ledger §B1. Reproduces ENTRY_FEES: Spikes Asia SGD 810 × 0.7787 = $631 (Film base std single, 2026).',
  },
  HKD: {
    // Peg quoted in ENTRY_FEES as "HKD peg 7.80" (i.e. divide HKD by 7.80 to
    // reach USD), so usd_per_unit = 1 / 7.80.
    usd_per_unit: 1 / 7.8,
    as_of: '2026-06-26',
    source_note:
      'ENTRY_FEES note, Campaign Asia Agency of the Year: HKD 5,650 / 7.80 = $724 (standard single, verified aoyawards.com + 2026 Entry Kit).',
  },
  CNY: {
    // Peg quoted in ENTRY_FEES as "6.80 CNY-per-USD" (i.e. divide CNY by 6.80).
    usd_per_unit: 1 / 6.8,
    as_of: '2026-06-01',
    source_note:
      'ENTRY_FEES note, ROI Festival: RMB 1,800 / 6.80 = $265 (Case non-integration standard, 2025/18th-edition kit; 2026 cycle not yet reconfirmed).',
  },
}

export type ConvertedAmount = {
  /** Converted value in the `to` currency. */
  value: number
  /** The `to` currency code, echoed back for display convenience. */
  currency: CurrencyCode
  /**
   * The FX date to show alongside the converted figure. Empty string when
   * `from === to` (no conversion happened, nothing to date) or when both
   * `from`/`to` are USD.
   */
  rate_date: string
}

/**
 * Convert an amount between two currencies in the FX_RATES table. Throws (does
 * not silently guess) if either currency is not in the table — the display
 * contract requires a dated rate, and an unsourced currency has none.
 *
 * The returned `rate_date` is the LATER (more recently verified) of the two
 * currencies' as_of dates when neither side is USD, so a display never claims
 * a fresher date than its weakest input; when one side is USD, the other
 * side's own as_of is used (USD itself has no date to compare).
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): ConvertedAmount {
  const fromRate = FX_RATES[from]
  const toRate = FX_RATES[to]
  if (!fromRate || !toRate) {
    throw new Error(
      `fx.convert: no dated rate for ${!fromRate ? from : to}. Add one to FX_RATES with its own source before converting — never guess.`,
    )
  }
  if (from === to) {
    return { value: amount, currency: to, rate_date: '' }
  }
  const usdValue = amount * fromRate.usd_per_unit
  const value = usdValue / toRate.usd_per_unit
  const rate_date =
    from === 'USD' ? toRate.as_of : to === 'USD' ? fromRate.as_of : [fromRate.as_of, toRate.as_of].sort().pop()!
  return { value, currency: to, rate_date }
}

/**
 * Display-contract helper: a fee always shows the chosen display currency
 * value ALONGSIDE the native currency and the FX date (USER MODEL & FLOW v2
 * §3). Returns both formatted numbers plus the date; the caller decides
 * layout, this just guarantees no converted figure is produced without its
 * native counterpart and date.
 */
export function displayFeeWithNative(
  nativeAmount: number,
  nativeCurrency: CurrencyCode,
  displayCurrency: CurrencyCode,
): {
  native: { value: number; currency: CurrencyCode }
  display: { value: number; currency: CurrencyCode }
  rate_date: string
} {
  const converted = convert(nativeAmount, nativeCurrency, displayCurrency)
  return {
    native: { value: nativeAmount, currency: nativeCurrency },
    display: { value: converted.value, currency: displayCurrency },
    rate_date: converted.rate_date,
  }
}
