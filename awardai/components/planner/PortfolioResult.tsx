'use client'
/**
 * PortfolioResult.tsx — Step 4 of the five-step flow ("Output").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 4 + §Iteration
 * mechanics. Revised P2.1:
 *   #7 SUMMARY-FIRST: a portfolio-mix snapshot bar at the top (three lanes,
 *      work split by tier, measured by show count), then collapsible drill-down
 *      sections per lane. The first view is scannable; detail is one click away.
 *   #5 LENS: the preset control is reworded into plain-language outcomes.
 *   #4 CAPACITY: the derived entries-per-campaign summary is surfaced here.
 *
 * Inputs stay EDITABLE in place; any change re-derives instantly (the page owns
 * the derivation via lib/planner-engine.ts). Odds render only through
 * <GatedNumber/>; fees render only sourced values through lib/fx.ts. No
 * cost-per-metal, no invented rate.
 *
 * The mix bar is a dependency-free CSS stacked bar with INLINE styles (the
 * Tailwind-purge-safe pattern used by GeneratingBar / the gold accents — Gotchas).
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
  suggestedMaturity: PlannerMaturity | null
  onInputChange: (patch: Partial<PlannerInput>) => void
  onSave: () => void
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  /** P3 wires the real show_requests POST (source:'planner'); P2 routes the click here. */
  onRequestCoverage?: (region: string) => void
}

/** P2.1 #5 — plain-language outcomes, not jargon. Still presets, not sliders. */
const LENS_OPTIONS: { value: PlannerLens; label: string }[] = [
  { value: 'maximize_visibility', label: 'Get seen the most' },
  { value: 'maximize_odds', label: 'Best chance of winning something' },
  { value: 'maximize_client_travel', label: 'Awards your clients respect' },
]

