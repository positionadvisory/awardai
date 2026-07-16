'use client'
/**
 * PlannerIdentity.tsx — Step 0 of the five-step flow ("Who you are").
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §Step 0. Pre-filled from
 * agency_profiles (org_type + agency_city/office_locations), always
 * user-confirmable.
 *
 * P2.1 #6: "Home market / region" is now a SELECT over the PlannerRegion enum,
 * not a free-text box. The region gate in derivePlan is only reliable if the
 * region is one of the known buckets; the page seeds the default by running the
 * derived city through normalizeUserRegion (lib/planner-facets.ts), and the user
 * confirms/changes it here. A free-text city could not be matched deterministically
 * against show regions — that was the mechanism behind the wrong-market bug.
 *
 * Controlled/presentational: no fetch, no derivation. The page owns the input
 * state and the derivation. A `compact` layout renders inline on the result screen.
 * =============================================================================
 */

import type {
  PlannerAgencyDiscipline,
  PlannerMaturity,
  PlannerOrgType,
} from '@/lib/planner-engine'
import type { PlannerRegion } from '@/lib/planner-facets'

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

/** The PlannerRegion enum, with plain-language labels for the picker (P2.1 #6). */
const REGION_OPTIONS: { value: PlannerRegion; label: string }[] = [
  { value: 'APAC', label: 'Asia-Pacific (APAC)' },
  { value: 'China', label: 'China' },
  { value: 'Australia', label: 'Australia / New Zealand' },
  { value: 'Europe', label: 'Europe (incl. UK)' },
  { value: 'MENA', label: 'Middle East & Africa (MENA)' },
  { value: 'North America', label: 'North America (US & Canada)' },
  { value: 'Global', label: 'Global / multi-market' },
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
  // The region value should be one of the enum options; if a legacy free-text
  // value slips through, the select falls back to showing 'Global'.
  const regionValue = REGION_OPTIONS.some(o => o.value === value.region) ? value.region : 'Global'

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
            Leans the plan toward your discipline&apos;s shows. Full-service leans on none.
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
        <select
          id="planner-region"
          className={selectClass}
          value={regionValue}
          onChange={e => onChange({ region: e.target.value })}
        >
          {REGION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {!compact && (
          <p className="text-xs text-gray-400 mt-1">
            Filters shows to the ones you can actually enter. Global shows always show.
          </p>
        )}
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
