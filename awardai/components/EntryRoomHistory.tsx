'use client'
// components/EntryRoomHistory.tsx — Entry Room Slice 1 (24 Aug 2026, dispatched
// from the QB planning thread). Version selector + read-only historical-
// generation surface for the "entry room" layout. Design contract:
// Shortlist App/UX/Entry-Room-Mockup-2026-08-23.html.
//
// PRESENTATIONAL ONLY, mirrors the EvalBreakdown convention (no fetches, no
// Supabase, no page state). Everything page-coupled — resolved field text,
// per-generation evaluations, handlers — arrives through props. Deliberately
// defines its own minimal structural types rather than importing the page's
// richer EntryDraft/Evaluation types, same reason EvalBreakdown does: keeps
// this component decoupled from app/projects/[id]/page.tsx's shape.
//
// Scoping this was built against (24 Aug 2026 QB pass, re-verified against
// the mirror + migrations, not re-derived here):
//   - All three drafters INSERT with draft_generation = max+1 per direction
//     ("never delete, always append"). Version history already exists in
//     entry_drafts.
//   - get_project_entry_drafts already returns EVERY generation. Older
//     generations come back with text collapsed to the user's finalized
//     choice (selected variant / custom_text folded into version_a) and
//     alternates/chat nulled — render old versions read-only from that
//     shape; it is the RPC's designed contract, not missing data.
//   - evaluations attach per entry_draft row, so a prior generation has an
//     eval ONLY if the user actually ran one on it at the time.

import React from 'react'
import { scoreColor, scoreBg } from './EvalBreakdown'
import { DiffProse, type DiffOp } from './EntryRoomChanges'

export type MinimalDraftField = {
  id: number
  field_key: string
  field_label: string
  section_weight?: number | null
  text: string // already resolved by the page's resolveFieldContent
}

export type MinimalEvaluation = {
  id: number
  overall_score: number
  scores?: Record<string, number> | null
  created_at?: string
} | null | undefined

// ── version selector ────────────────────────────────────────────────────────
// One state per direction, owned by the page (viewingGen[dirId]). Default
// (activeGen === maxGen) renders labeled "current"; anything else is a
// generation lookup into historyByGen.

type VersionSelectorProps = {
  generations: number[] // all generations that exist for this direction, any order
  maxGen: number
  activeGen: number // the page's viewingGen[dirId] ?? maxGen
  onSelect: (gen: number) => void
}

export function VersionSelector({ generations, maxGen, activeGen, onSelect }: VersionSelectorProps) {
  if (generations.length <= 1) return null
  const sorted = [...generations].sort((a, b) => b - a)
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
      <span className="text-gray-400">Version</span>
      <select
        value={activeGen}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 bg-white"
      >
        {sorted.map(g => (
          <option key={g} value={g}>{g === maxGen ? `v${g} (current)` : `v${g}`}</option>
        ))}
      </select>
    </label>
  )
}

// ── read-only banner ─────────────────────────────────────────────────────────

export function HistoricalViewBanner({ gen, totalGens, onReturn }: { gen: number; totalGens: number; onReturn: () => void }) {
  return (
    <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-amber-800">
        Viewing v{gen} of {totalGens} — read-only
      </p>
      <button
        type="button"
        onClick={onReturn}
        className="text-xs font-medium text-amber-800 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
      >
        ← Return to current
      </button>
    </div>
  )
}

// ── read-only field cards (no refine, no variant picker, no editing) ────────

export function ReadOnlyVersionFields({ fields, sectionScores, diffByKey, inlineChangesOn }: {
  fields: MinimalDraftField[]
  sectionScores?: Record<string, number | null>
  // Entry Room Slice 2 (24 Aug 2026): per-field_key word-level diff against the
  // nearest earlier generation to the one being viewed here, and the
  // inline-changes toggle state. Both optional and additive -- omitting them
  // renders exactly as before (plain resolved text), so this stays safe for
  // any other caller of this component.
  diffByKey?: Record<string, DiffOp[] | null>
  inlineChangesOn?: boolean
}) {
  if (fields.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
        No sections recorded for this version.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {fields.map(f => {
        const score = sectionScores?.[f.field_key] ?? null
        return (
          <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h4 className="text-sm font-medium text-gray-900 flex-1 min-w-0">{f.field_label}</h4>
              {typeof f.section_weight === 'number' && (
                <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 flex-shrink-0">Weight {f.section_weight}%</span>
              )}
              {score != null && (
                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 border flex-shrink-0 ${scoreBg(score)} ${scoreColor(score)}`}>{score}/10</span>
              )}
            </div>
            {f.text ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                <DiffProse text={f.text} diff={diffByKey?.[f.field_key || f.field_label || String(f.id)] ?? null} inlineOn={!!inlineChangesOn} />
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Empty</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── exhaustive delta-state (never render an empty state as clean) ──────────
// Four states, not three: a version can be missing an eval, or be first-ever
// (no prior generation could exist), or have an eval with nothing earlier
// evaluated to diff against, or have a real prior — each gets its own copy so
// the rail never falls through to a blank chip that reads as "no change".

export type VersionDeltaState =
  | 'evaluated'
  | 'prior-not-evaluated'
  | 'this-version-not-evaluated'
  | 'no-prior-generation'

export const VERSION_DELTA_MESSAGE: Record<VersionDeltaState, string> = {
  'evaluated': '',
  'prior-not-evaluated': 'No earlier evaluated version to compare against.',
  'this-version-not-evaluated': 'This version has not been evaluated.',
  'no-prior-generation': 'This is the first draft — nothing earlier to compare against.',
}

export function computeVersionDeltaState(params: {
  gen: number
  thisEval: MinimalEvaluation
  priorEvaluatedEval: MinimalEvaluation
}): { state: VersionDeltaState; delta: number | null } {
  const { gen, thisEval, priorEvaluatedEval } = params
  if (!thisEval) return { state: 'this-version-not-evaluated', delta: null }
  if (gen <= 1) return { state: 'no-prior-generation', delta: null }
  if (!priorEvaluatedEval) return { state: 'prior-not-evaluated', delta: null }
  const delta = Math.round((thisEval.overall_score - priorEvaluatedEval.overall_score) * 10) / 10
  return { state: 'evaluated', delta }
}

// ── delta chip (rail) ───────────────────────────────────────────────────────

export function VersionDeltaChip({ state, delta, priorGen }: { state: VersionDeltaState; delta: number | null; priorGen?: number | null }) {
  if (state === 'evaluated' && delta != null) {
    if (delta === 0) {
      return <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">No change{priorGen ? ` vs v${priorGen}` : ''}</span>
    }
    return (
      <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${delta > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {delta > 0 ? `+${delta}` : `${delta}`}{priorGen ? ` vs v${priorGen}` : ''}
      </span>
    )
  }
  const msg = VERSION_DELTA_MESSAGE[state]
  if (!msg) return null
  return <span className="text-xs text-gray-400">{msg}</span>
}
