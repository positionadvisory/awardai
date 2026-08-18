'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AngleCard — Arc v2 B2 (angles surface, 18 Aug 2026) + B3 bridge (19 Aug 2026)
//
// One full-weight card off a persisted `angles` row (design §1 "What renders"
// + decision 2 of record). Rules encoded here:
//   • Nothing renders below text-sm gray-700. The directions surface hid a
//     six-week defect in 12px gray-400 small print; legibility is a design
//     rule on this surface, not a style choice. The premise carries the
//     visual weight, not just the title.
//   • "What's missing" is an explicit, visually distinct block. Gaps stay
//     gaps: the block names the missing evidence and never supplies it.
//   • Figure trace renders per figure via FigureTraceText, plus one summary
//     line when untraced_count > 0. Clean figures carry no label, ever.
//   • "Build a draft from this angle" (B3): one direction row from this angle
//     via angleBridge, then the EXISTING per-entry-type draft flow on the
//     project page (?draftDirection=<id>). An already-bridged angle shows
//     "Draft started → view direction" instead — re-clicking can never create
//     a duplicate direction. The bridge stays enabled on a nonzero figure
//     trace count (design §3: the draft path owns enforcement; the angle
//     layer's job is legibility). No score, no ranking, no auto-advance:
//     parking the whole set is a legitimate exit.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import FigureTraceText from './FigureTraceText'
import { bridgeAngleToDirection } from './angleBridge'

export type AngleRow = {
  id: number
  batch_id: string
  angle_index: number
  category: string
  name: string
  premise: string
  evidence_anchors: Array<{ document: string; evidence: string }> | null
  gaps: string[] | null
  figure_trace: {
    untraced?: string[]
    derived?: string[]
    untraced_count?: number
    derived_count?: number
    checked_figures?: number
  } | null
  source_materials: Array<{ path: string; name: string; uploaded_at: string | null; chars_sent: number }> | null
  seeded?: boolean
  created_at: string
  direction_id?: number | null
}

export default function AngleCard({ angle, projectId, targetShow, userId, directionCount }: {
  angle: AngleRow
  projectId: number
  // Resolved by the page via resolveBridgeShow; null = no target show on the
  // project, bridge renders disabled with an honest hint.
  targetShow: string | null
  userId: string | null
  directionCount: number
}) {
  const router = useRouter()
  const trace = angle.figure_trace ?? {}
  const untraced = Array.isArray(trace.untraced) ? trace.untraced : []
  const derived = Array.isArray(trace.derived) ? trace.derived : []
  const untracedCount = typeof trace.untraced_count === 'number' ? trace.untraced_count : untraced.length
  const anchors = Array.isArray(angle.evidence_anchors) ? angle.evidence_anchors : []
  const gaps = Array.isArray(angle.gaps) ? angle.gaps : []

  // B3 bridge state. The ref is the re-entrancy guard (set synchronously as
  // the handler's first line — disabled={state} alone does not close the
  // double-click race, S109/S110); the state drives the UI.
  const bridgeFiredRef = useRef(false)
  const [bridging, setBridging] = useState(false)
  const [bridgeError, setBridgeError] = useState('')
  const [bridgedDirectionId, setBridgedDirectionId] = useState<number | null>(
    typeof angle.direction_id === 'number' ? angle.direction_id : null
  )

  const startBridge = async () => {
    if (bridgeFiredRef.current) return
    if (!targetShow || !userId) return
    bridgeFiredRef.current = true
    setBridging(true)
    setBridgeError('')
    const result = await bridgeAngleToDirection({
      angle,
      projectId,
      targetShow,
      userId,
      sortOrder: directionCount,
    })
    if (result.ok) {
      setBridgedDirectionId(result.directionId)
      // The existing draft flow owns everything from here: per-entry-type
      // routing (AOY → generate-aoy-draft, config → generate-entry-draft,
      // SMARTIES → generate-smarties-draft, else generic), guards, and the
      // post-draft Entries handoff. No new routing is built for the bridge.
      router.push(`/projects/${projectId}?draftDirection=${result.directionId}`)
      return
    }
    bridgeFiredRef.current = false
    setBridging(false)
    setBridgeError(result.message)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5" style={{ borderLeftColor: '#c9a95c', borderLeftWidth: '3px' }}>
      <h3 className="font-medium text-gray-900">
        <FigureTraceText text={angle.name} untraced={untraced} derived={derived} />
      </h3>

      <p className="text-gray-900 mt-2 leading-relaxed">
        <FigureTraceText text={angle.premise} untraced={untraced} derived={derived} />
      </p>

      {untracedCount > 0 && (
        <p className="text-sm mt-2" style={{ color: '#b45309' }}>
          {untracedCount === 1
            ? '1 figure could not be traced to your selected documents.'
            : untracedCount + ' figures could not be traced to your selected documents.'}
        </p>
      )}

      {anchors.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">What it rests on</p>
          <div className="grid grid-cols-1 gap-2">
            {anchors.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5 flex-shrink-0 max-w-[45%] truncate" title={a.document}>{a.document}</span>
                <p className="text-sm text-gray-700 leading-relaxed min-w-0">
                  <FigureTraceText text={a.evidence} untraced={untraced} derived={derived} />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 mb-1.5">What's missing</p>
          <ul className="grid grid-cols-1 gap-1.5">
            {gaps.map((g, i) => (
              <li key={i} className="text-sm text-amber-900 leading-relaxed flex items-start gap-2">
                <span aria-hidden="true" className="flex-shrink-0">•</span>
                <span className="min-w-0">
                  <FigureTraceText text={g} untraced={untraced} derived={derived} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3 flex-wrap">
        {bridgedDirectionId ? (
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-sm text-green-700 hover:text-green-600 transition-colors"
          >
            Draft started → view direction
          </button>
        ) : (
          <>
            <button
              onClick={startBridge}
              disabled={bridging || !targetShow || !userId}
              className="border border-green-700 text-green-800 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2"
            >
              {bridging ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Starting the draft…</>
              ) : 'Build a draft from this angle'}
            </button>
            {!targetShow && <span className="text-xs text-gray-400">Set a target show on the project first.</span>}
          </>
        )}
        {bridgeError && <span className="text-sm" style={{ color: '#b45309' }}>{bridgeError}</span>}
      </div>
    </div>
  )
}
