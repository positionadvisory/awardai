'use client'
// components/IndieRead.tsx -- the Indie pre-read read page, client half.
//
// RENDERED FRESH, not forked from EvalBreakdown or ConfigEntryCanvas. Both of
// those declare a per-section `score: number` and one of them hides the
// rationale when the score is null, so a band-only payload renders nothing;
// editing either would change what every paying customer sees, which is a
// product decision with no business inside a TNO integration (T2 section 7).
// The vocabulary here is the read-pack's: Strongest, Strong, Solid, Needs
// detail, Blocking, Unproven chain.
//
// NO NUMBER REACHES THIS FILE. The bar width is a fixed value per BAND WORD,
// not a score in disguise: the payload carries no score, per section or
// overall, so there is nothing here to draw one from.
//
// The four band rows are NUMBERED 1 to 4. That is not decoration. The jury
// writes its gaps referring to "Section 3", and its own section list is the
// entry_drafts rows ordered by sort_order and filtered to a non-null weight,
// which is exactly these four in exactly this order. Numbering them lets the
// entrant resolve the reference. The alternative, rewriting "Section N" in the
// adjustment text to the criterion label, was rejected: it edits the model's
// own words on the surface that promises to show them.

import { useState, useRef } from 'react'
import GeneratingBar from '@/components/GeneratingBar'
import {
  SHAPE_NOT_GRADE_H, SHAPE_NOT_GRADE_BODY, READ_IS_OF_THE_DOCUMENT, READ_SUB,
  BAND_LEGEND, NO_SCORE_LINE, FOOTER_CHIP_A, ADJUSTMENTS_NOTE,
  adjustmentsHeading, tokenReused,
  STAGE2_CONTROL, STAGE2_CONTROL_NOTE, STAGE2_BUTTON, STAGE2_PROGRESS_H,
  STAGE2_ESTIMATE_MS, STAGE2_RESULT_H, STAGE2_FEE_NOTE, STAGE2_EMPTY,
  INDIE_DIRECTIONS_STATEMENTS,
  STAGE3_H, STAGE3_BUTTON, STAGE3_LOCKED_MARK, stage3Sub,
  CTA1_H, CTA1_BODY, CTA1_BUTTON, CTA2_H, CTA2_BODY, CTA2_LINK,
  CTA3_H, CTA3_BODY, CTA3_LINK,
  PROGRESS_ACCENT, PROGRESS_INTERVAL_MS,
} from '@/lib/indie-copy'

export type ReadBand = { key: string; label: string; band: string; rationale: string }

export type IndieReadData = {
  category_display: string
  entry_id: string | null
  created_at: string
  is_return_visit: boolean
  bands: ReadBand[]
  adjustments: string[]
  adjustment_count: number
  stage2_ready: boolean
  stage3_ready: boolean
  stage3_count: number
}

type AlsoFits = { category: string; why: string }
type Elsewhere = { show: string; category: string }

