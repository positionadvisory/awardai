'use client'
// components/EntryRoomChanges.tsx — Entry Room Slice 2 (24 Aug 2026), extended
// in Slice 2c (24 Aug 2026 night) to make the diff readable.
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
// diffTokenSequences, buildSentenceBlocks) is pure and side-effect free, safe
// to call from a useMemo that React StrictMode double-invokes. DiffProse
// keeps one piece of local UI state (the rewritten-section compare toggle) —
// that is render state, not diff computation, and stays scoped to that one
// component instance.
//
// SLICE 2C (24 Aug 2026 night), dispatched from the QB planning thread after
// live review of project 118 (org 2, read-only): word-level LCS alone is
// correct and unreadable at both extremes.
//   - Direction 797 rendered a wall of green: gen 1 used generic keys
//     (section_1..section_10), gen 2 used semantic form keys (entry_title,
//     creative_idea, results...). Zero field_key overlap, so the old
//     exact-key match paired nothing and every section read as brand new.
//     Fixed by computeSectionChanges' key-drift fallback pairing below.
//   - Direction 829 rendered confetti: per-section kept vocabulary ran
//     37%-90%. At 85-90% kept, word marks are readable; at 37-61% kept,
//     alternating red/green word marks are noise, not signal. Fixed by
//     sentence-level grouping (word marks only inside a sentence pair that
//     kept enough shared vocabulary; otherwise the whole sentence pair
//     renders as one clean replaced block) plus a whole-section "rewritten"
//     escape hatch for pairs that kept almost nothing at all.

import React from 'react'

export type WhatChangedSection = {
  key: string
  label: string
  text: string
}

export type ChangeStatus = 'new' | 'removed' | 'rewritten' | 'unchanged'

export type DiffOp = { type: 'eq' | 'ins' | 'del'; value: string }

// A single rendering unit inside one section's diffed prose.
//   'diff'    — ordinary word-level ins/del marks (whole new/removed
//               sections, and sentence pairs that kept enough shared
//               vocabulary to mark inline).
//   'replace' — a sentence pair that did NOT keep enough shared vocabulary.
//               Renders as the whole old sentence struck, then the whole new
//               sentence inserted — never interleaved. This is what kills
//               word-level confetti on a heavily-rewritten sentence.
//   'ins'/'del' — a sentence with no counterpart at all in the other version.
export type DiffBlock =
  | { kind: 'diff'; ops: DiffOp[] }
  | { kind: 'replace'; oldText: string; newText: string }
  | { kind: 'ins'; text: string }
  | { kind: 'del'; text: string }

// Slice 2c: the per-section diff payload. `blocks === null` means "no inline
// diff available" — unchanged section, or the token-level size guard tripped
// (same contract the old bare DiffOp[] | null had: badge-only fallback, never
// a broken render). `rewritten` flags a section pair whose overall
// similarity fell below REWRITE_SIMILARITY_THRESHOLD: `blocks` is
// deliberately not computed for these (there is nothing legible to mark),
// and callers must show the "substantially rewritten" treatment instead.
// `prevText` is the previous generation's already-resolved text for this
// section — it was already in memory in computeSectionChanges' `previous`
// argument, so the on-demand old/new compare needs no new fetch.
export type SectionDiffResult = {
  blocks: DiffBlock[] | null
  rewritten: boolean
  prevText: string | null
}

