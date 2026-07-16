'use client'
/**
 * PlannerV3Confirm.tsx — Planner v3 Step 2, confirm budget / currency / region.
 * =============================================================================
 * Planner-v3-SPEC-campaign-driven-2026-07-16.md "Input model and flow" §2:
 * prefilled from agency_profiles + saved planner_prefs; ask only what is not on
 * file. Discipline stays a TILT (not a hard filter — P2.1 #5), lens re-weights
 * the readiness/rate blend. The v2 campaignsReady count field is retired (the
 * actual campaign selection supersedes it).
 *
 * Region is a SELECT over the PlannerRegion enum (the region gate is only
 * reliable on a known bucket — P2.1 #6). Budget renders with thousands
 * separators via a text input (a number input cannot show commas), digits only
 * on the way back in (P2.1 #2). Budget is entry fees only (P2.1 #3).
 *
 * Controlled/presentational: no fetch, no derivation.
 * =============================================================================
 */

import type { CurrencyCode } from '@/lib/fx'
import type { PlannerAgencyDiscipline, PlannerLens } from '@/lib/planner-engine'
import type { PlannerRegion } from '@/lib/planner-facets'
import { DISPLAY_CURRENCIES } from '@/lib/planner-display'

export type PlannerV3ConfirmValue = {
  budget: number
  budgetCurrency: CurrencyCode
  region: PlannerRegion
  discipline: PlannerAgencyDiscipline
  lens: PlannerLens
}

type Props = {
  value: PlannerV3ConfirmValue
  onChange: (patch: Partial<PlannerV3ConfirmValue>) => void
  /** True when a stored value was found for a field — shown as a small hint. */
  prefilled?: Partial<Record<keyof PlannerV3ConfirmValue, boolean>>
}

const REGION_OPTIONS: { value: PlannerRegion; label: string }[] = [
  { value: 'APAC', label: 'Asia-Pacific (APAC)' },
  { value: 'China', label: 'China' },
  { value: 'Australia', label: 'Australia / New Zealand' },
  { value: 'Europe', label: 'Europe (incl. UK)' },
  { value: 'MENA', label: 'Middle East & Africa (MENA)' },
  { value: 'North America', label: 'North America (US & Canada)' },
  { value: 'Global', label: 'Global / multi-market' },
]

const DISCIPLINE_OPTIONS: { value: PlannerAgencyDiscipline; label: string }[] = [
  { value: 'creative', label: 'Creative' },
  { value: 'media', label: 'Media' },
  { value: 'PR', label: 'PR / Communications' },
  { value: 'mobile_performance', label: 'Mobile / Performance' },
  { value: 'full_service', label: 'Full-service (all disciplines)' },
]

const LENS_OPTIONS: { value: PlannerLens; label: string }[] = [
  { value: 'maximize_visibility', label: 'Enter widely (maximum visibility)' },
  { value: 'maximize_odds', label: 'Best chance of winning' },
  { value: 'maximize_client_travel', label: 'Prestige and client travel' },
]

const controlClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600'
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1'

function PrefillHint({ show }: { show?: boolean }) {
  if (!show) return null
  return <span className="ml-1 text-[10px] font-normal text-gray-400">(from your profile)</span>
}

export default function PlannerV3Confirm({ value, onChange, prefilled }: Props) {
  const budgetDisplay = value.budget > 0 ? value.budget.toLocaleString('en-US') : ''
  const regionValue = REGION_OPTIONS.some(o => o.value === value.region) ? value.region : 'Global'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="v3-budget">
            Budget (entry fees)
            <PrefillHint show={prefilled?.budget} />
          </label>
          <input
            id="v3-budget"
            type="text"
            inputMode="numeric"
            className={controlClass}
            value={budgetDisplay}
            placeholder="e.g. 50,000"
            onChange={e => {
              const digits = e.target.value.replace(/[^0-9]/g, '')
              onChange({ budget: digits === '' ? 0 : Number(digits) })
            }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Entry fees only. Production (film, design, editing) is not included: it varies too much between campaigns to
            estimate here.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="v3-currency">
            Currency
            <PrefillHint show={prefilled?.budgetCurrency} />
          </label>
          <select
            id="v3-currency"
            className={controlClass}
            value={value.budgetCurrency}
            onChange={e => onChange({ budgetCurrency: e.target.value as CurrencyCode })}
          >
            {DISPLAY_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="v3-region">
            Home market / region
            <PrefillHint show={prefilled?.region} />
          </label>
          <select
            id="v3-region"
            className={controlClass}
            value={regionValue}
            onChange={e => onChange({ region: e.target.value as PlannerRegion })}
          >
            {REGION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Filters shows to the ones you can actually enter. Global shows always show.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="v3-discipline">
            Discipline
            <PrefillHint show={prefilled?.discipline} />
          </label>
          <select
            id="v3-discipline"
            className={controlClass}
            value={value.discipline}
            onChange={e => onChange({ discipline: e.target.value as PlannerAgencyDiscipline })}
          >
            {DISCIPLINE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Leans the plan toward your discipline&apos;s shows. It never hides a show. Full-service leans on none.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="v3-lens">What matters most</label>
        <select
          id="v3-lens"
          className={controlClass}
          value={value.lens}
          onChange={e => onChange({ lens: e.target.value as PlannerLens })}
        >
          {LENS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Shifts how the plan is ordered. Best chance of winning leans on shows with a published win or shortlist rate.
        </p>
      </div>
    </div>
  )
}
