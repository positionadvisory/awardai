'use client'
// components/DataNeededList.tsx — Workbench P2 (S138)
//
// Per-section "data needed" checklist. Fully source-agnostic and presentational:
// all items come in via props, every mutation goes out via a callback. No
// Supabase, no fetch, no internal seeded-from-props state (avoids the S98
// stale-props class). Checking an item never triggers an eval; that decoupling
// is the whole point (Workbench-P2 brief, Chunk 3).
//
// Chunk 1 renders this READ-ONLY (no callbacks passed). onToggle / onAdd /
// onScan are the Chunk 3 write surface.

import { useState } from 'react'
import type { DataNeededItem } from '@/lib/data-needed'

type Props = {
  items: DataNeededItem[]
  onToggle?: (id: string, done: boolean) => void
  onAdd?: (text: string) => void
  onScan?: () => void
  scanning?: boolean
  readOnly?: boolean
}

const SOURCE_LABEL: Record<DataNeededItem['source'], string> = {
  parsed: 'from draft',
  jury: 'from jury',
  manual: 'added',
}

export default function DataNeededList({ items, onToggle, onAdd, onScan, scanning, readOnly }: Props) {
  const [draft, setDraft] = useState('')
  const canToggle = !readOnly && !!onToggle
  const canAdd = !readOnly && !!onAdd

  const submitAdd = () => {
    const t = draft.trim()
    if (!t || !onAdd) return
    onAdd(t)
    setDraft('')
  }

  const openCount = items.filter(i => !i.done).length

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Data needed{items.length > 0 ? ` (${openCount} open)` : ''}
        </span>
        {onScan && (
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="text-xs text-green-700 hover:text-green-600 disabled:opacity-40 transition-colors"
          >
            {scanning ? 'Scanning…' : 'Scan for data requests'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-400">
          No data requests tracked. Bracketed asks in the draft can be scanned in, or add your own.
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-1.5">
          {items.map(item => (
            <li key={item.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!canToggle}
                onChange={e => onToggle?.(item.id, e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-green-800 disabled:opacity-60"
                aria-label={item.done ? 'Mark not done' : 'Mark done'}
              />
              <span className="min-w-0 flex-1 text-sm leading-snug text-gray-700">
                <span className={item.done ? 'line-through text-gray-400' : ''}>{item.text}</span>
                {item.owner ? (
                  <span className="ml-1.5 rounded bg-white px-1.5 py-0.5 text-xs text-gray-500 ring-1 ring-gray-200">
                    {item.owner}
                  </span>
                ) : null}
                <span className="ml-1.5 text-xs text-gray-400">{SOURCE_LABEL[item.source]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitAdd() } }}
            placeholder="Add a data request…"
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={submitAdd}
            disabled={!draft.trim()}
            className="flex-shrink-0 rounded bg-green-800 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