export type SectionChangeRow = {
  key: string
  label: string
  status: ChangeStatus
  wordDelta: number
  changedPct: number // 0-100: share of the larger text not shared with the other
  // True when status === 'rewritten' and the pair's overall similarity fell
  // below REWRITE_SIMILARITY_THRESHOLD. The panel row and DiffProse both key
  // off this — it is what stops a heavily-rewritten section from showing a
  // fake ±word-count line or confetti marks.
  substantiallyRewritten: boolean
  diff: SectionDiffResult | null
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

// Sentence splitter for the sentence-level alignment pass (slice 2c).
// ASCII-only, index-based scanner -- no /u flag, no \p{...} escapes, same
// downlevel-build constraint tokenize() above already works around. Entries
// are English prose, so a plain .!? scan plus closing-quote/paren handling
// is enough. Trailing punctuation, closing quote/paren, and trailing
// whitespace stay attached to the sentence that precedes them, so
// `splitSentences(t).join('') === t` exactly -- required for the diff to
// reconstruct spacing losslessly.
function splitSentences(text: string): string[] {
  const t = text || ''
  if (!t) return []
  const out: string[] = []
  let start = 0
  let i = 0
  while (i < t.length) {
    const ch = t[i]
    if (ch === '.' || ch === '!' || ch === '?') {
      let j = i + 1
      while (j < t.length && (t[j] === '.' || t[j] === '!' || t[j] === '?')) j++
      while (j < t.length && (t[j] === '"' || t[j] === '\'' || t[j] === ')' || t[j] === ']')) j++
      while (j < t.length && /\s/.test(t[j])) j++
      out.push(t.slice(start, j))
      start = j
      i = j
    } else {
      i++
    }
  }
  if (start < t.length) out.push(t.slice(start))
  return out.filter(s => s.length > 0)
}

// Multiset word overlap: a cheap, order-insensitive estimate of how much of a
// section (or sentence) was rewritten. Used for the badge text and for the
// rewrite/sentence thresholds below; independent of the token-level diff.
// Index loops only, no Set/Map iteration.
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

// Normalized-label word overlap, 0-1. Used only by the key-drift fallback
// pairing below, to pair sections whose field_key changed between
// generations but whose human label is still recognizably the same thing.
function normalizeLabelWords(label: string): string[] {
  const t = (label || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!t) return []
  return t.split(' ').filter(Boolean)
}

function labelSimilarity(a: string, b: string): number {
  const wa = normalizeLabelWords(a)
  const wb = normalizeLabelWords(b)
  if (wa.length === 0 || wb.length === 0) return 0
  const counts: Record<string, number> = {}
  for (let i = 0; i < wa.length; i++) counts[wa[i]] = (counts[wa[i]] || 0) + 1
  let shared = 0
  for (let i = 0; i < wb.length; i++) {
    const w = wb[i]
    if ((counts[w] || 0) > 0) {
      counts[w] -= 1
      shared += 1
    }
  }
  return shared / Math.max(wa.length, wb.length)
}

// Slice 2c thresholds (24 Aug 2026), tuned against live org 2 data, project
// 118 directions 797 and 829 -- see the dispatch prompt for the full read.
//
// Direction 797: gen 1 used generic keys (section_1..section_10), gen 2 used
// semantic keys (entry_title, creative_idea, results...) -- 0/10 field_key
// overlap, which used to render as 10 brand-new sections (a wall of green).
// A normal single-section add/remove keeps most keys matching between
// generations and never crosses KEY_MATCH_FALLBACK_THRESHOLD, so it is not
// affected by the fallback path.
const KEY_MATCH_FALLBACK_THRESHOLD = 0.5 // engage label/position fallback pairing only when fewer than half of the current sections found a field_key match
const MIN_LABEL_SIMILARITY = 0.5 // normalized-label word-overlap ratio (0-1) needed to pair two sections by label alone, before falling back to sort position

// Direction 829: per-section kept vocabulary ran 37%-90%. 85-90% kept reads
// fine as word marks; 37-61% kept alternates red/green word marks into
// confetti. REWRITE_SIMILARITY_THRESHOLD catches the low end at the whole-
// section level (829's "challenges" section, 37% kept, lands here and gets
// the rewritten badge instead of marks). SENTENCE_SIMILARITY_THRESHOLD
// catches the confetti band that survives that first cut, at the individual
// sentence-pair level, so a section that is mostly kept but has one heavily
// rewritten sentence doesn't confetti that one sentence.
const REWRITE_SIMILARITY_THRESHOLD = 40 // % kept, whole section; below this: no inline marks, "substantially rewritten" badge + on-demand compare instead
const SENTENCE_SIMILARITY_THRESHOLD = 60 // % shared tokens, one aligned sentence pair; below this: render as one clean replaced block (old struck, new inserted, not interleaved)

// Guards the O(n*m) LCS table. Checked against real org 2 AOY data (24 Aug
// 2026): the longest section seen was ~1,416 words (~2,830 word+space
// tokens), so the guard needs real headroom, not just "a paragraph or two."
// 4000x4000 Uint16Array cells (LCS lengths never exceed min(n,m) <= 4000, so
// 16 bits is enough) is ~32MB, and the page only ever runs this for the ONE
// expanded/focused direction (see computeTokenDiff below) -- not every
// multi-generation direction on the page. Above the guard, diff returns
// null and callers fall back to plain text -- the badge (changedShare-based)
// still renders regardless, so the floor never breaks.
//
// Slice 2c note: this guard now runs at THREE granularities that all share
// this one function -- the sentence-level alignment pass (prevSentences vs
// curSentences, always tiny: a 1,416-word section splits into well under a
// hundred sentences), and the per-sentence-pair word-level diff (bounded by
// one sentence's token count, never the whole section's). Both are far
// below 4000 in practice, which is why sentence-level grouping raises the
// PRACTICAL ceiling even though the constant itself is unchanged: the guard
// used to gate on whole-section token count and now only ever gates on one
// sentence's token count. It stays as a defensive backstop for a
// pathological single "sentence" with no terminal punctuation at all across
// a huge section -- kept, not removed.
const MAX_DIFF_TOKENS = 4000

// Classic LCS word diff: DP table + backtrack. Index loops only -- no
// [...new Set()] spread, no for...of over Set/Map, no /u regex (downlevel
// build target constraints). Generic over any string[] pair by design --
// slice 2c reuses this unchanged for sentence-level alignment (the "tokens"
// are whole sentences there, matched by exact string equality same as
// words here).
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

function wrapOpsAsBlocks(ops: DiffOp[] | null): DiffBlock[] | null {
  return ops ? [{ kind: 'diff', ops }] : null
}

// Pairs one changed (non-identical) sentence. Word-level marks only when the
// pair kept enough shared vocabulary (SENTENCE_SIMILARITY_THRESHOLD) --
// otherwise the whole old sentence is struck and the whole new sentence is
// inserted, with nothing interleaved. Also the safe degrade if the
// word-level diffTokenSequences call itself hits MAX_DIFF_TOKENS (a single
// pathological sentence with thousands of tokens).
function pairSentences(oldSentence: string, newSentence: string): DiffBlock {
  const oldWords = toWords(oldSentence)
  const newWords = toWords(newSentence)
  const similarity = 100 - changedShare(oldWords, newWords)
  if (similarity >= SENTENCE_SIMILARITY_THRESHOLD) {
    const wordOps = diffTokenSequences(tokenize(oldSentence), tokenize(newSentence))
    if (wordOps) return { kind: 'diff', ops: wordOps }
  }
  return { kind: 'replace', oldText: oldSentence, newText: newSentence }
}

// Sentence-level grouping (slice 2c). Splits both texts into sentences,
// aligns them with the same LCS used for words (diffTokenSequences reused at
// sentence granularity), then only descends to word-level marks inside a
// sentence pair that kept enough shared vocabulary. A contiguous run of
// deleted/inserted sentences between two matched ("eq") sentences is the
// candidate replacement window for pairSentences: consecutive del/ins runs
// pair off index-wise (first del with first ins, and so on); anything left
// over on either side stays a whole unmatched sentence (pure ins or del).
// Returns null only if the sentence-level diffTokenSequences call itself
// hits MAX_DIFF_TOKENS (would need thousands of sentences in one section --
// not seen in real data, but a defensive null, not a throw).
function buildSentenceBlocks(prevText: string, curText: string): DiffBlock[] | null {
  const prevSentences = splitSentences(prevText)
  const curSentences = splitSentences(curText)
  const ops = diffTokenSequences(prevSentences, curSentences)
  if (!ops) return null

  const blocks: DiffBlock[] = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.type === 'eq') {
      blocks.push({ kind: 'diff', ops: [{ type: 'eq', value: op.value }] })
      i++
      continue
    }
    const dels: string[] = []
    const inss: string[] = []
    let j = i
    while (j < ops.length && ops[j].type !== 'eq') {
      if (ops[j].type === 'del') dels.push(ops[j].value)
      else inss.push(ops[j].value)
      j++
    }
    const pairCount = Math.min(dels.length, inss.length)
    for (let k = 0; k < pairCount; k++) blocks.push(pairSentences(dels[k], inss[k]))
    for (let k = pairCount; k < dels.length; k++) blocks.push({ kind: 'del', text: dels[k] })
    for (let k = pairCount; k < inss.length; k++) blocks.push({ kind: 'ins', text: inss[k] })
    i = j
  }
  return blocks
}

