'use client'
/**
 * PlannerCampaignPicker.tsx — Planner v3 Step 1, the sorted campaign picker.
 * =============================================================================
 * Planner-v3-SPEC-campaign-driven-2026-07-16.md "Input model and flow" §1 +
 * "Decisions locked": ONE sorted picker with preselection. No separate
 * auto-qualification machinery — the org's projects are listed sorted by latest
 * eval score, the >= threshold ones start selected, manual add/remove on top.
 * The sparse case is just an empty preselection, handled by the page (zero-state
 * teaser), not here.
 *
 * The score badge ALWAYS carries its context: "7.4 vs MMA Smarties APAC". Copy
 * calls it "entry readiness", never "campaign quality" (spec). Unscored
 * campaigns are selectable manually but read "Not yet scored".
 *
 * Controlled/presentational: no fetch, no derivation. The controller
 * (PlannerV3) owns the options list and the selection set.
 * =============================================================================
 */

import type { CampaignOption } from '@/lib/planner-v3-data'

type Props = {
  options: CampaignOption[]
  /** project_ids currently selected. */
  selected: Set<number>
  onToggle: (projectId: number) => void
  qualifyThreshold: number
}

function ScoreBadge({ option }: { option: CampaignOption }) {
  if (option.entry_readiness === null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-gray-200 bg-gray-50 text-gray-500">
        Not yet scored
      </span>
    )
  }
  const score = option.entry_readiness.toFixed(1)
  const ctx = option.scored_show ? ` vs ${option.scored_show}` : ''
  const strong = option.entry_readiness >= 7
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
        strong
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
      title="Entry readiness: the campaign's latest jury eval score, against the show it was scored on. Not a measure of campaign quality."
    >
      {score}
      <span className="font-normal text-gray-500">/10{ctx}</span>
    </span>
  )
}

export default function PlannerCampaignPicker({ options, selected, onToggle, qualifyThreshold }: Props) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No campaigns found for your organization yet. Create a project and run a jury eval to build a plan.
      </p>
    )
  }

  const selectedCount = options.filter(o => selected.has(o.project_id)).length

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Sorted by entry readiness. Campaigns scoring {qualifyThreshold} or above start selected. Add or remove any
        campaign: the plan is built only from what is selected.
      </p>

      <ul className="space-y-2">
        {options.map(o => {
          const isSelected = selected.has(o.project_id)
          const dirCount = o.directions.length
          return (
            <li key={o.project_id}>
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelected ? 'border-green-700 bg-green-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                  checked={isSelected}
                  onChange={() => onToggle(o.project_id)}
                />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm truncate">{o.campaign_name}</span>
                    <ScoreBadge option={o} />
                    {o.qualifies && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-800 text-white font-medium">
                        Preselected
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {dirCount} direction{dirCount === 1 ? '' : 's'}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-gray-500 mt-3">
        <span className="font-semibold text-gray-700">{selectedCount}</span> campaign
        {selectedCount === 1 ? '' : 's'} selected.
      </p>
    </div>
  )
}
