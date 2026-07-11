'use client'
// components/EvalSummaryBar.tsx — Workbench P2 (S138)
//
// Sticky summary for one AOY entry: overall score + verdict + per-section score
// chips that jump-scroll to their card. Source-agnostic and presentational; the
// parent maps the stored evaluation into these props (Chunk 2) and owns the
// scroll target + the re-eval action (both optional here).
//
// Sticky via CSS `sticky` within the entry card's scroll container, NOT
// position:fixed (brief). A `max-w ... flex` wrapper always carries w-full and
// any list uses grid-cols-1 (iOS gotchas).

import { useState } from 'react'

export type SummarySection = {
  key: string
  label: string
  score?: number | null
}

type Props = {
  overallScore?: number | null
  verdict?: string | null
  sections: SummarySection[]
  strengths?: string[]
  // Gaps that could not be attributed to a specific section — surfaced here so
  // they are never dropped (brief). Section-tied gaps live on their card.
  unattributedGaps?: string[]
  onJumpToSection?: (key: string) => void
  onReRunEval?: () => void
  reRunLabel?: string
  reRunning?: boolean
  // P3 (S146) directional re-score surface. All DIRECTIONAL: none of these touch the
  // official overallScore/section scores above.
  indicativeTotal?: number | null            // weighted total with fresh rescores merged in
  rescoredCount?: number                      // # sections carrying a directional rescore
  deltaByKey?: Record<string, number>         // per-section (rescore - official), signed
}

// green 7+, amber 5-6, red <5 (brief). Tailwind classes shared with the rest of
// the app, so they survive the purge (no arbitrary values here).
function scoreClasses(score?: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-500 ring-gray-200'
  if (score >= 7) return 'bg-green-100 text-green-800 ring-green-200'
  if (score >= 5) return 'bg-amber-100 text-amber-800 ring-amber-200'
  return 'bg-red-100 text-red-700 ring-red-200'
}

function firstSentence(text?: string | null): string {
  if (!text) return ''
  const m = text.match(/^.*?[.!?](?:\s|$)/)
  return (m ? m[0] : text).trim()
}

export default function EvalSummaryBar({
  overallScore, verdict, sections, strengths, unattributedGaps,
  onJumpToSection, onReRunEval, reRunLabel = 'Re-run Jury Eval', reRunning,
  indicativeTotal, rescoredCount, deltaByKey,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!verdict || (strengths?.length ?? 0) > 0 || (unattributedGaps?.length ?? 0) > 0

  return (
    <div className="sticky top-0 z-20 -mx-5 mb-1 border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Overall</span>
          <span className="text-lg font-semibold tabular-nums text-gray-900">
            {overallScore != null ? overallScore.toFixed(1) : '—'}
          </span>
          <span className="text-xs text-gray-400">/ 10</span>
        </div>

        {indicativeTotal != null && (
          <div className="flex items-baseline gap-1.5" title="Weighted total with your directional re-checks merged in. Re-run the full jury eval for an official score.">
            <span className="text-xs font-medium uppercase tracking-wide text-amber-600">Indicative</span>
            <span className="text-lg font-semibold tabular-nums text-amber-700">{indicativeTotal.toFixed(1)}</span>
            <span className="text-xs text-gray-400">directional</span>
          </div>
        )}

        <p className="min-w-0 flex-1 truncate text-sm text-gray-600" title={verdict ?? undefined}>
          {firstSentence(verdict)}
        </p>

        {onReRunEval && (
          <button
            type="button"
            onClick={onReRunEval}
            disabled={reRunning}
            className="flex-shrink-0 rounded bg-green-800 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {reRunning ? 'Running…' : reRunLabel}
          </button>
        )}

        {hasDetail && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 text-xs text-green-700 hover:text-green-600 transition-colors"
          >
            {expanded ? 'Hide detail ↑' : 'Detail ↓'}
          </button>
        )}
      </div>

      {sections.length > 0 && (
        <div className="mt-2 flex w-full flex-wrap gap-1.5">
          {sections.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => onJumpToSection?.(s.key)}
              disabled={!onJumpToSection}
              title={s.label}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ${scoreClasses(s.score)} ${onJumpToSection ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
            >
              <span className="max-w-[10rem] truncate font-medium">{s.label}</span>
              <span className="tabular-nums">{s.score != null ? s.score : '—'}</span>
              {deltaByKey && typeof deltaByKey[s.key] === 'number' && deltaByKey[s.key] !== 0 && (
                <span className="tabular-nums opacity-70" title="Directional change from your re-check">
                  {deltaByKey[s.key] > 0 ? `▲${deltaByKey[s.key]}` : `▼${Math.abs(deltaByKey[s.key])}`}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {(rescoredCount ?? 0) >= 3 && (
        <p className="mt-2 w-full text-xs text-amber-600">
          Several sections have changed. Run the full jury eval for an official score.
        </p>
      )}

      {expanded && hasDetail && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3">
          {verdict && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Verdict</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{verdict}</p>
            </div>
          )}
          {(strengths?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Strengths</p>
              <ul className="mt-1 grid grid-cols-1 gap-1">
                {strengths!.map((s, i) => (
                  <li key={i} className="text-sm leading-snug text-gray-700">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {(unattributedGaps?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Other gaps</p>
              <ul className="mt-1 grid grid-cols-1 gap-1">
                {unattributedGaps!.map((g, i) => (
                  <li key={i} className="text-sm leading-snug text-gray-700">• {g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
