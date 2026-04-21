'use client'
/**
 * RoiRanking.tsx — Base ROI Index ranking for all award shows
 * =============================================================================
 * Ranks all tracked shows by base ROI index (prestige × Base Medal Chance
 * Rate % ÷ entry fee), normalized 0–100. No quality adjustment — reflects
 * the baseline return potential of a typical competitive entry.
 *
 * Destination: components/shows/RoiRanking.tsx
 * =============================================================================
 */

import { WIN_RATES, DEADLINES_2026, ENTRY_FEES, computeRoiIndex } from '@/lib/shows-data'

type RoiRow = {
  show: string
  baseMedalChance: number   // % — any metal (Bronze / Silver / Gold)
  prValue: number           // 0–100 prestige score
  feeRange: string
  roiIndex: number          // 0–100 normalized index
}

function roiColor(index: number): string {
  if (index >= 70) return 'text-green-700'
  if (index >= 40) return 'text-amber-700'
  return 'text-gray-500'
}

function roiBg(index: number): string {
  if (index >= 70) return 'bg-green-50 border-green-200'
  if (index >= 40) return 'bg-amber-50 border-amber-200'
  return 'bg-gray-50 border-gray-200'
}

function roiBarColor(index: number): string {
  if (index >= 70) return 'bg-green-500'
  if (index >= 40) return 'bg-amber-400'
  return 'bg-gray-300'
}

export default function RoiRanking() {
  const rows: RoiRow[] = Object.entries(WIN_RATES).map(([show, rates]) => {
    const dl = DEADLINES_2026.find(d => d.show === show)
    const ef = ENTRY_FEES[show]
    return {
      show,
      baseMedalChance: rates.metal,
      prValue: dl?.prValue ?? 30,
      feeRange: ef?.range ?? `~$${rates.fee}`,
      roiIndex: computeRoiIndex(show),
    }
  }).sort((a, b) => b.roiIndex - a.roiIndex)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">Base ROI Index — All Shows</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Ranked by prestige × Base Medal Chance Rate % ÷ entry fee, normalized to 100.
          No quality adjustment — reflects the return potential for a typical competitive entry.
          Open the Budget Planner to factor in your production costs.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4">
        {[
          { color: 'bg-green-500', label: 'Strong ROI (70+)' },
          { color: 'bg-amber-400', label: 'Moderate ROI (40–69)' },
          { color: 'bg-gray-300',  label: 'Lower ROI (<40)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.show} className={`border rounded-lg px-4 py-3 ${roiBg(row.roiIndex)}`}>
            <div className="flex items-center justify-between gap-3">

              {/* Left: rank + show info */}
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-xs text-gray-400 tabular-nums w-5 flex-shrink-0 pt-0.5">
                  #{i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{row.show}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{row.baseMedalChance}%</span> medal chance
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-500">
                      Prestige <span className="font-medium text-gray-700">{row.prValue}</span>/100
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-500">{row.feeRange}</span>
                  </div>
                </div>
              </div>

              {/* Right: index score */}
              <div className="flex-shrink-0 text-right">
                <span className={`text-2xl font-bold tabular-nums ${roiColor(row.roiIndex)}`}>
                  {row.roiIndex}
                </span>
                <p className="text-xs text-gray-400">/ 100</p>
              </div>

            </div>

            {/* Progress bar */}
            <div className="mt-2.5 h-1 bg-white bg-opacity-70 rounded-full overflow-hidden">
              <div
                style={{ width: `${row.roiIndex}%`, transition: 'width 0.3s ease' }}
                className={`h-full rounded-full ${roiBarColor(row.roiIndex)}`}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-5 leading-relaxed">
        ⚠ Index is based on historical medal rates and estimated entry fees. Your category fit and entry quality will shift the effective ROI significantly — see the Directions tab for a quality-adjusted estimate.
      </p>
    </div>
  )
}