// Mix-bar segment colors (inline — Tailwind purges arbitrary values here).
const SEG_COLORS = {
  core: '#166534', // green-800
  prestige: '#15803d', // green-700
  reserve: '#86efac', // green-300
  titles: '#1d4ed8', // blue-700
  people: '#7c3aed', // violet-600
}

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
  suggestedMaturity,
  onInputChange,
  onSave,
  saveStatus,
  onRequestCoverage,
}: Props) {
  // Summary-first: the detailed panels start COLLAPSED (P2.1 #7). The mix bar
  // and the per-lane counts give the scan; the user expands to tweak.
  const [inputsOpen, setInputsOpen] = useState(false)
  const [workOpen, setWorkOpen] = useState(false)
  const [titlesOpen, setTitlesOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const displayCurrency = input.budgetCurrency as CurrencyCode

  // Brand-mode default seeds lane visibility; the user can override.
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
    const offDiscipline = li.facet.kind === 'work' && li.on_discipline === false

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
              {offDiscipline && (
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  Adjacent discipline
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

          <div>
            <div className="text-xs font-semibold text-gray-400">Win rate</div>
            <GatedNumber fact={getRateFact(rateFacts, li.show_name, 'win_rate')} qualitative={qualitative} />
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400">Shortlist rate</div>
            <GatedNumber fact={getRateFact(rateFacts, li.show_name, 'shortlist_rate')} qualitative={qualitative} />
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
    { key: 'flexible_reserve', label: 'Flexible reserve', blurb: 'Beyond your campaign capacity — held for opportunistic deadlines.' },
  ]

  // ── Mix snapshot (P2.1 #7): counts by segment. ──────────────────────────────
  const titlesCount = titlesVisible ? plan.agency_titles.length : 0
  const peopleCount = peopleVisible ? plan.people.length : 0
  const segments = [
    { key: 'core', label: 'Core', count: workByTier.core.length, color: SEG_COLORS.core },
    { key: 'prestige', label: 'Prestige', count: workByTier.prestige.length, color: SEG_COLORS.prestige },
    { key: 'reserve', label: 'Reserve', count: workByTier.flexible_reserve.length, color: SEG_COLORS.reserve },
    { key: 'titles', label: 'Agency titles', count: titlesCount, color: SEG_COLORS.titles },
    { key: 'people', label: 'People', count: peopleCount, color: SEG_COLORS.people },
  ].filter(s => s.count > 0)
  const totalCount = segments.reduce((n, s) => n + s.count, 0)

  const cap = plan.capacity

  return (
    <div className="space-y-6">
      {/* ── Portfolio mix snapshot (scan first, drill down below) ─────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-bold text-gray-900">Your portfolio at a glance</h2>
          <span className="text-xs text-gray-500">{totalCount} show{totalCount === 1 ? '' : 's'}</span>
        </div>

        {totalCount === 0 ? (
          <p className="text-sm text-gray-500">No shows match your market and inputs yet. Widen the market, change the discipline, or pin a show.</p>
        ) : (
          <>
            <div className="flex w-full h-4 rounded-full overflow-hidden" role="img" aria-label="Portfolio mix by lane">
              {segments.map(s => (
                <div key={s.key} style={{ width: `${(s.count / totalCount) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {segments.map(s => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.label} <span className="font-semibold tabular-nums">{s.count}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {/* Capacity read-out (P2.1 #4) — derived, not assumed. */}
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
          Budget funds about <span className="font-semibold">{cap.affordable_entries}</span> entries
          {cap.campaigns_ready && cap.entries_per_campaign !== null ? (
            <>
              {' '}· <span className="font-semibold">{cap.campaigns_ready}</span> campaign{cap.campaigns_ready === 1 ? '' : 's'} ready
              {!cap.under_budgeted && (
                <>
                  {' '}· ~<span className="font-semibold">{cap.entries_per_campaign.toFixed(cap.entries_per_campaign < 10 ? 1 : 0)}</span> entries per campaign
                </>
              )}
            </>
          ) : null}
          {cap.under_budgeted && (
            <span className="text-amber-700"> · budget covers under one entry per campaign — raise budget or focus on fewer campaigns</span>
          )}
        </div>
      </div>

      {/* ── Editable inputs, in place (collapsed by default now) ──────────────── */}
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
              campaignsReady={input.campaignsReady}
              onChange={onInputChange}
              compact
            />
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="planner-lens">What matters most for this plan?</label>
              <select
                id="planner-lens"
                className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                value={input.lens}
                onChange={e => onInputChange({ lens: e.target.value as PlannerLens })}
              >
                {LENS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Re-weights which shows the plan leans toward. Presets, not sliders: sliders would imply a precision the data cannot back.
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
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

      {/* ── Work lane (collapsible drill-down) ────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl">
        <button
          type="button"
          onClick={() => setWorkOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-base font-bold text-gray-900">Work portfolio</span>
            <span className="text-xs text-gray-500 tabular-nums">{plan.work.length}</span>
          </span>
          <span className="text-xs text-gray-500">{workOpen ? 'Hide' : 'View & tweak'}</span>
        </button>
        {workOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-3">Allocated across four reputation axes, laddered national to global.</p>
            {plan.work.length === 0 ? (
              <p className="text-sm text-gray-500">No shows match your market yet. Widen the market or pin a show.</p>
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
                ) : null,
              )
            )}
          </div>
        )}
      </section>

      {/* ── Agency titles lane (collapsible; hidden by default for brands) ────── */}
      <section className="bg-white border border-gray-200 rounded-xl">
        <div className="w-full flex items-center justify-between px-4 py-3">
          <button type="button" onClick={() => setTitlesOpen(o => !o)} className="flex items-baseline gap-2 text-left">
            <span className="text-base font-bold text-gray-900">Agency titles</span>
            <span className="text-xs text-gray-500 tabular-nums">{titlesVisible ? plan.agency_titles.length : '—'}</span>
          </button>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={titlesVisible} onChange={e => setTitlesVisible(e.target.checked)} />
            Include
          </label>
        </div>
        {titlesVisible && titlesOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            {plan.agency_titles.length === 0 ? (
              <p className="text-sm text-gray-500">No agency-title awards match your market yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">{plan.agency_titles.map(renderLine)}</ul>
            )}
          </div>
        )}
        {titlesVisible && !titlesOpen && plan.agency_titles.length > 0 && (
          <button type="button" onClick={() => setTitlesOpen(true)} className="px-4 pb-3 text-xs text-green-700 hover:text-green-800 underline">
            View & tweak
          </button>
        )}
        {!titlesVisible && (
          <p className="px-4 pb-3 text-xs text-gray-400">Hidden by default for in-house teams. Tick &quot;Include&quot; to add them.</p>
        )}
      </section>

      {/* ── People lane (collapsible) ─────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl">
        <div className="w-full flex items-center justify-between px-4 py-3">
          <button type="button" onClick={() => setPeopleOpen(o => !o)} className="flex items-baseline gap-2 text-left">
            <span className="text-base font-bold text-gray-900">People</span>
            <span className="text-xs text-gray-500 tabular-nums">{peopleVisible ? plan.people.length : '—'}</span>
          </button>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={peopleVisible} onChange={e => setPeopleVisible(e.target.checked)} />
            Include
          </label>
        </div>
        {peopleVisible && peopleOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            {plan.people.length === 0 ? (
              <p className="text-sm text-gray-500">No people awards match your market yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">{plan.people.map(renderLine)}</ul>
            )}
          </div>
        )}
        {peopleVisible && !peopleOpen && plan.people.length > 0 && (
          <button type="button" onClick={() => setPeopleOpen(true)} className="px-4 pb-3 text-xs text-green-700 hover:text-green-800 underline">
            View & tweak
          </button>
        )}
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
