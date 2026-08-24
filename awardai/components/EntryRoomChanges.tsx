'use client'
// components/EntryRoomChanges.tsx — Entry Room Slice 2 (24 Aug 2026).
//
// "What changed" panel + inline word-level diff for the entry room. Supersedes
// DraftChangeSummary.tsx (17 Aug 2026, Joanne Fu call): same "computed diff
// off stored generations" floor, now generation-aware (works for the CURRENT
// view and any HISTORICAL version, not just current-vs-previous), with an
// inline-changes toggle that drives word-level ins/del marks inside the
// section prose. DraftChangeSummary.tsx is deleted in this same commit; its
// one call site (app/projects/[id]/page.tsx, top of sxsEditSurface) is
// replaced with WhatChangedPanel below.
//
// Design contract: Shortlist App/UX/Entry-Room-Mockup-2026-08-23.html
// ("What changed in vN" heading + "Inline changes: ON" toggle + <ins>/<del>
// marks in section prose).
//
// SOURCE OF DATA: entry_drafts rows already loaded by get_project_entry_drafts
// (the page's `entries` state). For an older generation, that RPC collapses
// the text to the user's finalized choice (selected variant / custom_text) —
// exactly what resolveFieldContent() already returns — so this is the correct
// diff base and survives reload with no separate fetch. No model call, no
// schema change, no new data. Diff is 100% client-side.
//
// No model-written change-summary text exists anywhere (checked: not in the
// live generation response body, not persisted on entry_drafts or elsewhere).
// The computed diff below is therefore the whole surface, not a fallback —
// adding persistence for a model summary would be a drafter-layer change,
// out of scope for this slice (candidate for slice 2b).
//
// PRESENTATIONAL ONLY: no fetches, no Supabase, no page state — mirrors the
// EntryRoomHistory.tsx convention. Diff computation (computeSectionChanges,
// diffTokenSequences) is pure and side-effect free, safe to call from a
// useMemo that React StrictMode double-invokes.

import React from 'react'

export type WhatChangedSection = {
  key: string
  label: string
  text: string
}

export type ChangeStatus = 'new' | 'removed' | 'rewritten' | 'unchanged'

export type DiffOp = { type: 'eq' | 'ins' | 'del'; value: string }

export type SectionChangeRow = {
  key: string
  label: string
  status: ChangeStatus
  wordDelta: number
  changedPct: number // 0-100: share of the larger text not shared with the other
  diff: DiffOp[] | null // token-level diff for inline rendering; null = unchanged, or text too large to diff token-by-token (badge-only fallback)
}

function toWords(text: string): string[] {
  const t = (text || '').trim()
  if (!t) return []
  return t.split(/\s+/).filter(Boolean)
}

function normalize(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

// Word+whitespace tokenizer for the inline diff: splitting on a capturing
// \s+ group keeps whitespace runs as their own tokens, so a diff reconstructed
// by concatenation reproduces the original spacing exactly. Plain \s+ (no /u
// flag, no \p{} escapes -- downlevel build constraint).
function tokenize(text: string): string[] {
  const t = text || ''
  if (!t) return []
  const parts = t.split(/(\s+)/)
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') out.push(parts[i])
  }
  return out
}

// Multiset word overlap: a cheap, order-insensitive estimate of how much of a
// section was rewritten. Used for the badge text; independent of the
// token-level diff below. Index loops only, no Set/Map iteration.
function changedShare(a: string[], b: string[]): number {
  const larger = Math.max(a.length, b.length)
  if (larger === 0) return 0
  const counts: Record<string, number> = {}
  for (let i = 0; i < a.length; i++) {
    const w = a[i].toLowerCase()
    counts[w] = (counts[w] || 0) + 1
  }
  let common = 0
  for (let i = 0; i < b.length; i++) {
    const w = b[i].toLowerCase()
    if ((counts[w] || 0) > 0) {
      counts[w] -= 1
      common += 1
    }
  }
  return Math.round((1 - common / larger) * 100)
}

// Guards the O(n*m) LCS table. Checked against real org 2 AOY data (24 Aug
// 2026): the longest section seen was ~1,416 words (~2,830 word+space
// tokens), so the guard needs real headroom, not just "a paragraph or two."
// 4000x4000 Uint16Array cells (LCS lengths never exceed min(n,m) <= 4000, so
// 16 bits is enough) is ~32MB, and the page only ever runs this for the ONE
// expanded/focused direction (see computeTokenDiff below) -- not every
// multi-generation direction on the page. Above the guard, diff returns
// null and callers fall back to plain text -- the badge (changedShare-based)
// still renders regardless, so the floor never breaks.
const MAX_DIFF_TOKENS = 4000