// Whole-section diff payload for one matched (non-identical) pair. Rewrite
// detection short-circuits everything below it -- a section pair whose
// overall similarity fell below REWRITE_SIMILARITY_THRESHOLD gets no
// sentence/word-level work at all, just the flag + the previous text for the
// on-demand compare.
function computeSectionDiff(prevText: string, curText: string, substantiallyRewritten: boolean): SectionDiffResult {
  if (substantiallyRewritten) {
    return { blocks: null, rewritten: true, prevText }
  }
  return { blocks: buildSentenceBlocks(prevText, curText), rewritten: false, prevText }
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
//
// Slice 2c: pairing is no longer exact-field_key-only. Pass 1 matches by
// field_key, same as before. Pass 2 (key-drift fallback) only engages when
// key matching mostly failed for this pair (KEY_MATCH_FALLBACK_THRESHOLD) --
// it pairs the leftover sections first by normalized-label similarity, then
// by relative sort position for whatever remains unpaired. `current` and
// `previous` already arrive in get_project_entry_drafts' deterministic
// ordering (sort_order ASC, id ASC), so array position IS sort position --
// no extra field needed on WhatChangedSection for this.
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

  // Pass 1: exact field_key match.
  const pairedPrev: (WhatChangedSection | null)[] = new Array(current.length).fill(null)
  const matchedPrevKeys: Record<string, boolean> = {}
  const unmatchedCurIdx: number[] = []
  for (let i = 0; i < current.length; i++) {
    const prev = prevByKey[current[i].key]
    if (prev) {
      pairedPrev[i] = prev
      matchedPrevKeys[prev.key] = true
    } else {
      unmatchedCurIdx.push(i)
    }
  }
  const unmatchedPrevIdx: number[] = []
  for (let i = 0; i < previous.length; i++) {
    if (!matchedPrevKeys[previous[i].key]) unmatchedPrevIdx.push(i)
  }

  // Pass 2: key-drift fallback pairing, only when key matching mostly
  // failed for this generation pair (a normal single-section add/remove
  // keeps most keys matching and never reaches here).
  const keyMatchRate = current.length > 0 ? (current.length - unmatchedCurIdx.length) / current.length : 1
  if (
    unmatchedCurIdx.length > 0 &&
    unmatchedPrevIdx.length > 0 &&
    keyMatchRate < KEY_MATCH_FALLBACK_THRESHOLD
  ) {
    const curTaken: Record<number, boolean> = {}
    const prevTaken: Record<number, boolean> = {}

    // 2a: greedy pairing by normalized-label similarity, strongest matches
    // first, so "Creative Idea" (gen 1) and "Creative Idea" (gen 2) pair
    // even if their field_keys and sort positions both drifted.
    type Candidate = { curI: number; prevI: number; score: number }
    const candidates: Candidate[] = []
    for (const ci of unmatchedCurIdx) {
      for (const pi of unmatchedPrevIdx) {
        const score = labelSimilarity(current[ci].label, previous[pi].label)
        if (score >= MIN_LABEL_SIMILARITY) candidates.push({ curI: ci, prevI: pi, score })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    for (const c of candidates) {
      if (curTaken[c.curI] || prevTaken[c.prevI]) continue
      curTaken[c.curI] = true
      prevTaken[c.prevI] = true
      pairedPrev[c.curI] = previous[c.prevI]
      matchedPrevKeys[previous[c.prevI].key] = true
    }

    // 2b: whatever is left on both sides, pair by relative sort position.
    // This is the direction-797 case: fully generic labels (section_1..10)
    // give zero label-similarity matches, but the sections line up 1:1 in
    // the same order gen 1 -> gen 2.
    const leftoverCur = unmatchedCurIdx.filter(ci => !curTaken[ci])
    const leftoverPrev = unmatchedPrevIdx.filter(pi => !prevTaken[pi])
    const n = Math.min(leftoverCur.length, leftoverPrev.length)
    for (let k = 0; k < n; k++) {
      const ci = leftoverCur[k]
      const pi = leftoverPrev[k]
      pairedPrev[ci] = previous[pi]
      matchedPrevKeys[previous[pi].key] = true
    }
  }

  const rows: SectionChangeRow[] = []
  for (let i = 0; i < current.length; i++) {
    const cur = current[i]
    const prev = pairedPrev[i]
    if (!prev) {
      rows.push({
        key: cur.key,
        label: cur.label,
        status: 'new',
        wordDelta: toWords(cur.text).length,
        changedPct: 100,
        substantiallyRewritten: false,
        diff: computeTokenDiff
          ? { blocks: wrapOpsAsBlocks(diffTokenSequences([], tokenize(cur.text))), rewritten: false, prevText: null }
          : null,
      })
      continue
    }
    if (normalize(cur.text) === normalize(prev.text)) {
      rows.push({ key: cur.key, label: cur.label, status: 'unchanged', wordDelta: 0, changedPct: 0, substantiallyRewritten: false, diff: null })
      continue
    }
    const curWords = toWords(cur.text)
    const prevWords = toWords(prev.text)
    const changedPct = changedShare(prevWords, curWords)
    const substantiallyRewritten = 100 - changedPct < REWRITE_SIMILARITY_THRESHOLD
    rows.push({
      key: cur.key,
      label: cur.label,
      status: 'rewritten',
      wordDelta: curWords.length - prevWords.length,
      changedPct,
      substantiallyRewritten,
      diff: computeTokenDiff ? computeSectionDiff(prev.text, cur.text, substantiallyRewritten) : null,
    })
  }
  for (let i = 0; i < previous.length; i++) {
    const prev = previous[i]
    if (!matchedPrevKeys[prev.key]) {
      rows.push({ key: prev.key, label: prev.label, status: 'removed', wordDelta: -toWords(prev.text).length, changedPct: 100, substantiallyRewritten: false, diff: null })
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
                r.substantiallyRewritten ? (
                  <span className="text-xs text-gray-400">Substantially rewritten — see below to compare.</span>
                ) : (
                  <span className="text-xs text-gray-400 tabular-nums">
                    ~{r.changedPct}% of the text changed
                    {r.wordDelta !== 0 ? `, ${r.wordDelta > 0 ? '+' : ''}${r.wordDelta} words` : ''}
                  </span>
                )
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
const REWRITE_BADGE_STYLE: React.CSSProperties = { backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 3, padding: '1px 6px' }

function renderBlock(block: DiffBlock, idx: number): React.ReactNode {
  if (block.kind === 'diff') {
    return (
      <React.Fragment key={idx}>
        {block.ops.map((op, oi) => {
          if (op.type === 'eq') return <React.Fragment key={oi}>{op.value}</React.Fragment>
          // Whitespace-only ins/del tokens render as plain spacing -- a colored
          // box around a bare space is noise, not signal.
          if (!op.value.trim()) return <React.Fragment key={oi}>{op.value}</React.Fragment>
          if (op.type === 'ins') return <ins key={oi} style={INS_STYLE}>{op.value}</ins>
          return <del key={oi} style={DEL_STYLE}>{op.value}</del>
        })}
      </React.Fragment>
    )
  }
  if (block.kind === 'replace') {
    return (
      <React.Fragment key={idx}>
        {block.oldText.trim() ? <del style={DEL_STYLE}>{block.oldText}</del> : block.oldText}
        {block.newText.trim() ? <ins style={INS_STYLE}>{block.newText}</ins> : block.newText}
      </React.Fragment>
    )
  }
  if (block.kind === 'ins') {
    return block.text.trim() ? <ins key={idx} style={INS_STYLE}>{block.text}</ins> : <React.Fragment key={idx}>{block.text}</React.Fragment>
  }
  return block.text.trim() ? <del key={idx} style={DEL_STYLE}>{block.text}</del> : <React.Fragment key={idx}>{block.text}</React.Fragment>
}

export function DiffProse({
  text,
  diff,
  inlineOn,
  emptyLabel,
}: {
  text: string
  diff: SectionDiffResult | null
  inlineOn: boolean
  emptyLabel?: React.ReactNode
}) {
  // Collapsed-by-default compare toggle for a "substantially rewritten"
  // section (slice 2c). Local UI state only -- the diff computation this
  // reads from (diff.prevText) is pure and already in memory; this is not
  // re-computing anything, just deciding whether to show it.
  const [compareOpen, setCompareOpen] = React.useState(false)

  if (!text) return <>{emptyLabel ?? null}</>
  if (!inlineOn || !diff) return <>{text}</>

  if (diff.rewritten) {
    return (
      <>
        <span className="inline-block text-xs font-medium mr-2 mb-1" style={REWRITE_BADGE_STYLE}>
          Substantially rewritten
        </span>
        <button
          type="button"
          onClick={() => setCompareOpen(o => !o)}
          className="text-xs font-medium text-green-800 hover:text-green-900 mb-1 block"
        >
          {compareOpen ? 'Hide previous version' : 'Compare with previous version'}
        </button>
        {compareOpen && diff.prevText != null && (
          <div className="mb-2 pl-3 border-l-2 border-gray-200">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Previous</p>
            <p className="text-sm text-gray-500 whitespace-pre-wrap mb-2">{diff.prevText}</p>
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Current</p>
          </div>
        )}
        <span>{text}</span>
      </>
    )
  }

  if (!diff.blocks || diff.blocks.length === 0) return <>{text}</>
  return <>{diff.blocks.map((block, idx) => renderBlock(block, idx))}</>
}
