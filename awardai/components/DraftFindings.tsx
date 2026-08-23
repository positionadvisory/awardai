'use client'
// components/DraftFindings.tsx — the findings render, entry-room step one
// (23 Aug 2026, two-week plan Day 2; design: UX/Entry-Room-Mockup-2026-08-23.html,
// approved by Ben 23 Aug).
//
// Renders what the fabrication guard actually knows, where today the user sees
// only a generic red banner: the blocked findings[] a 422 carries (section,
// issue, detail), the hedged-figures list the drafters now return on BOTH 200
// and 422 (source figures carrying their own caveats), and the NOFACTS soft
// notice ("Validate agency facts for a stronger draft."). Data in, layout
// thin: this card is the first brick of the entry-room right rail and must
// drop into either the current page or the entry room unchanged.
//
// Icon colors are INLINE STYLES by rule: dynamically-selected Tailwind classes
// in a lookup map get purged from the served CSS (V3-P4 gotcha).

import type { ReactNode } from 'react'

export type DraftFinding = { section: string; issue: string; detail: string }
export type HedgedFigure = { val: string; caveat: string }

// Human labels for the guard's finding types. Fallback: the raw type string,
// so a future guard type still renders rather than blanking a row.
const ISSUE_LABELS: Record<string, string> = {
  UNSUPPORTED_NUMBER: 'Number not found in your materials',
  UNSUPPORTED_SOURCING: 'Source or methodology not named in your materials',
  POSSIBLE_MISATTRIBUTION: 'Figure attached to the wrong channel or context',
  STRIPPED_CAVEAT: 'Source caveat dropped',
}

function sectionLabel(key: string): string {
  const s = (key || '').replace(/_/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Section'
}

function Row({ icon, color, children, tag }: { icon: string; color: string; children: ReactNode; tag?: string }) {
  return (
    <div className="flex gap-2.5 py-2 border-t border-gray-100 first:border-t-0 text-sm leading-relaxed text-gray-700">
      <span className="flex-none w-5 text-center" style={{ color }}>{icon}</span>
      <div>
        {children}
        {tag && <span className="block text-xs text-gray-400 mt-0.5">{tag}</span>}
      </div>
    </div>
  )
}

export default function DraftFindings({
  blocked,
  findings = [],
  hedgedFigures = [],
  notice = null,
}: {
  blocked: boolean
  findings?: DraftFinding[]
  hedgedFigures?: HedgedFigure[]
  notice?: string | null
}) {
  const hasContent = findings.length > 0 || hedgedFigures.length > 0 || Boolean(notice)
  if (!hasContent) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
      <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">Findings</h3>
      {blocked && findings.map((f, i) => (
        <Row key={`f-${i}`} icon="✕" color="#991b1b" tag={sectionLabel(f.section)}>
          <span className="font-medium text-gray-900">{ISSUE_LABELS[f.issue] ?? f.issue}: </span>
          {f.detail}
        </Row>
      ))}
      {notice && (
        <Row icon="⚠" color="#b45309" tag="Agency facts">
          {notice} This draft was built from your uploaded materials only; missing agency figures are marked as placeholders to fill in.
        </Row>
      )}
      {hedgedFigures.map((h, i) => (
        <Row key={`h-${i}`} icon="⚠" color="#b45309" tag="Unconfirmed at source">
          The figure <span className="font-medium text-gray-900">{h.val}</span> carries the source&apos;s own caveat (&quot;{h.caveat}&quot;). The jury will accept it hedged; do not firm it up.
        </Row>
      ))}
      {!blocked && (
        <Row icon="✓" color="#166534">
          {hedgedFigures.length > 0
            ? 'Every other figure in this draft traces to your materials.'
            : 'Every figure in this draft traces to your materials.'}
        </Row>
      )}
      {blocked && (
        <p className="text-xs text-gray-400 mt-2">The draft was not saved. Add the missing evidence to your materials, or regenerate.</p>
      )}
    </div>
  )
}
