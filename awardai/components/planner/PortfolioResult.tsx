'use client'
/**
 * PortfolioResult.tsx — Step 4 of the five-step flow ("Output").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 4 + §Iteration
 * mechanics. Renders the derived plan as three lanes (work portfolio by axis /
 * agency titles / people). Inputs stay VISIBLE AND EDITABLE in place; any change
 * re-derives instantly (the page owns the derivation via lib/planner-engine.ts;
 * this component computes NO allocation of its own). Per-show pin/exclude
 * toggles, the three preset lenses (no raw sliders), coverage-gap slots flagged
 * with a show-request entry, closed-cycle shows shown as "next cycle opens ~X".
 *
 * Numbers obey the publish gate: odds render only through <GatedNumber/>
 * (lib/rate-facts.ts); fees render only sourced values through lib/fx.ts's
 * dated conversion (chosen currency + native + FX date). No cost-per-metal,
 * no invented rate, anywhere.
 * =============================================================================
 */

import { useState } from 'react'
import GatedNumber from '@/components/GatedNumber'
import AxisBadge from '@/components/planner/AxisBadge'
import PlannerIdentity from '@/components/planner/PlannerIdentity'
import PlannerTarget from '@/components/planner/PlannerTarget'
import PlannerEnvelope from '@/components/planner/PlannerEnvelope'
import { getRateFact, type RateFact } from '@/lib/rate-facts'
import { sameShow } from '@/lib/show-taxonomy'
import type { PlannerFacet } from '@/lib/planner-facets'
import type {
  PlannerInput,
  PlannerLens,
  PlannerLineItem,
  PlannerMaturity,
  PlannerPlan,
} from '@/lib/planner-engine'
import { AXIS_QUALITATIVE, LANE_QUALITATIVE, feeForShow, formatMoney } from '@/lib/planner-display'
import type { CurrencyCode } from '@/lib/fx'

type Props = {
  plan: PlannerPlan
  input: PlannerInput
  facets: PlannerFacet[]
  rateFacts: RateFact[]
  capacity: number | null
  suggestedMaturity: PlannerMaturity | null
  onInputChange: (patch: Partial<PlannerInput>) => void
  onCapacityChange: (capacity: number | null) => void
  onSave: () => void
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  /** P3 wires the real show_requests POST (source:'planner'); P2 routes the click here. */
  onRequestCoverage?: (region: string) => void
}

const LENS_OPTIONS: { value: PlannerLens; label: string }[] = [
  { value: 'maximize_visibility', label: 'Maximize visibility' },
  { value: 'maximize_odds', label: 'Maximize odds' },
  { value: 'maximize_client_travel', label: 'Maximize client travel' },
]

/** Year after a closed cycle's final date, for the "next cycle opens ~X" line. */
function nextCycleYear(finalDate: string | null): string {
  if (!finalDate) return ''
  const y = Number(finalDate.slice(0, 4))
  return Number.isFinite(y) ? String(y + 1) : ''
}

function prettyDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PortfolioResult({
  plan,
  input,
  facets,
  rateFacts,
  capacity,
  suggestedMaturity,
  onInputChange,
  onCapacityChange,
  onSave,
  saveStatus,
  onRequestCoverage,
}: Props) {
  const [inputsOpen, setInputsOpen] = useState(true)
  const displayCurrency = input.budgetCurrency as CurrencyCode

  // Brand-mode default seeds lane visibility; the user can override (defaults
  // tilt, never restrict — Ben, 16 Jul). Local UI state, not persisted.
  const [titlesVisible, setTitlesVisible] = useState(plan.lane_defaults.agency_titles_visible)
  const [peopleVisible, setPeopleVisible] = useState(plan.lane_defaults.people_visible)

  const isPinned = (name: string) => input.pins.some(p => sameShow(p, name))
  const isExcluded = (name: string) => input.excludes.some(e => sameShow(e, name))

  const togglePin = (name: string) => {
    if (isPinned(name)) {
      onInputChange({ pins: input.pins.filter(p => !sameShow(p, name)) })
    } else {
      onInputChange({ pins: [...input.pins, name], excludes: input.excludes.filter(e => !sameShow(e, name)) })
    }
  }
  const toggleExclude = (name: string) => {
    if (isExcluded(name)) {
      onInputChange({ excludes: input.excludes.filter(e => !sameShow(e, name)) })
    } else {
      onInputChange({ excludes: [...input.excludes, name], pins: input.pins.filter(p => !sameShow(p, name)) })
    }
  }

  // ── One line item (used across all three lanes) ─────────────────────────────
  const renderLine = (li: PlannerLineItem) => {
    const axis = li.facet.axis
    const fee = feeForShow(li.show_name, displayCurrency)
    const qualitative = axis ? AXIS_QUALITATIVE[axis] : LANE_QUALITATIVE
    const rationale = li.facet.discipline_note || qualitative
    const pinned = isPinned(li.show_name)
    const closed = li.cycle_status === 'next_cycle'
    const unknown = li.cycle_status === 'unknown_cycle'

    return (
      <li key={li.show_name} className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900">{li.show_name}</span>
              {axis && <AxisBadge axis={axis} />}
              {pinned && (
                <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                  Pinned
                </span>
              )}
              {closed && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                  Next cycle
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">{rationale}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => togglePin(li.show_name)}
              className={`text-xs rounded-md px-2 py-1 border ${
                pinned
                  ? 'border-green-600 text-green-700 bg-green-50'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              onClick={() => toggleExclude(li.show_name)}
              className="text-xs rounded-md px-2 py-1 border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
            >
              Exclude
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
          {/* Fee — sourced only, chosen currency + native + FX date. */}
          <div>
            <div className="text-xs font-semibold text-gray-400">Entry fee</div>
            {fee.hasFee && fee.display && fee.native ? (
              <div className="text-gray-900">
                <span className="font-semibold tabular-nums">
                  {formatMoney(fee.display.value, fee.display.currency)}
                </span>
                {fee.display.currency !== 'USD' && (
                  <span className="text-gray-400 text-xs ml-1">
                    ({formatMoney(fee.native.value, 'USD')}{fee.rateDate ? `, FX ${fee.rateDate}` : ''})
                  </span>
                )}
                {fee.rangeNote && (
                  <span className="block text-gray-400 text-xs" title={fee.note ?? undefined}>
                    {fee.rangeNote}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-xs">
                Fee not published as a single figure
                {fee.rangeNote ? ` — ${fee.rangeNote}` : ''}
              </div>
            )}
          </div>

          {/* Win rate — GatedNumber (honest fallback when no number may render). */}
          <div>
            <div className="text-xs font-semibold text-gray-400">Win rate</div>
            <GatedNumber
              fact={getRateFact(rateFacts, li.show_name, 'win_rate')}
              qualitative={qualitative}
            />
          </div>

          {/* Shortlist rate — GatedNumber. */}
          <div>
            <div className="text-xs font-semibold text-gray-400">Shortlist rate</div>
            <GatedNumber
              fact={getRateFact(rateFacts, li.show_name, 'shortlist_rate')}
              qualitative={qualitative}
            />
          </div>
        </div>

        {(closed || unknown) && (
          <p className="text-xs text-amber-700 mt-2">
            {closed
              ? `This cycle has closed${li.final_date ? ` (deadline ${prettyDate(li.final_date)})` : ''}. Next cycle opens ~${nextCycleYear(li.final_date)}.`
              : 'Cycle dates not yet confirmed for this show.'}
          </p>
        )}
      </li>
    )
  }

  // ── Work lane, grouped by tier (Core / Prestige / Flexible reserve) ─────────
  const workByTier: Record<'core' | 'prestige' | 'flexible_reserve', PlannerLineItem[]> = {
    core: [],
    prestige: [],
    flexible_reserve: [],
  }
  for (const li of plan.work) {
    const t = li.tier ?? 'core'
    workByTier[t].push(li)
  }
  const TIER_LABELS: { key: 'core' | 'prestige' | 'flexible_reserve'; label: string; blurb: string }[] = [
    { key: 'core', label: 'Core', blurb: 'The axes that fit your stage and target.' },
    { key: 'prestige', label: 'Prestige', blurb: 'Creative-fame shows, curated and best-only.' },
    { key: 'flexible_reserve', label: 'Flexible reserve', blurb: 'Held for opportunistic deadlines.' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Editable inputs, in place (instant re-derivation) ────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <button
          type="button"
          onClick={() => setInputsOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-gray-900">Your inputs</span>
          <span className="text-xs text-gray-500">{inputsOpen ? 'Hide' : 'Edit'}</span>
        </button>
        {inputsOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
            <PlannerIdentity
              value={{
                discipline: input.discipline,
                orgType: input.orgType,
                region: input.region,
                maturity: input.maturity,
              }}
              suggestedMaturity={suggestedMaturity}
              onChange={onInputChange}
              compact
            />
            <PlannerTarget
              discipline={input.discipline}
              facets={facets}
              value={input.targetTitle ?? ''}
              onChange={t => onInputChange({ targetTitle: t })}
              compact
            />
            <PlannerEnvelope
              budget={input.budget}
              budgetCurrency={displayCurrency}
              capacity={capacity}
              onChange={onInputChange}
              onCapacityChange={onCapacityChange}
              compact
            />
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="planner-lens">Lens</label>
              <select
                id="planner-lens"
                className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                value={input.lens}
                onChange={e => onInputChange({ lens: e.target.value as PlannerLens })}
              >
                {LENS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Presets, not sliders. Sliders would imply a precision the data cannot back.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onSave}
                disabled={saveStatus === 'saving'}
                className="text-sm bg-green-800 hover:bg-green-700 text-white rounded-lg px-4 py-2 disabled:opacity-60"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save these inputs'}
              </button>
              {saveStatus === 'saved' && <span className="text-xs text-green-700">Saved.</span>}
              {saveStatus === 'error' && <span className="text-xs text-red-600">Could not save. Try again.</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Coverage gaps (flagged, never silently dropped) ──────────────────── */}
      {plan.coverage_gaps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          {plan.coverage_gaps.map((g, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-amber-800">{g.reason}</p>
              <button
                type="button"
                onClick={() => onRequestCoverage?.(g.region)}
                className="text-sm shrink-0 border border-amber-400 text-amber-800 rounded-lg px-3 py-1.5 hover:bg-amber-100"
              >
                Request coverage for {g.region || 'your market'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Work lane ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-1">Work portfolio</h2>
        <p className="text-xs text-gray-500 mb-3">Allocated across four reputation axes, laddered national to global.</p>
        {plan.work.length === 0 ? (
          <p className="text-sm text-gray-500">No work shows match this discipline yet. Widen the discipline or pin a show.</p>
        ) : (
          TIER_LABELS.map(t =>
            workByTier[t.key].length > 0 ? (
              <div key={t.key} className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-800">{t.label}</span>
                  <span className="text-xs text-gray-400">{t.blurb}</span>
                </div>
                <ul className="grid grid-cols-1 gap-2">{workByTier[t.key].map(renderLine)}</ul>
              </div>
            ) : null
          )
        )}
      </section>

      {/* ── Agency titles lane (hidden by default for brands) ────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">Agency titles</h2>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={titlesVisible} onChange={e => setTitlesVisible(e.target.checked)} />
            Show
          </label>
        </div>
        {titlesVisible ? (
          plan.agency_titles.length === 0 ? (
            <p className="text-sm text-gray-500">No agency-title awards match yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">{plan.agency_titles.map(renderLine)}</ul>
          )
        ) : (
          <p className="text-xs text-gray-400">Hidden by default for in-house teams. Tick "Show" to include them.</p>
        )}
      </section>

      {/* ── People lane ──────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">People</h2>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={peopleVisible} onChange={e => setPeopleVisible(e.target.checked)} />
            Show
          </label>
        </div>
        {peopleVisible ? (
          plan.people.length === 0 ? (
            <p className="text-sm text-gray-500">No people awards match yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">{plan.people.map(renderLine)}</ul>
          )
        ) : null}
      </section>

      {/* ── Not-directly-enterable note (Global SABRE) ───────────────────────── */}
      {plan.excluded_not_directly_enterable.length > 0 && (
        <p className="text-xs text-gray-400">
          Not shown (cannot be entered directly): {plan.excluded_not_directly_enterable.join(', ')}. These are awarded
          from performance in other shows, not bought with an entry.
        </p>
      )}
    </div>
  )
}
