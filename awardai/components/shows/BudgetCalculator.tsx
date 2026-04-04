'use client'
/**
 * BudgetCalculator.tsx — Win Probability & ROI Estimator
 * =============================================================================
 * Realistic expected value calculator based on historical win rates × entry quality.
 *
 * Features:
 *  - Reality-check callout (Cannes Grand Prix base rate ~0.08%)
 *  - Target award level selector: Shortlist / Metal / Gold / Grand Prix
 *  - Entry plan grid: show, number of entries, quality slider (0–100)
 *  - Auto-prefill from parent (show name + quality from critique score)
 *  - KPI cards: Total Entry Cost / Expected PR Value / Expected ROI
 *  - Per-show breakdown table
 *  - Benchmark grid across all shows at the selected level
 *
 * Props:
 *   prefilledShow     — Show name to pre-select (from directions or critique)
 *   prefilledQuality  — Quality score 0–100 (from critique overall_score × 10)
 *
 * Destination: components/shows/BudgetCalculator.tsx
 * =============================================================================
 */

import { useState, useEffect } from 'react'
import { WIN_RATES, qFactor, resolveWinRateKey } from '@/lib/shows-data'

// ── Types ──────────────────────────────────────────────────────────────────────

type RoiRow = {
  show: string
  cats: number
  quality: number
}

type AwardLevel = 'shortlist' | 'metal' | 'gold' | 'grandprix'

