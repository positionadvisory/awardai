'use client'
/**
 * BudgetPlanner.tsx — Award Entry Budget Planner
 * =============================================================================
 * Project-level budget planning tool for agency marketing leads.
 * Answers: "I have $X budget over Y months — given these directions, what's
 * the optimal approach?"
 *
 * Replaces the previous ROI/win-probability calculator. This tool is honest
 * about what we can know (costs, deadlines, category fit) without pretending
 * to predict outcomes.
 *
 * Features:
 *  - Total budget + time horizon inputs
 *  - Per-direction cost breakdown (entry fee + configurable production costs)
 *  - Category fit score from direction data
 *  - Deadline-within-window check
 *  - Production cost defaults loaded from agency_profiles + editable/saveable
 *  - Auto-generated plain-English budget summary
 *
 * Props:
 *   directions     — Array of direction objects from the project
 *   orgId          — Org ID for loading/saving agency cost defaults
 *   prefilledShow  — Optional: highlight a specific show on open
 *
 * Destination: components/shows/BudgetPlanner.tsx
 * =============================================================================
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  WIN_RATES,
  ENTRY_FEES,
  resolveWinRateKey,
  getDeadlineUrgency,
} from '@/lib/shows-data'

// ── Types ──────────────────────────────────────────────────────────────────────

type Direction = {
  id: number
  name: string
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null
}

type CostDefaults = {
  copywriting: number   // entry writing / copyediting per entry
  caseFilm: number      // case film / video production per entry
  design: number        // design, PDF, print per entry
  other: number         // any other costs per entry
  currency: string      // ISO code: 'USD' | 'GBP' | 'AUD' | 'SGD' | 'EUR'
}

const FALLBACK_COSTS: CostDefaults = {
  copywriting: 800,
  caseFilm: 4500,
  design: 500,
  other: 0,
  currency: 'USD',
}

const CURRENCIES = [
  { code: 'USD', symbol: '$',  label: 'USD ($)' },
  { code: 'GBP', symbol: '£',  label: 'GBP (£)' },
  { code: 'EUR', symbol: '€',  label: 'EUR (€)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
]

const TIME_HORIZONS = [3, 6, 9, 12, 18]

type Props = {
  directions: Direction[]
  orgId?: number | null
  prefilledShow?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function currencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$'
}

function fmt(n: number, currency: string): string {
  const sym = currencySymbol(currency)
  return `${sym}${n.toLocaleString()}`
}

function getEntryFee(showName: string | null | undefined): number | null {
  if (!showName) return null
  const key = resolveWinRateKey(showName)
  if (key && WIN_RATES[key]?.fee) return WIN_RATES[key].fee
  if (ENTRY_FEES[showName]?.base) return ENTRY_FEES[showName].base
  return null
}

function getEntryFeeRange(showName: string | null | undefined): string {
  if (!showName) return ''
  const key = resolveWinRateKey(showName)
  if (key && ENTRY_FEES[key]) return ENTRY_FEES[key].range
  if (ENTRY_FEES[showName]) return ENTRY_FEES[showName].range
  return ''
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BudgetPlanner({ directions, orgId, prefilledShow }: Props) {
  const [totalBudget,       setTotalBudget]       = useState(15000)
  const [horizon,           setHorizon]           = useState(6)
  const [costs,             setCosts]             = useState<CostDefaults>(FALLBACK_COSTS)
  const [costsOpen,         setCostsOpen]         = useState(false)
  const [saveStatus,        setSaveStatus]        = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loadingCosts,      setLoadingCosts]      = useState(false)
  const [included,          setIncluded]          = useState<Record<number, boolean>>({})

  // ── Load cost defaults from agency_profiles ────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    setLoadingCosts(true)
    supabase
      .from('agency_profiles')
      .select('cost_defaults')
      .eq('org_id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.cost_defaults) {
          setCosts({ ...FALLBACK_COSTS, ...data.cost_defaults })
        }
        setLoadingCosts(false)
      })
  }, [orgId])

  // ── Default all directions to "included" on first load ────────────────────
  useEffect(() => {
    const defaults: Record<number, boolean> = {}
    directions.forEach(d => { defaults[d.id] = true })
    setIncluded(defaults)
  }, [directions])

  // ── Save cost defaults ─────────────────────────────────────────────────────
  const saveCosts = async () => {
    if (!orgId) return
    setSaveStatus('saving')
    const { error } = await supabase
      .from('agency_profiles')
      .update({ cost_defaults: costs })
      .eq('org_id', orgId)
    setSaveStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setSaveStatus('idle'), 2500)
  }

  // ── Per-direction calculations ─────────────────────────────────────────────
  const productionTotal = costs.copywriting + costs.caseFilm + costs.design + costs.other

  const planRows = directions
    .filter(d => d.best_show)
    .sort((a, b) => (b.win_likelihood ?? 0) - (a.win_likelihood ?? 0))
    .map(d => {
      const entryFee   = getEntryFee(d.best_show)
      const feeRange   = getEntryFeeRange(d.best_show)
      const totalCost  = (entryFee ?? 0) + productionTotal
      const urgency    = getDeadlineUrgency(d.best_show)
      const inWindow   = urgency.daysLeft !== null && urgency.daysLeft >= 0
                          && urgency.daysLeft <= horizon * 30.5
      const fit        = d.win_likelihood ?? 0

      return { dir: d, entryFee, feeRange, totalCost, urgency, inWindow, fit }
    })

  const includedRows    = planRows.filter(r => included[r.dir.id] !== false)
  const totalSelected   = includedRows.reduce((s, r) => s + r.totalCost, 0)
  const withinBudget    = totalSelected <= totalBudget
  const budgetRemaining = totalBudget - totalSelected
  const inWindowCount   = planRows.filter(r => r.inWindow).length
  const noShowDirs      = directions.filter(d => !d.best_show)

  // ── Narrative ──────────────────────────────────────────────────────────────
  const narrative = (() => {
    const sym = currencySymbol(costs.currency)
    if (planRows.length === 0) {
      return `No directions with known award shows yet. Generate directions first, then return here to plan your budget.`
    }
    const topFits = planRows.filter(r => r.inWindow).slice(0, 2)
    const topNames = topFits.map(r => `${r.dir.best_show}${r.dir.best_category ? ` (${r.dir.best_category})` : ''}`).join(' and ')
    const windowStr = `${horizon}-month window`
    const budgetStr = fmt(totalBudget, costs.currency)

    if (inWindowCount === 0) {
      return `None of the ${planRows.length} suggested direction${planRows.length !== 1 ? 's' : ''} have deadlines within your ${windowStr}. Consider extending your planning horizon, or check the Timeline tab for upcoming shows.`
    }

    const costStr = fmt(totalSelected, costs.currency)
    const remainStr = fmt(Math.abs(budgetRemaining), costs.currency)

    const openingLine = `With a ${budgetStr} budget over ${horizon} months, ${inWindowCount} of ${planRows.length} direction${planRows.length !== 1 ? 's' : ''} ${inWindowCount === 1 ? 'has a' : 'have'} deadline${inWindowCount !== 1 ? 's' : ''} within your window.`

    const fitLine = topNames
      ? ` Your highest category-fit ${topFits.length === 1 ? 'opportunity is' : 'opportunities are'} ${topNames}.`
      : ''

    const budgetLine = includedRows.length > 0
      ? withinBudget
        ? ` The selected entries would cost ${costStr} in total — ${sym}${Math.abs(budgetRemaining).toLocaleString()} ${withinBudget ? 'within' : 'over'} budget.`
        : ` The selected entries would cost ${costStr} — ${remainStr} over your current budget. Consider deselecting lower-fit directions or adjusting your budget.`
      : ''

    return openingLine + fitLine + budgetLine
  })()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-6 pb-10 pt-4">

      {/* Disclaimer */}
      <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <strong>About this planner:</strong> Costs are estimates based on known entry fees and your agency&apos;s default production costs. Entry fees are shown in the show&apos;s native currency. Category fit scores come from AI direction analysis.
      </div>

      {/* ── Budget + Horizon Inputs ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-4">Your budget</p>
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1.5">Total awards budget</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">{currencySymbol(costs.currency)}</span>
              <input
                type="number"
                min={0}
                step={500}
                value={totalBudget}
                onChange={e => setTotalBudget(Math.max(0, Number(e.target.value)))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:border-green-600 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Planning horizon</label>
            <div className="flex gap-1.5">
              {TIME_HORIZONS.map(m => (
                <button
                  key={m}
                  onClick={() => setHorizon(m)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    m === horizon
                      ? 'bg-green-800 text-white border-green-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Production Cost Settings (collapsible) ── */}
      <div className="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => setCostsOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800">Production cost defaults</span>
            <span className="text-xs text-gray-400">
              ({currencySymbol(costs.currency)}{productionTotal.toLocaleString()} per entry)
            </span>
            {!orgId && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                sign in to save
              </span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{costsOpen ? '↑ Hide' : '↓ Edit'}</span>
        </button>

        {costsOpen && (
          <div className="border-t border-gray-100 px-5 py-4">
            {loadingCosts ? (
              <p className="text-sm text-gray-400">Loading your agency defaults…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {(
                    [
                      { key: 'copywriting', label: 'Entry writing / copy' },
                      { key: 'caseFilm',    label: 'Case film production' },
                      { key: 'design',      label: 'Design / print / PDF' },
                      { key: 'other',       label: 'Other costs' },
                    ] as { key: keyof CostDefaults; label: string }[]
                  )
                    .filter(f => typeof costs[f.key] === 'number')
                    .map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">{currencySymbol(costs.currency)}</span>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={costs[key] as number}
                            onChange={e => {
                              setCosts(prev => ({ ...prev, [key]: Math.max(0, Number(e.target.value)) }))
                              setSaveStatus('idle')
                            }}
                            className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:border-green-600 outline-none"
                          />
                        </div>
                      </div>
                    ))}
                </div>

                {/* Currency selector */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">Production costs currency</label>
                  <select
                    value={costs.currency}
                    onChange={e => setCosts(prev => ({ ...prev, currency: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:border-green-600 outline-none"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Entry fees are shown in the show&apos;s native currency separately.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveCosts}
                    disabled={!orgId || saveStatus === 'saving'}
                    className={`text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                      !orgId
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : saveStatus === 'saved'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-green-800 hover:bg-green-700 text-white'
                    }`}
                  >
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved to agency account' : 'Save as agency default'}
                  </button>
                  {saveStatus === 'error' && (
                    <span className="text-xs text-red-600">Save failed — check connection</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Direction Breakdown ── */}
      {planRows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center">
          <p className="text-sm text-gray-500">No directions with known shows yet.</p>
          <p className="text-xs text-gray-400 mt-1">Generate directions in the Directions tab, then come back here.</p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Directions</p>
            <p className="text-xs text-gray-400">Toggle rows to include/exclude from budget</p>
          </div>

          <div className="space-y-2 mb-4">
            {planRows.map(({ dir, entryFee, feeRange, totalCost, urgency, inWindow, fit }) => {
              const isIncluded = included[dir.id] !== false
              const isHighlighted = prefilledShow && dir.best_show?.toLowerCase().includes(prefilledShow.toLowerCase())

              return (
                <div
                  key={dir.id}
                  className={`bg-white border rounded-xl p-4 transition-all ${
                    isHighlighted ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'
                  } ${!isIncluded ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => setIncluded(prev => ({ ...prev, [dir.id]: !isIncluded }))}
                      className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isIncluded ? 'bg-green-700 border-green-700' : 'border-gray-300'
                      }`}
                      aria-label={isIncluded ? 'Exclude from plan' : 'Include in plan'}
                    >
                      {isIncluded && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {dir.best_show}
                          </p>
                          {dir.best_category && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{dir.best_category}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Category fit */}
                          {fit > 0 && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              fit >= 70 ? 'bg-green-50 text-green-700 border border-green-200'
                              : fit >= 45 ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {fit}% fit
                            </span>
                          )}
                          {/* Deadline badge */}
                          {urgency.daysLeft !== null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              !inWindow
                                ? 'bg-gray-50 text-gray-500 border-gray-200'
                                : urgency.level === 'critical'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : urgency.level === 'tight'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {inWindow ? `${urgency.daysLeft}d to deadline` : 'Outside window'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cost breakdown */}
                      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Entry fee</span>
                          <span className="font-medium text-gray-800">
                            {entryFee != null
                              ? feeRange || `~${entryFee.toLocaleString()}`
                              : <span className="text-gray-400 italic">Check website</span>
                            }
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Entry writing</span>
                          <span className="font-medium text-gray-800">
                            {currencySymbol(costs.currency)}{costs.copywriting.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Case film</span>
                          <span className="font-medium text-gray-800">
                            {currencySymbol(costs.currency)}{costs.caseFilm.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Design</span>
                          <span className="font-medium text-gray-800">
                            {currencySymbol(costs.currency)}{costs.design.toLocaleString()}
                          </span>
                        </div>
                        {costs.other > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Other</span>
                            <span className="font-medium text-gray-800">
                              {currencySymbol(costs.currency)}{costs.other.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Total + budget check */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          Production total: {fmt(productionTotal, costs.currency)}
                          {entryFee != null && (
                            <> + entry fee</>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isIncluded && (
                            <span className={`text-xs font-semibold ${totalCost <= totalBudget ? 'text-green-700' : 'text-amber-700'}`}>
                              {totalCost <= totalBudget ? '✓ Fits budget' : '⚠ Over budget'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Directions without a known show */}
            {noShowDirs.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-500">
                {noShowDirs.length} direction{noShowDirs.length !== 1 ? 's' : ''} without a specified show
                ({noShowDirs.map(d => d.name).join(', ')}) — entry costs not calculated.
              </div>
            )}
          </div>

          {/* ── Budget Summary Bar ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800">Budget summary</p>
              <p className={`text-sm font-bold ${withinBudget ? 'text-green-700' : 'text-amber-700'}`}>
                {fmt(totalSelected, costs.currency)} of {fmt(totalBudget, costs.currency)}
              </p>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  withinBudget ? 'bg-green-600' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, (totalSelected / totalBudget) * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{includedRows.length} of {planRows.length} direction{planRows.length !== 1 ? 's' : ''} selected</span>
              <span className={withinBudget ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                {withinBudget
                  ? `${fmt(budgetRemaining, costs.currency)} remaining`
                  : `${fmt(-budgetRemaining, costs.currency)} over budget`
                }
              </span>
            </div>
          </div>

          {/* ── Narrative Summary ── */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1.5">Budget summary</p>
            <p className="text-sm text-green-900 leading-relaxed">{narrative}</p>
          </div>
        </>
      )}

      {/* Entry fee note */}
      <p className="text-xs text-gray-400 mt-4 leading-relaxed">
        Entry fees shown in the show&apos;s native currency from published rate cards (verify before submitting). Production costs shown in your selected currency. Totals combine both — account for exchange rates if mixing currencies.
      </p>

    </div>
  )
}
