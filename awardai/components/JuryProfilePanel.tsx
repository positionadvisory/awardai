'use client'

// ─────────────────────────────────────────────────────────────────────────────
// JuryProfilePanel.tsx
// Jury Intelligence Layer — Phase 1, Session 29
//
// Displays aggregated jury composition intelligence for a given show+category.
// Data source: jury_cells table (no individual names — admin-only).
// Sits below the existing "What wins at [show]" panel in the Entries tab.
//
// Props:
//   cells        — jury_cells rows for this show, across years, pre-fetched
//   category     — the direction's best_category (used for loose matching)
//   showName     — the direction's best_show
//   isOpen       — controlled open state
//   onToggle     — callback to toggle open
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

export type JuryCell = {
  id: number
  show_name: string
  year: number
  category: string
  n_jurors: number | null
  n_repeat_jurors: number | null
  top_region: string | null
  top_region_share: string | null
  region_breakdown: Record<string, number> | null
  president_region: string | null
  president_country: string | null
  president_is_repeat: boolean | null
  philosophy_cluster: string | null  // 'idea-led' | 'impact-led' | 'craft-led' | 'industry-shifting' | null
  winner_regions: string[] | null
  winner_countries: string[] | null
  n_grand_prix: number | null
  n_gold: number | null
}

export type RegionalUplift = {
  region: string
  cells_as_top_juror: number
  cells_with_region_in_winners: number
  pct_when_top_juror: string
  baseline_pct: string
  uplift_points: number
}

type Props = {
  cells: JuryCell[]
  category: string
  showName: string
  isOpen: boolean
  onToggle: () => void
  regionalUplift: RegionalUplift[]
}

const REGION_COLORS: Record<string, string> = {
  'North America':   '#3b82f6',  // blue-500
  'Western Europe':  '#8b5cf6',  // violet-500
  'APAC':            '#10b981',  // emerald-500
  'LATAM':           '#f59e0b',  // amber-500
  'MENA/Africa':     '#ef4444',  // red-500
  'Unknown':         '#9ca3af',  // gray-400
  'Other':           '#9ca3af',
}

const PHILOSOPHY_LABELS: Record<string, { label: string; desc: string }> = {
  'idea-led':          { label: 'Idea-led', desc: 'Rewards the originating idea over execution polish' },
  'impact-led':        { label: 'Impact-led', desc: 'Demands tangible real-world results beyond communications' },
  'craft-led':         { label: 'Craft-led', desc: 'Prioritises technical and executional excellence' },
  'industry-shifting': { label: 'Industry-shifting', desc: 'Looks for work the industry would miss if it didn\'t exist' },
}

/** Loose category matching: does this jury category plausibly match the direction's category? */
function matchesCategory(juryCategory: string, directionCategory: string): boolean {
  if (!directionCategory) return false
  const a = juryCategory.toLowerCase()
  const b = directionCategory.toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
}

/** Generate a plain-language win pattern signal from a cell's data */
function buildWinSignal(cell: JuryCell, uplift: RegionalUplift[]): string | null {
  if (!cell.region_breakdown || !cell.winner_regions?.length) return null

  // Find the dominant juror region
  const breakdown = cell.region_breakdown
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const topRegion = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]
  if (!topRegion) return null

  const topRegionName = topRegion[0]
  const topRegionPct = Math.round((topRegion[1] / total) * 100)

  // Check if winners came from this region
  const winnersList = cell.winner_regions.filter(r => r && r !== 'None' && !r.includes('Not yet'))
  if (!winnersList.length) return null

  const topRegionWon = winnersList.some(r => r.toLowerCase().includes(topRegionName.toLowerCase()))

  // Get the uplift stat for context
  const upliftRow = uplift.find(u => u.region === topRegionName)

  if (topRegionPct >= 40) {
    if (topRegionWon) {
      return `${topRegionName} jurors made up ${topRegionPct}% of this panel${upliftRow ? ` — when ${topRegionName} dominates a jury, ${topRegionName} work appears among winners ${upliftRow.pct_when_top_juror} of the time (vs ${upliftRow.baseline_pct} baseline)` : ''}.`
    } else {
      return `${topRegionName} jurors made up ${topRegionPct}% of this panel, yet winners came primarily from ${winnersList.slice(0, 2).join(' and ')}. Panel composition does not always predict winner origin.`
    }
  }

  // Balanced panel
  const regions = Object.keys(breakdown).filter(r => breakdown[r] > 0)
  if (regions.length >= 4) {
    return `This was a broadly distributed panel across ${regions.length} regions. Winners came from ${winnersList.slice(0, 3).join(', ')}.`
  }

  return null
}

