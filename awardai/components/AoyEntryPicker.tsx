'use client'

import { useEffect, useState } from 'react'
import {
  AOY_PILLARS, AOY_TRACKS, aoyTrackById, aoyCategoryOptions,
  buildAoyBestCategory, type AoyPillar,
} from '@/lib/aoy-taxonomy'

// ─────────────────────────────────────────────────────────────────────────────
// AoyEntryPicker (Session 72)
// Controlled, market-scoped Campaign AOY category picker: Pillar -> Track ->
// Category (+ Market for market-tier categories). Calls onChange with the
// CANONICAL best_category string (or '' while the selection is incomplete). The
// canonical value is guaranteed by the parity test to normalize onto a
// show_profiles.category_pattern rubric key, so the deployed evaluate-entry
// exact-key lookup resolves. Used by both the Quick Evaluate modal and the
// directions panel's "Add AOY entry" flow.
//
// Uncontrolled: owns its cascade state. Give it a changing `resetKey` (via React
// key in the parent) to force a fresh selection when a modal opens or the show
// changes. South Asia is excluded (2025 cycle); Asia-Pacific/Network is excluded
// (points-awarded aggregate titles, not entered).
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  onChange: (canonical: string) => void
  compact?: boolean
}

export default function AoyEntryPicker({ onChange, compact = false }: Props) {
  const [pillar, setPillar] = useState<AoyPillar>('agency')
  const [trackId, setTrackId] = useState('')
  const [stem, setStem] = useState('')
  const [market, setMarket] = useState('')

  const options = trackId ? aoyCategoryOptions(trackId, pillar) : []
  const selected = options.find(o => o.stemKey === stem)
  const needsMarket = !!selected?.requiresMarket
  const markets = aoyTrackById(trackId)?.markets ?? []

  const canonical = (() => {
    if (!selected) return ''
    if (needsMarket && !market) return ''
    return buildAoyBestCategory({ trackId, option: selected, marketPrefix: market || null }) ?? ''
  })()

  // Notify the parent whenever the resolved canonical value changes.
  useEffect(() => { onChange(canonical) }, [canonical]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`rounded-lg border border-green-200 bg-green-50/40 p-3 grid grid-cols-1 gap-3 ${compact ? '' : ''}`}>
      <p className="text-xs text-gray-500">
        Agency of the Year categories are market-scoped. Pick your pillar, track and category. South Asia is on its 2025 cycle and is not yet open.
      </p>

      {/* Pillar */}
      <div className="flex flex-wrap gap-1.5">
        {AOY_PILLARS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setPillar(p.id); setStem(''); setMarket('') }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              pillar === p.id
                ? 'bg-green-100 text-green-800 border-green-300 font-medium'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Track */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Track</label>
        <select
          value={trackId}
          onChange={e => { setTrackId(e.target.value); setStem(''); setMarket('') }}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
        >
          <option value="">Select a track…</option>
          {AOY_TRACKS.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Category */}
      {trackId && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Category</label>
          <select
            value={stem}
            onChange={e => { setStem(e.target.value); setMarket('') }}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
          >
            <option value="">Select a category…</option>
            {options.map(o => (
              <option key={o.stemKey} value={o.stemKey}>
                {o.label}{o.isNew ? '  (new for 2026)' : ''}{o.requiresMarket ? '  (pick market)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Market (market-tier categories only) */}
      {trackId && stem && needsMarket && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Market</label>
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
          >
            <option value="">Select a market…</option>
            {markets.map(m => (
              <option key={m.prefix} value={m.prefix}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Resolved canonical value */}
      {canonical && (
        <p className="text-xs text-green-700">
          Entering as: <span className="font-medium">{canonical}</span>
        </p>
      )}
    </div>
  )
}
