'use client'

// DraftChangeSummary (17 Aug 2026 - Joanne Fu call, PHD Singapore).
// A regenerated ("optimized") draft replaces the entry in place, and the only
// diff surface was the compare view at the bottom of the card. A cold
// first-run user generated four drafts and ended the session still asking
// what any of them changed. This renders a persistent "what changed" summary
// DIRECTLY ABOVE the new draft, where the transform happened.
//
// Pure client-side text comparison over generations the page has already
// loaded: no model call, no schema change, no new data. The bottom compare
// view (full previous-draft text) is untouched; this is the payoff of that
// same computation, relocated. Inline changed-text highlighting is
// deliberately out of scope.

export type DraftSummarySection = {
  key: string
  label: string
  text: string
}

type ChangeStatus = 'new' | 'removed' | 'rewritten' | 'unchanged'

type SectionChange = {
  key: string
  label: string
  status: ChangeStatus
  wordDelta: number
  changedPct: number // 0-100: share of the larger text not shared with the other
}

function toWords(text: string): string[] {
  const t = (text || '').trim()
  if (!t) return []
  return t.split(/\s+/).filter(Boolean)
}

function normalize(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

// Multiset word overlap: a cheap, order-insensitive estimate of how much of a
// section was rewritten. Good enough for a summary badge. Index loops only,
// no Set/Map iteration, no /u regex (downlevel build constraints).
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

// Dynamically-selected colors MUST be inline styles: Tailwind purges classes
// that only appear inside a lookup map (V3-P4 gotcha).
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

export default function DraftChangeSummary({
  generation,
  previousGeneration,
  current,
  previous,
}: {
  generation: number
  previousGeneration: number
  current: DraftSummarySection[]
  previous: DraftSummarySection[]
}) {
  const prevByKey: Record<string, DraftSummarySection> = {}
  for (let i = 0; i < previous.length; i++) prevByKey[previous[i].key] = previous[i]
  const matchedPrevKeys: Record<string, boolean> = {}

  const rows: SectionChange[] = []
  for (let i = 0; i < current.length; i++) {
    const cur = current[i]
    const prev = prevByKey[cur.key]
    if (!prev) {
      rows.push({ key: cur.key, label: cur.label, status: 'new', wordDelta: toWords(cur.text).length, changedPct: 100 })
      continue
    }
    matchedPrevKeys[cur.key] = true
    if (normalize(cur.text) === normalize(prev.text)) {
      rows.push({ key: cur.key, label: cur.label, status: 'unchanged', wordDelta: 0, changedPct: 0 })
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
    })
  }
  for (let i = 0; i < previous.length; i++) {
    const prev = previous[i]
    if (!matchedPrevKeys[prev.key]) {
      rows.push({ key: prev.key, label: prev.label, status: 'removed', wordDelta: -toWords(prev.text).length, changedPct: 100 })
    }
  }

  if (rows.length === 0) return null

  const changedCount = rows.filter(r => r.status !== 'unchanged').length
  const totalDelta = rows.reduce((acc, r) => acc + r.wordDelta, 0)

  return (
    <div className="w-full px-5 py-4 border-b border-gray-200 bg-green-50">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
          What changed in this draft
        </p>
        <p className="text-xs text-gray-500 tabular-nums">
          v{generation} vs v{previousGeneration}
          {totalDelta !== 0 ? ` · ${totalDelta > 0 ? '+' : ''}${totalDelta} words overall` : ''}
        </p>
      </div>
      {changedCount === 0 ? (
        <p className="text-xs text-gray-500">No text changes from the previous draft.</p>
      ) : (
        <ul className="w-full space-y-1.5">
          {rows.map(r => (
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
        The full text of earlier versions is under &quot;previous drafts&quot; at the bottom of this entry.
      </p>
    </div>
  )
}