export default function JuryProfilePanel({ cells, category, showName, isOpen, onToggle, regionalUplift }: Props) {
  const currentYear = new Date().getFullYear()

  // Match cells to this direction's category (loose match), then sort by year desc
  const matchedCells = cells
    .filter(c => matchesCategory(c.category, category))
    .sort((a, b) => b.year - a.year)

  // Fall back to all cells for this show if no category match
  const displayCells = matchedCells.length > 0
    ? matchedCells
    : cells.sort((a, b) => b.year - a.year)

  const categoryMatched = matchedCells.length > 0

  // Show years available — up to 3 most recent
  const years = [...new Set(displayCells.map(c => c.year))].slice(0, 3)
  const [selectedYear, setSelectedYear] = useState<number>(years[0] ?? currentYear - 1)

  const activeCell = displayCells.find(c => c.year === selectedYear) ?? null
  const priorCell = displayCells.find(c => c.year === selectedYear - 1) ?? null

  if (displayCells.length === 0) return null

  const winSignal = activeCell ? buildWinSignal(activeCell, regionalUplift) : null

  return (
    <div className="border-b border-gray-100">
      {/* Header / toggle */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">🧑‍⚖️</span>
          <span className="text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors">
            Who judges {showName}
          </span>
          {categoryMatched && category && (
            <span className="text-xs text-gray-300">· {category}</span>
          )}
          {!categoryMatched && (
            <span className="text-xs text-gray-300">· all categories (no exact match)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">
            {years[0] ?? '—'} data
          </span>
          <span className="text-gray-300 text-xs group-hover:text-gray-400 transition-colors">
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-3 bg-gray-50 space-y-4">

          {/* Year tabs */}
          {years.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    selectedYear === y
                      ? 'bg-white border-gray-300 text-gray-700 font-medium'
                      : 'border-gray-200 text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {activeCell ? (
            <>
              {/* Regional composition */}
              {activeCell.region_breakdown && Object.keys(activeCell.region_breakdown).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                    Jury composition {selectedYear}
                    {activeCell.n_jurors && (
                      <span className="font-normal normal-case ml-1">({activeCell.n_jurors} jurors)</span>
                    )}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(activeCell.region_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([region, count]) => {
                        const total = Object.values(activeCell.region_breakdown!).reduce((a, b) => a + b, 0)
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0
                        const color = REGION_COLORS[region] ?? '#9ca3af'

                        // Compute delta vs prior year
                        let delta: number | null = null
                        if (priorCell?.region_breakdown) {
                          const priorTotal = Object.values(priorCell.region_breakdown).reduce((a, b) => a + b, 0)
                          const priorCount = priorCell.region_breakdown[region] ?? 0
                          const priorPct = priorTotal > 0 ? Math.round((priorCount / priorTotal) * 100) : 0
                          delta = pct - priorPct
                        }

                        return (
                          <div key={region} className="flex items-center gap-2">
                            <div className="w-28 shrink-0 text-xs text-gray-600 truncate">{region}</div>
                            <div className="flex-1 bg-gray-200 rounded-sm h-2 overflow-hidden">
                              <div
                                className="h-full rounded-sm transition-all"
                                style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.75 }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 w-8 text-right shrink-0">{pct}%</div>
                            {delta !== null && delta !== 0 && (
                              <div className={`text-xs w-8 shrink-0 ${delta > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                                {delta > 0 ? `+${delta}` : delta}
                              </div>
                            )}
                            {delta === 0 && <div className="w-8 shrink-0" />}
                          </div>
                        )
                      })}
                  </div>
                  {priorCell && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      Δ vs {selectedYear - 1}
                    </p>
                  )}
                </div>
              )}

              {/* President signal */}
              {activeCell.president_region && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Jury president</p>
                  <div className="flex items-start gap-2">
                    <div className="text-sm text-gray-700 leading-relaxed">
                      <span className="font-medium">{activeCell.president_region}</span>
                      {activeCell.president_country && activeCell.president_country !== 'Global' && (
                        <span className="text-gray-400"> · {activeCell.president_country}</span>
                      )}
                      {activeCell.president_is_repeat && (
                        <span className="ml-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded">
                          repeat circuit
                        </span>
                      )}
                    </div>
                  </div>
                  {activeCell.philosophy_cluster && PHILOSOPHY_LABELS[activeCell.philosophy_cluster] && (
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded font-medium mt-0.5">
                        {PHILOSOPHY_LABELS[activeCell.philosophy_cluster].label}
                      </span>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {PHILOSOPHY_LABELS[activeCell.philosophy_cluster].desc}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Historical win pattern */}
              {winSignal && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Historical pattern</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{winSignal}</p>
                  {activeCell.winner_regions && activeCell.winner_regions.filter(r => r !== 'None' && !r.includes('Not yet')).length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedYear} winners by region: {activeCell.winner_regions.filter(r => r !== 'None' && !r.includes('Not yet')).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Repeat juror note */}
              {activeCell.n_repeat_jurors != null && activeCell.n_jurors != null && activeCell.n_jurors > 0 && (
                <div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {activeCell.n_repeat_jurors} of {activeCell.n_jurors} jurors ({Math.round((activeCell.n_repeat_jurors / activeCell.n_jurors) * 100)}%) are on the repeat circuit — they have judged multiple major shows in the past six years.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No jury data available for {selectedYear}.</p>
          )}

          {/* Mandatory caveat */}
          <p className="text-xs text-gray-400 pt-3 border-t border-gray-200 leading-relaxed">
            These signals are based on historical patterns in jury composition and winner data from 2021–2026 across six shows. They are not predictions. Correlation is not causation.
          </p>
        </div>
      )}
    </div>
  )
}
