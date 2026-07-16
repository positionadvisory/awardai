'use client'
/**
 * PlannerEnvelope.tsx — Step 2 of the five-step flow ("Your realistic scope").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 2, revised in P2.1:
 *   #2 the budget field shows thousands separators (text input + inputMode,
 *      strip non-digits, store the parsed number).
 *   #3 budget is ENTRY FEES ONLY — production is explicitly excluded (video
 *      production varies too wildly to model; not built).
 *   #4 the reality-check input is now "how many award-worthy campaigns do you
 *      have ready" — the real planning unit. entries-per-campaign is DERIVED
 *      (affordable entries / campaigns), never an assumed fan-out ratio.
 *
 * Budget sizes DEPTH (entries you can fund); campaigns sizes BREADTH (distinct
 * work to place). Both feed the engine (lib/planner-engine.ts deriveCapacity /
 * derivePlan) — campaigns is no longer UI-only, it is part of PlannerInput and
 * persisted. This component computes a preview of the same math for the field
 * caption; the engine is the source of truth for the plan.
 *
 * Controlled/presentational; `compact` renders inline on the result screen.
 * =============================================================================
 */

import { convert, type CurrencyCode } from '@/lib/fx'
import { TYPICAL_ENTRY_FEE_USD } from '@/lib/planner-engine'
import { DISPLAY_CURRENCIES, formatMoney } from '@/lib/planner-display'

type Props = {
  budget: number
  budgetCurrency: CurrencyCode
  /** The real planning unit (P2.1 #4): award-worthy campaigns ready. null = not supplied. */
  campaignsReady: number | null
  onChange: (patch: { budget?: number; budgetCurrency?: CurrencyCode; campaignsReady?: number | null }) => void
  compact?: boolean
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600'
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1'

export default function PlannerEnvelope({ budget, budgetCurrency, campaignsReady, onChange, compact }: Props) {
  // Budget -> USD -> affordable ENTRIES at the typical fee (mirrors the engine's
  // deriveCapacity; the engine remains the source of truth for the plan itself).
  let budgetUsd = 0
  try {
    budgetUsd = convert(Math.max(0, budget || 0), budgetCurrency, 'USD').value
  } catch {
    budgetUsd = 0
  }
  const affordableEntries = TYPICAL_ENTRY_FEE_USD > 0 ? Math.floor(budgetUsd / TYPICAL_ENTRY_FEE_USD) : 0
  const campaigns = campaignsReady && campaignsReady > 0 ? campaignsReady : null
  const perCampaign = campaigns ? affordableEntries / campaigns : null
  const underBudgeted = perCampaign !== null && perCampaign < 1

  // #2 — render the budget with thousands separators inside a text input
  // (a number input cannot show commas). Digits only on the way back in.
  const budgetDisplay = budget > 0 ? budget.toLocaleString('en-US') : ''

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="planner-budget">Budget (entry fees)</label>
          <input
            id="planner-budget"
            type="text"
            inputMode="numeric"
            className={inputClass}
            value={budgetDisplay}
            placeholder="e.g. 50,000"
            onChange={e => {
              const digits = e.target.value.replace(/[^0-9]/g, '')
              onChange({ budget: digits === '' ? 0 : Number(digits) })
            }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Entry fees only. Production (film, design, editing) is not included: it varies too much between campaigns to estimate here.
          </p>
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
        <label className={labelClass} htmlFor="planner-campaigns">
          How many award-worthy campaigns do you have ready? (optional)
        </label>
        <input
          id="planner-campaigns"
          type="number"
          min={0}
          step={1}
          className={inputClass}
          value={campaignsReady ?? ''}
          placeholder="e.g. 4"
          onChange={e => {
            const v = e.target.value
            onChange({ campaignsReady: v === '' ? null : Math.max(0, Number(v) || 0) })
          }}
        />
        <p className="text-xs text-gray-400 mt-1">
          Think in campaigns, not entries: one campaign can become several entries across shows. This is a starting number,
          not a ceiling. Shortlist&apos;s Direction Generator often surfaces more entries than you expect.
        </p>
      </div>

      <p className="text-xs text-gray-500">
        At a typical sourced entry fee (~{formatMoney(TYPICAL_ENTRY_FEE_USD, 'USD')}), this budget funds about{' '}
        <span className="font-semibold">{affordableEntries}</span> entries.
        {campaigns && perCampaign !== null && !underBudgeted && (
          <>
            {' '}Across {campaigns} campaign{campaigns === 1 ? '' : 's'}, that is roughly{' '}
            <span className="font-semibold">{perCampaign.toFixed(perCampaign < 10 ? 1 : 0)}</span> entries per campaign.
          </>
        )}
        {underBudgeted && (
          <span className="text-amber-700">
            {' '}That is fewer than one entry per campaign ({campaigns} campaigns). Raise the budget, or focus on fewer
            campaigns entered well.
          </span>
        )}
      </p>
    </div>
  )
}
