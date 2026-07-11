'use client'
// components/SectionChat.tsx — Workbench P4 (S147)
//
// The chat mount point for SectionWorkbench's chatSlot. Two explicit modes on
// one thread: Discuss (conversational, writes nothing to the draft) and Apply
// (the existing refine: rewrite, new revision). Source-agnostic like
// SectionWorkbench itself: every value arrives via props, the only local
// state is the input buffer and the collapse/expand toggles for old apply
// turns.

import { useEffect, useRef, useState } from 'react'
import GeneratingBar from './GeneratingBar'

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
  mode?: 'discuss' | 'apply'
  version_created?: string
}

// S149: mode-specific loading statements for the in-flight progress bar. Short,
// understated, no em-dashes (house rule). Discuss is the faster call (1500
// tokens); Apply rewrites the whole section (up to 4096) so it runs longer.
const DISCUSS_STATEMENTS = [
  'Reading the section.',
  'Weighing it against the rubric.',
  'Thinking it through.',
  'Pulling the thread together.',
]
const APPLY_STATEMENTS = [
  'Reading the current text.',
  'Weighing the rubric and the tracked gaps.',
  'Drafting the revision.',
  'Tightening the language.',
  'Checking every figure stays put.',
]

type Props = {
  thread: ChatTurn[]
  onSend: (message: string, mode: 'discuss' | 'apply') => Promise<void>
  busy: boolean
  busyMode?: 'discuss' | 'apply' | null
  error?: string | null
  placeholder?: string
  // Wave 1 SMARTIES (S151): the config/typed canvas gets Discuss only. Apply
  // (refine) is deferred there because a refine written to the composed section
  // text would desync from the typed field_values that are the source of truth.
  // When true, the Apply button is hidden and every send is a discuss turn.
  // Absent/false keeps the full two-button AOY behaviour byte-unchanged.
  discussOnly?: boolean
}

export default function SectionChat({ thread, onSend, busy, busyMode, error, placeholder, discussOnly }: Props) {
  const [message, setMessage] = useState('')
  const [expandedTurns, setExpandedTurns] = useState<Record<number, boolean>>({})
  // Re-entrancy guard (S110 audit item, called out explicitly in the P4
  // brief): the `disabled` prop only takes effect on the NEXT render, so a
  // fast double-click or a double Cmd+Enter can fire this handler twice
  // before React ever disables the button. This handler writes via service
  // role (discuss appends chat_history; apply appends a revision), so a
  // double-fire is a real double-write, not a cosmetic glitch. The ref flips
  // synchronously inside the handler, before the first `await`, closing that
  // window in a way a state-only `disabled` check cannot.
  const inFlightRef = useRef(false)

  // S149: show the shared GeneratingBar (the same gold progress bar the jury
  // eval, coach, and script actions use) while a Discuss/Apply call is in
  // flight, so a multi-second edit-entry round trip never reads as a frozen
  // panel. Kept mounted through the completion animation via barVisible: busy
  // flips false the moment the call resolves, the bar fills to 100% then
  // onComplete hides it. barMode is captured at fire time so the duration and
  // statements stay stable even after the parent clears busyMode.
  const [barVisible, setBarVisible] = useState(false)
  const [barMode, setBarMode] = useState<'discuss' | 'apply'>('apply')
  useEffect(() => { if (busy) setBarVisible(true) }, [busy])

  const fire = async (mode: 'discuss' | 'apply') => {
    const trimmed = message.trim()
    if (!trimmed || inFlightRef.current || busy) return
    setBarMode(mode)
    inFlightRef.current = true
    try {
      await onSend(trimmed, mode)
      setMessage('')
    } finally {
      inFlightRef.current = false
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      {thread.length > 0 && (
        <div className={`mb-3 space-y-2 ${thread.length > 8 ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
          {thread.map((msg, i) => {
            if (msg.role === 'user') {
              return (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                  <span className="mt-0.5 text-gray-300">↺</span>
                  <span className="italic">&quot;{msg.content}&quot;</span>
                  {msg.version_created && (
                    <span className="flex-shrink-0 font-medium uppercase text-green-700">→ {msg.version_created}</span>
                  )}
                </div>
              )
            }
            // Backward-compat (brief): an untagged assistant turn is pre-P4
            // history, always a produced-revision turn — render it exactly
            // like an 'apply' turn always has, collapsed by default.
            const isDiscussTurn = msg.mode === 'discuss'
            if (isDiscussTurn) {
              // Discuss replies render as normal chat bubbles: full text,
              // never collapsed (brief).
              return (
                <div key={i} className="ml-5 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-green-700">Discuss</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{msg.content}</p>
                </div>
              )
            }
            // Apply turn: collapsed "produced revision" rendering, unchanged
            // from the pre-P4 per-field chat thread.
            const isOpen = expandedTurns[i] ?? false
            return (
              <div key={i} className="ml-5 text-xs">
                <button
                  type="button"
                  onClick={() => setExpandedTurns(prev => ({ ...prev, [i]: !isOpen }))}
                  className="text-gray-400 transition-colors hover:text-gray-600"
                >
                  {isOpen ? 'Hide revision ↑' : 'Show revision ↓'}
                </button>
                {isOpen && (
                  <p className="mt-1 whitespace-pre-wrap rounded border border-gray-100 bg-white p-2 leading-relaxed text-gray-500">
                    {msg.content}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {barVisible && (
        <div className="mb-2">
          <GeneratingBar
            isGenerating={busy}
            estimatedDuration={barMode === 'apply' ? 22_000 : 9_000}
            statementInterval={3_500}
            statements={barMode === 'apply' ? APPLY_STATEMENTS : DISCUSS_STATEMENTS}
            onComplete={() => setBarVisible(false)}
          />
        </div>
      )}

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={e => {
          // Cmd/Ctrl+Enter = Discuss (brief). Plain Enter inserts a newline,
          // matching the multi-line textarea everywhere else in the app.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void fire('discuss')
          }
        }}
        rows={Math.min(6, Math.max(2, (message.match(/\n/g) || []).length + 2))}
        placeholder={placeholder ?? 'Ask about this section, or tell it what to change…'}
        disabled={busy}
        className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-green-600 focus:outline-none disabled:opacity-50"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/* Discuss is the visually default action (outline); Apply is styled
            as the stronger commit action (solid), per the brief. */}
        <button
          type="button"
          onClick={() => void fire('discuss')}
          disabled={busy || !message.trim()}
          className="rounded border border-green-700 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && busyMode === 'discuss' ? 'Discussing…' : 'Discuss'}
        </button>
        {!discussOnly && (
          <button
            type="button"
            onClick={() => void fire('apply')}
            disabled={busy || !message.trim()}
            className="rounded bg-green-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && busyMode === 'apply' ? 'Applying…' : 'Apply changes'}
          </button>
        )}
        <span className="text-xs text-gray-400">⌘/Ctrl+Enter = Discuss</span>
      </div>
    </div>
  )
}
