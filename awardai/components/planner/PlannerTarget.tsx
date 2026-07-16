'use client'
/**
 * PlannerTarget.tsx — Step 1 of the five-step flow ("What you're going for").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 1. The target-title
 * work-back, FILTERED by Step 0's discipline (a media agency picks from
 * MMA / media AOY-class targets; a creative boutique from Pencils / Indie
 * Awards / regional AOY-class). Mirrors the sourced Rethink method (Ledger
 * G6a): set the title, work back to the shows that build toward it.
 *
 * In v1 the target is FRAMING, not a derivation input (lib/planner-engine.ts's
 * derivePlan does not read targetTitle) — it is stored in planner_prefs and
 * displayed as "working back from ...". Options are built from the seeded
 * facets so the list can never drift from what the platform actually covers;
 * work-show targets are filtered by discipline via agencyAdmitsFacet (the same
 * rule the engine's universe filter uses). Free text is always allowed.
 *
 * Controlled/presentational. `compact` renders it inline on the result screen.
 * =============================================================================
 */

import { useMemo } from 'react'
import type { PlannerFacet } from '@/lib/planner-facets'
import type { PlannerAgencyDiscipline } from '@/lib/planner-engine'
import { agencyAdmitsFacet } from '@/lib/planner-display'

type Props = {
  discipline: PlannerAgencyDiscipline
  facets: PlannerFacet[]
  value: string
  onChange: (targetTitle: string) => void
  compact?: boolean
}

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600'
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1'

const FREE_TEXT = '__free_text__'

/** A human target label for a facet, by lane. */
function targetLabel(f: PlannerFacet): string {
  if (f.kind === 'agency_title') return `Agency of the Year — ${f.show_name}`
  if (f.kind === 'people') return `A people award — ${f.show_name}`
  return `A win at ${f.show_name}`
}

export default function PlannerTarget({ discipline, facets, value, onChange, compact }: Props) {
  // Build the option list: agency-title + people lanes are discipline-agnostic
  // (always shown); work shows are filtered by the agency's discipline exactly
  // as the engine filters the universe. Excluded shows (Global SABRE) are
  // dropped — you cannot target something you cannot enter.
  const options = useMemo(() => {
    const admitted = facets.filter(f => !f.excluded && agencyAdmitsFacet(f, discipline))
    // Deterministic order: titles first (the usual work-back target), then
    // people, then work; alphabetical within each lane.
    const order: Record<PlannerFacet['kind'], number> = { agency_title: 0, people: 1, work: 2 }
    return admitted
      .slice()
      .sort((a, b) => {
        const k = order[a.kind] - order[b.kind]
        if (k !== 0) return k
        return a.show_name.localeCompare(b.show_name)
      })
      .map(f => ({ value: f.show_name, label: targetLabel(f) }))
  }, [facets, discipline])

  // The <select> value is the show_name when the current target matches an
  // option, else the free-text sentinel.
  const matchedOption = options.find(o => o.value === value)
  const selectValue = matchedOption ? matchedOption.value : FREE_TEXT

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <label className={labelClass} htmlFor="planner-target">Target to work back from</label>
        <select
          id="planner-target"
          className={selectClass}
          value={selectValue}
          onChange={e => {
            const v = e.target.value
            if (v === FREE_TEXT) {
              // Keep any existing free-text; if the current value was a matched
              // option, clear it so the text box starts empty.
              onChange(matchedOption ? '' : value)
            } else {
              onChange(v)
            }
          }}
        >
          <option value={FREE_TEXT}>Something else (type it)</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {selectValue === FREE_TEXT && (
        <div>
          <label className={labelClass} htmlFor="planner-target-free">Your target, in your words</label>
          <input
            id="planner-target-free"
            type="text"
            className={selectClass}
            value={value}
            placeholder="e.g. Independent Agency of the Year, Spikes"
            onChange={e => onChange(e.target.value)}
          />
        </div>
      )}

      {!compact && (
        <p className="text-xs text-gray-400">
          We work back from the target to the shows that build toward it. Optional: the plan still runs without one.
        </p>
      )}
    </div>
  )
}