// Classic LCS word diff: DP table + backtrack. Index loops only -- no
// [...new Set()] spread, no for...of over Set/Map, no /u regex (downlevel
// build target constraints).
export function diffTokenSequences(prevTokens: string[], curTokens: string[]): DiffOp[] | null {
  const n = prevTokens.length
  const m = curTokens.length
  if (n > MAX_DIFF_TOKENS || m > MAX_DIFF_TOKENS) return null
  if (n === 0 && m === 0) return []

  const dp: Uint16Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (prevTokens[i] === curTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        const up = dp[i + 1][j]
        const left = dp[i][j + 1]
        dp[i][j] = up >= left ? up : left
      }
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (prevTokens[i] === curTokens[j]) {
      ops.push({ type: 'eq', value: curTokens[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', value: prevTokens[i] })
      i++
    } else {
      ops.push({ type: 'ins', value: curTokens[j] })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'del', value: prevTokens[i] })
    i++
  }
  while (j < m) {
    ops.push({ type: 'ins', value: curTokens[j] })
    j++
  }

  // Merge adjacent same-type ops into one token for cleaner rendering.
  const merged: DiffOp[] = []
  for (let k = 0; k < ops.length; k++) {
    const last = merged[merged.length - 1]
    if (last && last.type === ops[k].type) {
      last.value += ops[k].value
    } else {
      merged.push({ type: ops[k].type, value: ops[k].value })
    }
  }
  return merged
}

// Dynamically-selected colors MUST be inline styles: Tailwind purges classes
// that only appear inside a lookup map (V3-P4 gotcha, carried over from
// DraftChangeSummary).
function badgeStyle(status: ChangeStatus): { backgroundColor: string; color: string } {
  if (status === 'new') return { backgroundColor: '#dcfce7', color: '#166534' }
  if (status === 'removed') return { backgroundColor: '#fee2e2', color: '#991b1b' }
  if (status === 'rewritten') return { backgroundColor: '#fef9c3', color: '#854d0e' }
  return { backgroundColor: '#f3f4f6', color: '#6b7280' }
}

function badgeText(status: ChangeStatus): string {
  if (status === 'new') return 'New section'
  if (status === 'removed') return 'Removed'
  if (status === 'rewritten') return 'Rewritten'
  return 'Unchanged'
}

// Pure -- safe to call from a useMemo. Computes ONLY the one generation pair
// handed to it; callers are responsible for picking that one pair (the page
// memoizes per-direction on [entries, viewingGen] so this only ever runs for
// the currently-viewed pair per direction, never for every historical pair).
export function computeSectionChanges(
  current: WhatChangedSection[],
  previous: WhatChangedSection[],
  // Entry Room Slice 2: the page computes this for every multi-generation
  // direction's active pair (cheap: status/wordDelta/changedPct are all
  // O(n)), but the O(n*m) token-level diff is only worth paying for the
  // direction actually on screen. Default true so any other caller gets the
  // full behaviour unless it opts out.
  computeTokenDiff: boolean = true,
): SectionChangeRow[] {
  const prevByKey: Record<string, WhatChangedSection> = {}
  for (let i = 0; i < previous.length; i++) prevByKey[previous[i].key] = previous[i]
  const matchedPrevKeys: Record<string, boolean> = {}

  const rows: SectionChangeRow[] = []
  for (let i = 0; i < current.length; i++) {
    const cur = current[i]
    const prev = prevByKey[cur.key]
    if (!prev) {
      rows.push({
        key: cur.key,
        label: cur.label,
        status: 'new',
        wordDelta: toWords(cur.text).length,
        changedPct: 100,
        diff: computeTokenDiff ? diffTokenSequences([], tokenize(cur.text)) : null,
      })
      continue
    }
    matchedPrevKeys[cur.key] = true
    if (normalize(cur.text) === normalize(prev.text)) {
      rows.push({ key: cur.key, label: cur.label, status: 'unchanged', wordDelta: 0, changedPct: 0, diff: null })
      continue
    }
    const curWords = toWords(cur.text)
    const prevWords = toWords(prev.text)
    rows.push({
      key: cur.key,
      label: cur.label,
      status: 'rewritten',
      wordDelta: curWords.length - prevWords.length,
      changedPct: changedShare(prevWords, curWords),
      diff: computeTokenDiff ? diffTokenSequences(tokenize(prev.text), tokenize(cur.text)) : null,
    })
  }
  for (let i = 0; i < previous.length; i++) {
    const prev = previous[i]
    if (!matchedPrevKeys[prev.key]) {
      rows.push({ key: prev.key, label: prev.label, status: 'removed', wordDelta: -toWords(prev.text).length, changedPct: 100, diff: null })
    }
  }
  return rows
}

// -- "What changed" panel ----------------------------------------------------
// Renders whenever the direction has >=2 generations (caller decides that --
// pass rows=[] to render nothing). Works identically for the current view
// (generation = maxGen) and a historical view (generation = the version being
// viewed, previousGeneration = the nearest earlier generation to THAT
// version, not necessarily maxGen-1).

export function WhatChangedPanel({
  generation,
  previousGeneration,
  rows,
  inlineOn,
  onToggleInline,
}: {
  generation: number
  previousGeneration: number
  rows: SectionChangeRow[]
  inlineOn: boolean
  onToggleInline: () => void
}) {
  if (rows.length === 0) return null

  const changedRows = rows.filter(r => r.status !== 'unchanged')
  const totalDelta = rows.reduce((acc, r) => acc + r.wordDelta, 0)

  return (
    <div className="w-full px-5 py-4 border-b border-gray-200 bg-amber-50">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          What changed in v{generation}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-gray-500 tabular-nums">
            v{generation} vs v{previousGeneration}
            {totalDelta !== 0 ? ` · ${totalDelta > 0 ? '+' : ''}${totalDelta} words overall` : ''}
          </p>
          <button
            type="button"
            onClick={onToggleInline}
            className="text-xs font-semibold text-green-800 hover:text-green-900"
          >
            Inline changes: {inlineOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      {changedRows.length === 0 ? (
        <p className="text-xs text-gray-500">No text changes from v{previousGeneration}.</p>
      ) : (
        <ul className="w-full space-y-1.5">
          {changedRows.map(r => (
            <li key={r.key} className="flex items-baseline gap-2 flex-wrap">
              <span
                className="inline-block text-xs font-medium rounded px-1.5 py-0.5 flex-shrink-0"
                style={badgeStyle(r.status)}
              >
                {badgeText(r.status)}
              </span>
              <span className="text-xs font-medium text-gray-700">{r.label}</span>
              {r.status === 'rewritten' && (
                <span className="text-xs text-gray-400 tabular-nums">
                  ~{r.changedPct}% of the text changed
                  {r.wordDelta !== 0 ? `, ${r.wordDelta > 0 ? '+' : ''}${r.wordDelta} words` : ''}
                </span>
              )}
              {(r.status === 'new' || r.status === 'removed') && r.wordDelta !== 0 && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {r.wordDelta > 0 ? '+' : ''}{r.wordDelta} words
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-2">
        {inlineOn
          ? 'Inline changes are marked in the sections below.'
          : 'Turn on inline changes to see exactly what moved, was cut or added, in place.'}
      </p>
    </div>
  )
}

// v1 (the first-ever generation): explicit state, never an empty or
// pretend-diffed panel.
export function FirstVersionNotice() {
  return (
    <div className="w-full px-5 py-4 border-b border-gray-200 bg-gray-50">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">First version</p>
      <p className="text-xs text-gray-500">This is the first draft -- there is nothing earlier to compare it against.</p>
    </div>
  )
}

// -- inline ins/del prose -----------------------------------------------------
// Renders clean text when inlineOn is false or no diff is available (unchanged
// sections, or a section too large for the token-level diff) -- never
// fabricates marks. ins/del styling is inline (not a class chosen from a
// lookup map) so production Tailwind purge can't drop it.

const INS_STYLE: React.CSSProperties = { backgroundColor: '#dcfce7', textDecoration: 'none', borderRadius: 3, padding: '0 2px' }
const DEL_STYLE: React.CSSProperties = { backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 3, padding: '0 2px' }

export function DiffProse({
  text,
  diff,
  inlineOn,
  emptyLabel,
}: {
  text: string
  diff: DiffOp[] | null
  inlineOn: boolean
  emptyLabel?: React.ReactNode
}) {
  if (!text) return <>{emptyLabel ?? null}</>
  if (!inlineOn || !diff || diff.length === 0) return <>{text}</>
  return (
    <>
      {diff.map((op, idx) => {
        if (op.type === 'eq') return <React.Fragment key={idx}>{op.value}</React.Fragment>
        // Whitespace-only ins/del tokens render as plain spacing -- a colored
        // box around a bare space is noise, not signal.
        if (!op.value.trim()) return <React.Fragment key={idx}>{op.value}</React.Fragment>
        if (op.type === 'ins') return <ins key={idx} style={INS_STYLE}>{op.value}</ins>
        return <del key={idx} style={DEL_STYLE}>{op.value}</del>
      })}
    </>
  )
}
