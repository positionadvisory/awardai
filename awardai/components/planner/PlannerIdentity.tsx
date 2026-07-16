'use client'
/**
 * PlannerIdentity.tsx — Step 0 of the five-step flow ("Who you are").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 0. Pre-filled from
 * agency_profiles (org_type + agency_city/office_locations), always
 * user-confirmable. Captures the NEW first-class input Part 2 was missing:
 * discipline (media / creative / PR / mobile-performance / full-service),
 * stored user-owned in planner_prefs. Suggested maturity tier is DERIVED from
 * project history and shown as a suggestion — never auto-set silently (spec).
 *
 * Controlled/presentational: no fetch, no derivation. The page owns the input
 * state and the derivation (lib/planner-engine.ts). A `compact` layout lets
 * this same control render inline on the result screen (edit-in-place).
 * =============================================================================
 */

import type {
  PlannerAgencyDiscipline,
  PlannerMaturity,
  PlannerOrgType,
} from '@/lib/planner-engine'

type IdentityValue = {
  discipline: PlannerAgencyDiscipline
  orgType: PlannerOrgType
  region: string
  maturity: PlannerMaturity
}

type Props = {
  value: IdentityValue
  onChange: (patch: Partial<IdentityValue>) => void
  /** Project-history-derived suggestion; shown as a hint, never applied silently. */
  suggestedMaturity?: PlannerMaturity | null
  compact?: boolean
}

const DISCIPLINE_OPTIONS: { value: PlannerAgencyDiscipline; label: string }[] = [
  { value: 'creative', label: 'Creative' },
  { value: 'media', label: 'Media' },
  { value: 'PR', label: 'PR / Communications' },
  { value: 'mobile_performance', label: 'Mobile / Performance' },
  { value: 'full_service', label: 'Full-service (all disciplines)' },
]

const ORG_TYPE_OPTIONS: { value: PlannerOrgType; label: string }[] = [
  { value: 'agency', label: 'Agency' },
  { value: 'media_agency', label: 'Media agency' },
  { value: 'production_company', label: 'Production company' },
  { value: 'consultancy', label: 'Consultancy' },
  { value: 'brand', label: 'In-house brand team' },
]

const MATURITY_OPTIONS: { value: PlannerMaturity; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600'
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1'

export default function PlannerIdentity({ value, onChange, suggestedMaturity, compact }: Props) {
  return (
    <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
      <div>
        <label className={labelClass} htmlFor="planner-discipline">Discipline</label>
        <select
          id="planner-discipline"
          className={selectClass}
          value={value.discipline}
          onChange={e => onChange({ discipline: e.target.value as PlannerAgencyDiscipline })}
        >
          {DISCIPLINE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {!compact && (
          <p className="text-xs text-gray-400 mt-1">
            Filters the show universe. Full-service sees every discipline.
          </p>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="planner-orgtype">Organization type</label>
        <select
          id="planner-orgtype"
          className={selectClass}
          value={value.orgType}
          onChange={e => onChange({ orgType: e.target.value as PlannerOrgType })}
        >
          {ORG_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {!compact && value.orgType === 'brand' && (
          <p className="text-xs text-gray-400 mt-1">
            Agency-title awards are hidden by default for in-house teams. You keep every axis: change it anytime.
          </p>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="planner-region">Home market / region</label>
        <input
          id="planner-region"
          type="text"
          className={selectClass}
          value={value.region}
          placeholder="e.g. Singapore, APAC"
          onChange={e => onChange({ region: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="planner-maturity">Awards maturity</label>
        <select
          id="planner-maturity"
          className={selectClass}
          value={value.maturity}
          onChange={e => onChange({ maturity: e.target.value as PlannerMaturity })}
        >
          {MATURITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {!compact && suggestedMaturity && suggestedMaturity !== value.maturity && (
          <button
            type="button"
            className="text-xs text-green-700 mt-1 underline hover:text-green-800"
            onClick={() => onChange({ maturity: suggestedMaturity })}
          >
            Suggested from your project history: {suggestedMaturity}. Use it?
          </button>
        )}
      </div>
    </div>
  )
}