const LEVELS: { key: AwardLevel; label: string; description: string }[] = [
  {
    key: 'shortlist',
    label: 'Shortlist',
    description: 'Shortlists are announced before final judging. Meaningful at prestige shows; relatively achievable at ~10–30% of entrants.',
  },
  {
    key: 'metal',
    label: 'Metal',
    description: 'Bronze, Silver or Pencil equivalent. Solid achievement — meaningful for agency reputation and new business.',
  },
  {
    key: 'gold',
    label: 'Gold',
    description: 'Gold is rare — under 5% of entrants at global shows. Major PR and new business catalyst.',
  },
  {
    key: 'grandprix',
    label: 'Grand Prix',
    description: 'The single best entry in a category — often not awarded at all. Sub-1% probability at elite shows. High lottery variance.',
  },
]

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  prefilledShow?: string
  prefilledQuality?: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BudgetCalculator({ prefilledShow, prefilledQuality }: Props) {
  const resolvedShow = prefilledShow ? resolveWinRateKey(prefilledShow) : null

  const [rows, setRows] = useState<RoiRow[]>([
    {
      show: resolvedShow ?? 'Cannes Lions',
      cats: 1,
      quality: prefilledQuality ?? 60,
    },
  ])
  const [level, setLevel] = useState<AwardLevel>('metal')

  // When prefill changes (drawer reopened with new context), reset rows
  useEffect(() => {
    if (!prefilledShow) return
    const key = resolveWinRateKey(prefilledShow)
    if (key) {
      setRows([{ show: key, cats: 1, quality: prefilledQuality ?? 60 }])
    }
  }, [prefilledShow, prefilledQuality])

  // ── Core calculation ────────────────────────────────────────────────────────

  const filledRows = rows.filter(r => r.show && WIN_RATES[r.show])

  const perRow = filledRows.map(r => {
    const wr       = WIN_RATES[r.show]
    const baseRate = wr[level]
    const pWin     = (baseRate / 100) * qFactor(r.quality)
    const cost     = wr.fee * (r.cats || 1)
    const prVal    = wr.pr[level] * pWin * (r.cats || 1)
    return {
      show: r.show,
      cats: r.cats || 1,
      quality: r.quality || 60,
      baseRate,
      pWinPct: pWin * 100,
      cost,
      prVal,
      netEV: prVal - cost,
    }
  })

  const totalCost  = perRow.reduce((a, r) => a + r.cost, 0)
  const totalEV    = perRow.reduce((a, r) => a + r.prVal, 0)
  const overallROI = totalCost > 0
    ? ((totalEV - totalCost) / totalCost * 100).toFixed(0)
    : '0'
  const roiNum = Number(overallROI)

  const activeLevel = LEVELS.find(l => l.key === level)!

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const updateRow = (i: number, patch: Partial<RoiRow>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const qualityColor = (q: number) =>
    q >= 70 ? 'text-green-700' : q >= 40 ? 'text-amber-600' : 'text-red-600'

  const pWinColor = (p: number) =>
    p < 0.5 ? 'text-red-600' : p < 8 ? 'text-amber-600' : 'text-green-700'

  const kpiColor = (label: string) => {
    if (label === 'Total Entry Cost') return 'text-red-600'
    if (label === 'Expected PR Value') return totalEV > totalCost ? 'text-green-700' : 'text-amber-600'
    return roiNum > 200 ? 'text-green-700' : roiNum > 0 ? 'text-amber-600' : 'text-red-600'
  }

  return (
    <div className="px-6 pb-10 pt-2 max-w-4xl">

      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-semibold text-gray-900">Win Probability & ROI Estimator</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Realistic expected value based on historical win rates × entry quality.
          Results may be sobering — that's the point.
        </p>
      </div>

      {/* Reality check */}
      <div className="mb-5 px-4 py-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-gray-600 leading-relaxed">
        <strong className="text-red-700">Reality check: </strong>
        A Cannes Lions Grand Prix has a base win rate of ~0.08%. Even with a strong entry (quality 85/100),
        your adjusted probability is around{' '}
        <strong className="text-gray-800">
          {((0.08 / 100) * qFactor(85) * 100).toFixed(2)}%
        </strong>.
        {' '}You could spend $50,000 entering across multiple categories and win nothing.
        Use these numbers for honest internal budgeting, not to promise clients wins.
      </div>

      {/* Level selector */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Target Award Level
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          {LEVELS.map(l => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={`text-xs font-medium px-4 py-2 rounded-full border transition-colors ${
                l.key === level
                  ? 'bg-green-800 text-white border-green-800'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{activeLevel.description}</p>
      </div>

      {/* Entry plan grid */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Entry Plan
        </p>

        {/* Column headers */}
        <div className="grid items-center gap-3 mb-2 px-0.5"
          style={{ gridTemplateColumns: '2fr 60px 1fr auto' }}
        >
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Show</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Entries</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quality (link from critique score)</span>
          <span />
        </div>

        {rows.map((row, i) => {
          const wr  = WIN_RATES[row.show]
          const pct = wr
            ? ((wr[level] / 100) * qFactor(row.quality || 60) * 100).toFixed(2)
            : null
          return (
            <div
              key={i}
              className="grid items-center gap-3 mb-3"
              style={{ gridTemplateColumns: '2fr 60px 1fr auto' }}
            >
              {/* Show select */}
              <select
                value={row.show}
                onChange={e => updateRow(i, { show: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
              >
                <option value="">— Select show —</option>
                {Object.keys(WIN_RATES).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Entry count */}
              <input
                type="number"
                min="1"
                max="20"
                value={row.cats || 1}
                onChange={e => updateRow(i, { cats: Math.max(1, parseInt(e.target.value) || 1) })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-center text-gray-900 bg-white w-full focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
              />

              {/* Quality slider */}
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={row.quality || 60}
                  onChange={e => updateRow(i, { quality: Number(e.target.value) })}
                  className="flex-1 accent-green-700 h-1.5"
                />
                <span
                  className={`text-xs font-bold min-w-[42px] text-right tabular-nums ${
                    qualityColor(row.quality || 60)
                  }`}
                >
                  {row.quality || 60}/100
                </span>
                {pct && (
                  <span className="text-xs text-gray-400 min-w-[52px] text-right tabular-nums shrink-0">
                    P={pct}%
                  </span>
                )}
              </div>

              {/* Remove */}
              <button
                onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none px-1"
                title="Remove"
              >
                ×
              </button>
            </div>
          )
        })}

        <button
          onClick={() => setRows(prev => [...prev, { show: '', cats: 1, quality: 60 }])}
          className="mt-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 transition-colors"
        >
          + Add show
        </button>
      </div>

      {/* KPIs + breakdown — only when there are filled rows */}
      {filledRows.length > 0 && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              {
                label: 'Total Entry Cost',
                value: `$${totalCost.toLocaleString()}`,
                sub: `${filledRows.length} show${filledRows.length > 1 ? 's' : ''}`,
              },
              {
                label: 'Expected PR Value',
                value: `$${Math.round(totalEV).toLocaleString()}`,
                sub: `At ${activeLevel.label} level`,
              },
              {
                label: 'Expected ROI',
                value: `${overallROI}%`,
                sub: roiNum > 0
                  ? 'Positive EV — but highly uncertain'
                  : 'Negative EV at this quality / level',
              },
            ].map((kpi, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center"
              >
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{kpi.label}</p>
                <p className={`text-2xl font-extrabold tabular-nums ${kpiColor(kpi.label)}`}>
                  {kpi.value}
                </p>
                <p className="text-xs text-gray-400 mt-1 leading-tight">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Per-show breakdown table */}
          <div className="mb-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Per-Show Breakdown
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Show', 'Entries', 'Quality', 'Base Rate', 'Adj. P(win)', 'Entry Cost', 'Exp. PR Value', 'Net EV'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {perRow.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.show}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{r.cats}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${qualityColor(r.quality)}`}>{r.quality}/100</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.baseRate}%</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${pWinColor(r.pWinPct)}`}>
                          {r.pWinPct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-red-600 font-semibold">
                        ${r.cost.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-green-700 font-semibold">
                        ${Math.round(r.prVal).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 font-bold ${r.netEV >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {r.netEV >= 0 ? '+' : ''}{Math.round(r.netEV).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 leading-relaxed">
                Adjusted P(win) = base rate × quality factor (quality 0=0.25×, quality 50≈0.84×, quality 85≈2.0×, max 3×).
                Expected PR value = P(win) × estimated earned media value at that award level.
                Net EV = Expected PR Value − Entry Cost. Positive EV does not guarantee a win.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Benchmark grid */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Benchmark: {activeLevel.label} Win Rates Across All Shows
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
          {Object.entries(WIN_RATES).map(([show, wr]) => {
            const base = wr[level]
            const adj  = ((base / 100) * qFactor(70) * 100).toFixed(2)
            const baseColor = base < 1 ? 'text-red-600' : base < 10 ? 'text-amber-600' : 'text-green-700'
            return (
              <div
                key={show}
                className="bg-gray-50 border border-gray-100 rounded-lg p-3 hover:border-gray-300 transition-colors"
              >
                <p className="text-xs font-semibold text-gray-800 mb-2 leading-tight">{show}</p>
                <div className="space-y-0.5">
                  <p className="text-xs text-gray-500">
                    Base rate:{' '}
                    <strong className={baseColor}>{base}%</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    @ quality 70:{' '}
                    <strong className="text-green-700">{adj}%</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    Entry fee:{' '}
                    <strong className="text-gray-700">${wr.fee.toLocaleString()}</strong>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
