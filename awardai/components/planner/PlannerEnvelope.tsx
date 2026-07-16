'use client'
/**
 * PlannerEnvelope.tsx — Step 2 of the five-step flow ("Envelope").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 2: budget + a
 * production-capacity reality check (entries they can actually write well).
 * Currency choice drives the whole display (chosen currency + native + FX
 * date, lib/fx.ts). The budget sizes the portfolio and is shown against
 * sourced fees — NEVER divided by a win rate to produce a per-metal cost
 * (the June cost-per-point failure class).
 *
 * Capacity is a UI-only reality check (it is NOT in planner_prefs' persisted
 * shape by design — the spec's prefs shape carries budget/currency, not a
 * capacity figure). Controlled/presentational; `compact` renders inline on the
 * result screen.
 * =============================================================================
 */

import { convert, type CurrencyCode } from '@/lib/fx'
import { DISPLAY_CURRENCIES, formatMoney } from '@/lib/planner-display'

/**
 * A transparent, documented typical sourced single-entry fee, in USD, used only
 * for the affordable-entries reality check. This is a ROUGH planning anchor
 * (the cleared sourced fees run ~$625-$778 for the craft/fame shows), never a
 * per-show number and never surfaced as precision. One place to tune.
 */
const TYPICAL_ENTRY_FEE_USD = 700

type Props = {
  budget: number
  budgetCurrency: CurrencyCode
  /** UI-only reality check: entries the team can actually write well. */
  capacity: number | null
  onChange: (patch: { budget?: number; budgetCurrency?: CurrencyCode }) => void
  onCapacityChange: (capacity: number | null) => void
  compact?: boolean
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600'
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1'

export default function PlannerEnvelope({
  budget,
  budgetCurrency,
  capacity,
  onChange,
  onCapacityChange,
  compact,
}: Props) {
  // Budget converted to USD to estimate affordable entries at the typical fee.
  const budgetUsd = convert(budget || 0, budgetCurrency, 'USD').value
  const affordableEntries = TYPICAL_ENTRY_FEE_USD > 0 ? Math.floor(budgetUsd / TYPICAL_ENTRY_FEE_USD) : 0
  const overCapacity = capacity !== null && capacity > 0 && affordableEntries > capacity

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="planner-budget">Budget envelope</label>
          <input
            id="planner-budget"
            type="number"
            min={0}
            step={500}
            className={inputClass}
            value={Number.isFinite(budget) ? budget : 0}
            onChange={e => onChange({ budget: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="planner-currency">Currency</label>
          <select
            id="planner-currency"
            className={inputClass}
            value={budgetCurrency}
            onChange={e => onChange({ budgetCurrency: e.target.value as CurrencyCode })}
          >
            {DISPLAY_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="planner-capacity">
          Entries you can write well (optional)
        </label>
        <input
          id="planner-capacity"
          type="number"
          min={0}
          step={1}
          className={inputClass}
          value={capacity ?? ''}
          placeholder="e.g. 6"
          onChange={e => {
            const v = e.target.value
            onCapacityChange(v === '' ? null : Math.max(0, Number(v) || 0))
          }}
        />
      </div>

      <p className="text-xs text-gray-500">
        At a typical sourced entry fee (~{formatMoney(TYPICAL_ENTRY_FEE_USD, 'USD')}), this budget covers roughly{' '}
        <span className="font-semibold">{affordableEntries}</span> entries.
        {overCapacity && (
          <span className="text-amber-700">
            {' '}That is more than you said you can write well ({capacity}). A tighter, better-written slate usually beats a wide one.
          </span>
        )}
      </p>
    </div>
  )
}
