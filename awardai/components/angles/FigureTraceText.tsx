'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FigureTraceText — Arc v2 B2 (angles surface, 18 Aug 2026)
//
// Renders a text field from a persisted `angles` row with the per-figure
// trace state inline (design §3, decision 2 of record):
//   • an UNTRACED figure gets a dotted underline plus a "not found in your
//     material" pill — visible, non-blocking
//   • a DERIVED figure (arithmetic on traced source values) is labeled
//     separately: "derived from your material, not stated in it"
//   • a clean figure carries NO label at all. Never "verified": the diagnostic
//     catches invention only, it cannot catch laundering, so a green check
//     would be a fabricated reassurance.
//
// Matching is plain substring: the trace arrays carry the RAW figure strings
// exactly as generated (generate-angles traceFigures pushes t.raw). No regex
// anywhere — the downlevel build bans /u and \p{...}, and figure strings are
// data, not patterns. Badge colors are dynamically selected (untraced vs
// derived), so they are INLINE STYLES per the purge gotcha (V3-P4), never
// Tailwind classes in a lookup map.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment } from 'react'
import type { ReactNode } from 'react'

type Kind = 'untraced' | 'derived'
type Mark = { start: number; end: number; kind: Kind; text: string }

const MARK_STYLES: Record<Kind, { underline: string; bg: string; fg: string; border: string; label: string }> = {
  untraced: {
    underline: '#b45309',
    bg: '#fffbeb',
    fg: '#b45309',
    border: '#fde68a',
    label: 'not found in your material',
  },
  derived: {
    underline: '#6b7280',
    bg: '#f9fafb',
    fg: '#4b5563',
    border: '#e5e7eb',
    label: 'derived from your material, not stated in it',
  },
}

function collectMarks(text: string, figures: string[], kind: Kind): Mark[] {
  const marks: Mark[] = []
  for (let i = 0; i < figures.length; i++) {
    const f = typeof figures[i] === 'string' ? figures[i].trim() : ''
    if (!f) continue
    let from = 0
    while (from <= text.length - f.length) {
      const idx = text.indexOf(f, from)
      if (idx === -1) break
      marks.push({ start: idx, end: idx + f.length, kind, text: f })
      from = idx + f.length
    }
  }
  return marks
}

export default function FigureTraceText({
  text,
  untraced,
  derived,
  className,
}: {
  text: string
  untraced?: string[]
  derived?: string[]
  className?: string
}) {
  const t = text || ''
  const all = collectMarks(t, Array.isArray(untraced) ? untraced : [], 'untraced')
    .concat(collectMarks(t, Array.isArray(derived) ? derived : [], 'derived'))
  if (all.length === 0) return <span className={className}>{t}</span>

  // Position order, longest first on ties; drop overlaps (first kept wins).
  all.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)))
  const kept: Mark[] = []
  for (let i = 0; i < all.length; i++) {
    const last = kept.length > 0 ? kept[kept.length - 1] : null
    if (!last || all[i].start >= last.end) kept.push(all[i])
  }

  const nodes: ReactNode[] = []
  let pos = 0
  kept.forEach((m, i) => {
    if (m.start > pos) nodes.push(<Fragment key={'t' + i}>{t.slice(pos, m.start)}</Fragment>)
    const s = MARK_STYLES[m.kind]
    nodes.push(
      <Fragment key={'m' + i}>
        <span style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: s.underline, textUnderlineOffset: '3px' }}>{m.text}</span>
        <span style={{ backgroundColor: s.bg, color: s.fg, border: '1px solid ' + s.border, borderRadius: '9999px', padding: '1px 7px', fontSize: '10px', lineHeight: '15px', marginLeft: '4px', display: 'inline-block', verticalAlign: 'middle' }}>{s.label}</span>
      </Fragment>
    )
    pos = m.end
  })
  if (pos < t.length) nodes.push(<Fragment key="tail">{t.slice(pos)}</Fragment>)
  return <span className={className}>{nodes}</span>
}