// Fixed per band word. Nothing computes these from anything: they are a picture
// of the word beside them, which is why the ladder is uneven and why Unproven
// chain sits with Needs detail rather than between two rungs. Inline styles
// because a dynamically-selected Tailwind class living in a lookup map gets
// purged from the served CSS even though the literal is in source.
const BAND_SHAPE: Record<string, { pct: number; fill: string; text: string }> = {
  'Strongest':      { pct: 90, fill: '#166534', text: '#166534' },
  'Strong':         { pct: 76, fill: '#15803d', text: '#15803d' },
  'Solid':          { pct: 60, fill: '#a16207', text: '#a16207' },
  'Needs detail':   { pct: 44, fill: '#b45309', text: '#b45309' },
  'Unproven chain': { pct: 40, fill: '#b45309', text: '#b45309' },
  'Blocking':       { pct: 16, fill: '#b91c1c', text: '#b91c1c' },
}
const BAND_FALLBACK = { pct: 50, fill: '#6b7280', text: '#374151' }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function IndieRead({ token, data, again }: { token: string; data: IndieReadData; again: boolean }) {
  const [alsoFits, setAlsoFits] = useState<AlsoFits[] | null>(null)
  const [stage2Loading, setStage2Loading] = useState(false)
  const [stage2Error, setStage2Error] = useState('')
  const stage2Ref = useRef(false)

  const [elsewhere, setElsewhere] = useState<Elsewhere[] | null>(null)
  const [stage3Loading, setStage3Loading] = useState(false)
  const [stage3Error, setStage3Error] = useState('')
  const stage3Ref = useRef(false)

  const signupHref = '/signup?token=' + token

  const runStage2 = async () => {
    if (stage2Ref.current) return
    stage2Ref.current = true
    setStage2Error('')
    setStage2Loading(true)
    try {
      const res = await fetch('/api/indie/directions/' + token, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.status !== 200) {
        setStage2Error(typeof json.error === 'string' ? json.error : 'That did not finish. Try it again in a moment.')
        stage2Ref.current = false
        return
      }
      const rows: AlsoFits[] = Array.isArray(json.also_fits) ? json.also_fits : []
      setAlsoFits(rows)
    } catch {
      setStage2Error('That did not finish. Try it again in a moment.')
      stage2Ref.current = false
    } finally {
      setStage2Loading(false)
    }
  }

  // Stage 3 GENERATES on its first call, 66 to 80 seconds, so it is a second
  // click and never part of the stage-1 wait. A cold token gets the locked
  // panel as a skeleton with a control, not a count it does not have.
  const runStage3 = async () => {
    if (stage3Ref.current) return
    stage3Ref.current = true
    setStage3Error('')
    setStage3Loading(true)
    try {
      const res = await fetch('/api/indie/elsewhere/' + token, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (res.status !== 200) {
        setStage3Error(typeof json.error === 'string' ? json.error : 'That did not finish. Try it again in a moment.')
        stage3Ref.current = false
        return
      }
      const rows: Elsewhere[] = Array.isArray(json.elsewhere) ? json.elsewhere : []
      setElsewhere(rows)
    } catch {
      setStage3Error('That did not finish. Try it again in a moment.')
      stage3Ref.current = false
    } finally {
      setStage3Loading(false)
    }
  }

  const showReturnLine = again || data.is_return_visit
  const dateStr = fmtDate(data.created_at)

  return (
    <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="mb-6">
        <h1 className="sl-serif text-gray-900" style={{ fontSize: '1.9rem', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
          {data.category_display}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{READ_SUB}</p>
        <p className="mt-1 text-xs text-gray-400">
          {dateStr}{data.entry_id ? ' · Entry ' + data.entry_id : ''}
        </p>
      </div>

      {showReturnLine && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-700">
          {tokenReused(dateStr)}
        </div>
      )}

      {/* Stage 1: the shape */}
      <section className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <h2 className="text-base font-semibold text-gray-900">{SHAPE_NOT_GRADE_H}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{SHAPE_NOT_GRADE_BODY}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{READ_IS_OF_THE_DOCUMENT}</p>

        <div className="mt-6 grid grid-cols-1 gap-6">
          {data.bands.map((b, i) => {
            const shape = BAND_SHAPE[b.band] ?? BAND_FALLBACK
            return (
              <div key={b.key}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-sm font-medium text-gray-900">{(i + 1) + '. ' + b.label}</p>
                  <p className="text-sm font-semibold sm:text-right" style={{ color: shape.text }}>{b.band}</p>
                </div>
                <div className="mt-2 w-full" style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: shape.pct + '%', height: '100%', backgroundColor: shape.fill, borderRadius: '2px' }} />
                </div>
                {b.rationale && <p className="mt-2 text-sm leading-relaxed text-gray-600">{b.rationale}</p>}
              </div>
            )
          })}
        </div>

        {/* The legend. If any block is cut for length it is this one, never the
            adjustments. */}
        <dl className="mt-7 grid grid-cols-1 gap-1.5 border-t border-gray-100 pt-5">
          {BAND_LEGEND.map(l => (
            <div key={l.band} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="text-xs font-semibold text-gray-700" style={{ minWidth: '112px' }}>{l.band}</dt>
              <dd className="text-xs text-gray-500">{l.meaning}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-xs leading-relaxed text-gray-400">{NO_SCORE_LINE}</p>
      </section>

      {/* The adjustments, at full weight. This entrant can still change
          everything, so these are the product and the bands are the argument
          for them. */}
      {data.adjustments.length > 0 && (
        <section className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="sl-serif text-gray-900" style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>
            {adjustmentsHeading(data.adjustment_count)}
          </h2>
          <ol className="mt-4 grid grid-cols-1 gap-4">
            {data.adjustments.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-sm font-semibold text-gray-400">{i + 1}</span>
                <span className="text-sm leading-relaxed text-gray-800">{a}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm leading-relaxed text-gray-500">{ADJUSTMENTS_NOTE}</p>
        </section>
      )}

      {/* Stage 2, a second click. 65 seconds of its own, which is longer than
          the read, so it is never inside the stage-1 wait. */}
      <section className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        {alsoFits === null ? (
          <>
            <h2 className="text-base font-semibold text-gray-900">{STAGE2_CONTROL}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{STAGE2_CONTROL_NOTE}</p>
            {stage2Loading ? (
              <div className="mt-5">
                <p className="text-sm text-gray-700">{STAGE2_PROGRESS_H}</p>
                <div className="mt-3">
                  <GeneratingBar
                    isGenerating
                    statements={INDIE_DIRECTIONS_STATEMENTS}
                    estimatedDuration={STAGE2_ESTIMATE_MS}
                    statementInterval={PROGRESS_INTERVAL_MS}
                    accent={PROGRESS_ACCENT}
                    randomizeStart={false}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void runStage2()}
                className="mt-4 rounded border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-green-600 hover:text-green-700"
              >
                {STAGE2_BUTTON}
              </button>
            )}
            {stage2Error && <p className="mt-3 text-sm text-red-700">{stage2Error}</p>}
          </>
        ) : alsoFits.length === 0 ? (
          <>
            <h2 className="text-base font-semibold text-gray-900">{STAGE2_RESULT_H}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{STAGE2_EMPTY}</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-900">{STAGE2_RESULT_H}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3">
              {alsoFits.map((f, i) => (
                <li key={i} className="text-sm leading-relaxed text-gray-800">
                  <span className="font-medium text-gray-900">{f.category}</span>
                  {f.why ? <span className="text-gray-600">{' · ' + f.why}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-gray-500">{STAGE2_FEE_NOTE}</p>
          </>
        )}
      </section>

      {/* Stage 3, locked. Show and category only: a locked panel that leaks one
          sentence of rationale is a free sample of the paid product, and the
          entrant reads the sample instead of buying. */}
      <section className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <h2 className="text-base font-semibold text-gray-900">{STAGE3_H}</h2>
        {elsewhere === null ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-2" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <div style={{ height: '10px', width: (58 - i * 9) + '%', backgroundColor: '#e5e7eb', borderRadius: '2px' }} />
                  <span className="text-xs text-gray-300">{STAGE3_LOCKED_MARK}</span>
                </div>
              ))}
            </div>
            {stage3Loading ? (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void runStage3()}
                className="mt-4 rounded border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-green-600 hover:text-green-700"
              >
                {STAGE2_BUTTON}
              </button>
            )}
            {stage3Error && <p className="mt-3 text-sm text-red-700">{stage3Error}</p>}
          </>
        ) : elsewhere.length === 0 ? null : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{stage3Sub(elsewhere.length)}</p>
            <ul className="mt-4 grid grid-cols-1 gap-2.5">
              {elsewhere.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-800">
                  <span className="font-medium text-gray-900">{e.show}</span>
                  <span className="text-gray-500">{'· ' + e.category}</span>
                  <span className="text-xs text-gray-300">{STAGE3_LOCKED_MARK}</span>
                </li>
              ))}
            </ul>
            <a
              href={signupHref}
              className="mt-5 inline-block rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              {STAGE3_BUTTON}
            </a>
          </>
        )}
      </section>

      {/* The three CTAs, in this order. The trial is first because it is the
          only one that converts, and burying it under the articles would be coy
          rather than restrained. */}
      <section className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <h2 className="text-base font-semibold text-gray-900">{CTA1_H}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{CTA1_BODY}</p>
        <a
          href={signupHref}
          className="mt-4 inline-block rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          {CTA1_BUTTON}
        </a>

        <div className="mt-7 border-t border-gray-100 pt-6">
          <h2 className="text-base font-semibold text-gray-900">{CTA2_H}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{CTA2_BODY}</p>
          <a href="/articles" className="mt-3 inline-block text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
            {CTA2_LINK}
          </a>
        </div>

        <div className="mt-7 border-t border-gray-100 pt-6">
          <h2 className="text-base font-semibold text-gray-900">{CTA3_H}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{CTA3_BODY}</p>
          <a href="/indie" className="mt-3 inline-block text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
            {CTA3_LINK}
          </a>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500">{FOOTER_CHIP_A}</span>
        <span className="text-xs text-gray-400">gotshortlisted.com</span>
      </div>
    </main>
  )
}
