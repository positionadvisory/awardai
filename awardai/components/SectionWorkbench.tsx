'use client'
// components/SectionWorkbench.tsx — Workbench P2 (S138)
//
// One section card: its text, jury score + rationale, section-tied gaps, the
// data-needed checklist, a linear-history control, and a chat mount point. This
// is the component that must survive the future AOY v2 migration, so it is
// strictly SOURCE-AGNOSTIC: every value arrives via props, every mutation
// leaves via a callback. No Supabase, no fetch. It holds NO state seeded from
// props at mount (the S98 ConfigEntryCanvas stale-props trap); the only local
// state is the edit buffer, which is seeded on an explicit user click and
// discarded on save/cancel.
//
// Chunk 1 renders this READ-ONLY: the page passes text + (Chunk 2) score/
// rationale/gaps and omits the write callbacks. onSaveText / onRestore / the
// data callbacks / chatSlot are the later-chunk surfaces; the props exist now so
// the wiring in P2 Chunks 3-4 and P4 is additive.

import { useState } from 'react'
import DataNeededList from '@/components/DataNeededList'
import { normalizeRequestText, type DataNeededItem } from '@/lib/data-needed'

export type SectionRevision = {
  ts: string
  source: 'draft' | 'manual' | 'refine' | 'restore'
  text: string
  instruction?: string
}

type Props = {
  sectionKey: string
  label: string
  weight?: number | null
  text: string
  wordLimit?: number | null
  score?: number | null
  rationale?: string | null
  gaps?: string[]
  dataItems?: DataNeededItem[]
  revisions?: SectionRevision[]
  // Write surfaces (later chunks). Absent => read-only.
  onSaveText?: (text: string) => void
  onRestore?: (revisionIndex: number) => void
  onToggleData?: (id: string, done: boolean) => void
  onAddData?: (text: string) => void
  onScanData?: () => void
  scanningData?: boolean
  // Chunk 3: "track this" on a jury gap appends it to the data-needed list
  // (source: 'jury'). Absent => gaps render read-only, same as today.
  onTrackGap?: (text: string) => void
  // P4 mount point.
  chatSlot?: React.ReactNode
  // DOM id so a summary-bar chip can scroll this card into view.
  anchorId?: string
  // P3 (S146) — section-level DIRECTIONAL re-score. `rescore` is the fresh directional
  // result; it NEVER replaces `score` (the official jury score of record). Absent =>
  // the re-check affordance is hidden (the parent only wires onRecheck when an
  // evaluation exists). rescoreStale means the section text changed since the re-check.
  onRecheck?: (sectionKey: string) => void
  rechecking?: boolean
  rescore?: { score: number; rationale: string } | null
  rescoreStale?: boolean
}

function countWords(s: string): number {
  const t = (s || '').trim()
  return t ? t.split(/\s+/).length : 0
}

function scoreClasses(score?: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-500 ring-gray-200'
  if (score >= 7) return 'bg-green-100 text-green-800 ring-green-200'
  if (score >= 5) return 'bg-amber-100 text-amber-800 ring-amber-200'
  return 'bg-red-100 text-red-700 ring-red-200'
}

const SOURCE_ICON: Record<SectionRevision['source'], string> = {
  draft: '✎', manual: '✍', refine: '✦', restore: '↩',
}

function shortTs(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export default function SectionWorkbench({
  sectionKey, label, weight, text, wordLimit, score, rationale, gaps,
  dataItems, revisions, onSaveText, onRestore,
  onToggleData, onAddData, onScanData, scanningData, onTrackGap, chatSlot, anchorId,
  onRecheck, rechecking, rescore, rescoreStale,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [buffer, setBuffer] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)  // S154 item 1: per-section collapse

  const canEdit = !!onSaveText
  const words = countWords(editing ? buffer : text)
  const overLimit = !!(wordLimit && words > wordLimit)

  const startEdit = () => { setBuffer(text); setEditing(true) }        // seeded on click, not from props
  const save = () => { onSaveText?.(buffer); setEditing(false) }
  const cancel = () => setEditing(false)

  return (
    <div id={anchorId} className="scroll-mt-24 px-5 py-4">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="flex flex-wrap items-center gap-2 text-left group">
          <span className="text-gray-400 group-hover:text-gray-700 transition-colors">{collapsed ? '▸' : '▾'}</span>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h4>
          {weight != null && (
            <span className="text-xs text-gray-400">{weight}% of score</span>
          )}
          {score != null && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${scoreClasses(score)}`}>
              {score}/10
            </span>
          )}
          {rescore && (
            <span
              title={rescoreStale ? 'Section edited since this re-check' : 'Directional re-check, not the official score'}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${scoreClasses(rescore.score)} ${rescoreStale ? 'opacity-50' : ''}`}
            >
              → {rescore.score} directional
            </span>
          )}
        </button>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className={`text-xs tabular-nums ${overLimit ? 'text-red-600' : 'text-gray-400'}`}>
            {words.toLocaleString()}{wordLimit ? ` / ${wordLimit}` : ''} words
          </span>
          {canEdit && !editing && !collapsed && (
            <button type="button" onClick={startEdit} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:border-green-400 hover:text-green-600 transition-colors">✎ Edit</button>
          )}
          {onRecheck && !editing && !collapsed && (
            <button
              type="button"
              onClick={() => onRecheck(sectionKey)}
              disabled={rechecking}
              title="Re-score just this section (directional, does not change the official jury score)"
              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:border-green-400 hover:text-green-600 disabled:opacity-40 transition-colors"
            >
              {rechecking ? 'Re-checking…' : '↻ Re-check'}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (<>
      {/* Body: text or editor */}
      {editing ? (
        <div className="mt-2">
          <textarea
            value={buffer}
            onChange={e => setBuffer(e.target.value)}
            rows={Math.min(20, Math.max(6, buffer.split('\n').length + 1))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-green-600 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-3">
            <button type="button" onClick={save} className="rounded bg-green-800 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 transition-colors">Save</button>
            <button type="button" onClick={cancel} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {text || <span className="text-gray-400">No content yet.</span>}
        </p>
      )}

      {/* Jury rationale */}
      {rationale && (
        <div className="mt-3 rounded-lg border-l-2 border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Jury read</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{rationale}</p>
        </div>
      )}

      {/* Directional re-check (P3, S146). Never replaces the Jury read above; shown
          alongside it and always labelled directional. */}
      {rescore && (
        <div className={`mt-2 rounded-lg border-l-2 px-3 py-2 ${rescoreStale ? 'border-gray-200 bg-gray-50' : 'border-green-300 bg-green-50'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Directional re-check{score != null ? ` · ${score} → ${rescore.score}` : ` · ${rescore.score}/10`}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{rescore.rationale}</p>
          <p className="mt-1 text-xs text-gray-400">
            {rescoreStale
              ? 'You edited this section after this re-check. Re-check again for a current read.'
              : 'Directional only. Re-run the full jury eval for an official score.'}
          </p>
        </div>
      )}

      {/* Section-tied gaps. A gap can be promoted ("tracked") into the
          data-needed checklist below so a qualitative jury note becomes a
          trackable, ownable ask instead of living only as prose. Tracked-ness
          is derived from dataItems by normalized text, not a separate flag:
          the gap string and the tracked item's text are typically identical
          (trackGap below passes the gap text through verbatim), so this stays
          correct even if the parent re-renders with a fresh gaps array. */}
      {(gaps?.length ?? 0) > 0 && (
        <ul className="mt-2 grid grid-cols-1 gap-1">
          {gaps!.map((g, i) => {
            const alreadyTracked = (dataItems ?? []).some(
              item => normalizeRequestText(item.text) === normalizeRequestText(g)
            )
            return (
              <li key={i} className="flex items-start justify-between gap-2 text-sm leading-snug text-amber-700">
                <span>△ {g}</span>
                {onTrackGap && (
                  alreadyTracked ? (
                    <span className="flex-shrink-0 text-xs text-gray-400">Tracked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTrackGap(g)}
                      className="flex-shrink-0 text-xs text-green-700 hover:text-green-600 transition-colors"
                    >
                      Track this
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Data-needed checklist */}
      {(dataItems !== undefined || onScanData) && (
        <DataNeededList
          items={dataItems ?? []}
          onToggle={onToggleData}
          onAdd={onAddData}
          onScan={onScanData}
          scanning={scanningData}
        />
      )}

      {/* Linear history (P2 Chunk 4 wires Restore; read-only here) */}
      {(revisions?.length ?? 0) > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {historyOpen ? 'Hide history ↑' : `History (${revisions!.length}) ↓`}
          </button>
          {historyOpen && (
            <ul className="mt-1.5 grid grid-cols-1 gap-1.5">
              {revisions!.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                  <span className="flex-shrink-0" aria-hidden>{SOURCE_ICON[r.source] ?? '•'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-gray-600">{r.source}</span>
                    {shortTs(r.ts) ? <span className="ml-1.5 text-gray-400">{shortTs(r.ts)}</span> : null}
                    {r.instruction ? <span className="ml-1.5 italic text-gray-400">“{r.instruction}”</span> : null}
                  </span>
                  {onRestore && i !== revisions!.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onRestore(i)}
                      className="flex-shrink-0 text-green-700 hover:text-green-600 transition-colors"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* P4 chat mount point */}
      {chatSlot ? <div className="mt-3">{chatSlot}</div> : null}
      </>)}
    </div>
  )
}
