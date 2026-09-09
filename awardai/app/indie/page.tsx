'use client'
// app/indie/page.tsx -- the free anonymous Indie Awards pre-read landing page.
//
// A fork of /start with the auth removed. The entrant has no account, is never
// asked for one, and no card is requested anywhere on this page: that sentence
// is in the consent block, so it is a commitment rather than a description.
//
// TWO BRANCHES, ONE PAGE. /indie opens on a category picker, because no
// AwardStage surface confirmed to work can carry a per-category parameter (T5
// section 0a: both email templates and the Support Text field are account-wide).
// /indie?cat=<slug> skips the picker and confirms instead, which is the path our
// own "could not read your file" email uses today and the entry-form Link
// element would use if it ever passes QA.
//
// THE CATEGORY CONFIG IS FETCHED, NEVER HARDCODED. GET /api/indie/categories
// reads the same show_profiles rows the jury scores against, so the labels and
// word limits on this page cannot drift from the rubric being scored. A category
// with launch_ready false is not listed and cannot be reached by guessing its
// slug: today that is lifestyle-b2c-pr, whose first box has no word limit
// recorded, and T5 forbids launching a category with a guessed number on screen.
//
// Query params are read from window.location.search inside an effect. NOT
// useSearchParams: that needs a Suspense boundary and fails the build without
// one (App-Platform, client patterns).

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import GeneratingBar from '@/components/GeneratingBar'
import { extractEntryText, fileExt } from '@/lib/extract-entry-text'
import {
  LANDING_H1, LANDING_SUB, PICKER_H, PICKER_PLACEHOLDER, PICKER_NOTE,
  CONFIRM_CHANGE, BOXES_H, BACKGROUND_LABEL, BACKGROUND_NOTE,
  ENTRY_ID_LABEL, ENTRY_ID_NOTE, ENTRY_ID_PLACEHOLDER,
  EMAIL_LABEL, EMAIL_NOTE, CONSENT_CHECKBOX, CONSENT_BLOCK,
  SUBMIT_LABEL, SUBMIT_SUB,
  PDF_TOGGLE, PDF_NOTE, PDF_SUBMIT_LABEL, PDF_SENT_H, PDF_SENT_CAVEAT, PDF_FILE_HINT,
  PROGRESS_H, PROGRESS_ESTIMATE_MS, PROGRESS_ACCENT, PROGRESS_INTERVAL_MS,
  PROGRESS_OVERRUN, PROGRESS_OVERRUN_AFTER_MS,
  INDIE_READ_STATEMENTS, INDIE_PDF_STATEMENTS,
  QUEUE_DAILY_CAP, QUEUE_IP_THROTTLE, READ_FAILED,
  INDIE_SRC_ABSENT, INDIE_VALID_SRC,
  confirmLine, boxesNote, countUnder, countOver, pdfSentBody, pdfNoTextInline, pdfNoSectionsInline,
} from '@/lib/indie-copy'

type Box = { key: string; label: string; word_limit: number | null; guidance: string }
type Background = { key: string; label: string; word_limit: number | null } | null
type Category = {
  slug: string
  display: string
  boxes: Box[]
  background: Background
  launch_ready: boolean
}

type Stage = 'form' | 'working' | 'pdf_sent' | 'notext'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_EXTS = ['pdf', 'docx']

// How long the upload path stays on the progress screen before it hands off to
// the "On its way" screen. NOT zero, which is what shipped: the handoff screen
// promises "the link lands in your inbox in about two minutes", and a request
// that fails in six seconds made that promise before the server had answered.
// A definite failure arrives well inside this window and never shows it; a real
// read passes through it and the entrant is still released early, which is what
// PDF_NOTE commits to. Under a minute stays true of the screen it is written on.
const PDF_HANDOFF_AFTER_MS = 12000

// The server's own refusal, mirrored client-side so an all-empty paste costs
// neither a round trip nor one of the six hourly throttle slots (the attempts
// row is written before the edge call, so a validation 400 spends one). The
// server check remains the gate; this is a convenience. Inline rather than in
// lib/indie-copy.ts because it is not T5 copy: it is this route's own string,
// and page.tsx already holds the other validation messages.
const PASTE_ALL_EMPTY = 'Paste at least one of the four sections.'

function wordCount(s: string): number {
  const t = s.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

// Ascii-only character class on purpose: a /u flag or a \p{...} escape fails
// the Vercel build under this repo's downlevel target (App-Platform, S138).
function normEntryId(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40)
}

function AppHeader() {
  return (
    <header className="border-b border-gray-200 bg-white py-4">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
          <span className="text-xs font-bold text-white">S</span>
        </div>
        <span className="sl-serif text-gray-900" style={{ fontSize: '1.2rem', letterSpacing: '-0.01em' }}>Shortlist</span>
      </div>
    </header>
  )
}

export default function IndiePreReadPage() {
  const router = useRouter()

  const [cats, setCats] = useState<Category[] | null>(null)
  const [catsFailed, setCatsFailed] = useState(false)
  const [slug, setSlug] = useState('')
  const [landingCode, setLandingCode] = useState(INDIE_SRC_ABSENT)

  const [sections, setSections] = useState<Record<string, string>>({})
  const [background, setBackground] = useState('')
  const [entryId, setEntryId] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)

  const [stage, setStage] = useState<Stage>('form')
  const [error, setError] = useState('')
  const [consentError, setConsentError] = useState('')
  const [refusal, setRefusal] = useState('')
  // Which notext screen to render: '' / 'no_text_in_file' (the scan/image
  // case, and the default for an older server response with no reason at
  // all) or 'no_sections_in_file' (readable, but none of the four scored
  // sections are in it). Reset on every new submission so a stale reason
  // from a prior upload cannot leak onto this one.
  const [notextReason, setNotextReason] = useState('')
  const [overrun, setOverrun] = useState(false)
  const [statements, setStatements] = useState<string[]>(INDIE_READ_STATEMENTS)

  const [showPdf, setShowPdf] = useState(false)
  const [pdfStage, setPdfStage] = useState('')
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const runningRef = useRef(false)
  const handoffRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A pending handoff must not outlive the page: it would call setStage after
  // the redirect has already unmounted this component.
  useEffect(() => {
    return () => { if (handoffRef.current) clearTimeout(handoffRef.current) }
  }, [])

  // ── Category config, and the two URL parameters ────────────────────────────
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await fetch('/api/indie/categories', { cache: 'no-store' })
        const data = await res.json()
        if (!live) return
        const rows: Category[] = Array.isArray(data.categories) ? data.categories : []
        const open = rows.filter(c => c.launch_ready && c.boxes.length === 4)
        setCats(open)

        const qs = new URLSearchParams(window.location.search)
        const s = (qs.get('s') ?? '').trim()
        if (INDIE_VALID_SRC.indexOf(s) !== -1) setLandingCode(s)
        const cat = (qs.get('cat') ?? '').trim()
        // An excluded or not-yet-open category falls back to the picker rather
        // than erroring: the entrant did not type this link, and a dead end on
        // a partner's link is worse than one extra click.
        if (cat && open.some(c => c.slug === cat)) setSlug(cat)
      } catch {
        if (live) { setCats([]); setCatsFailed(true) }
      }
    })()
    return () => { live = false }
  }, [])

  // ── The 90-second truthful failure state ───────────────────────────────────
  useEffect(() => {
    if (stage !== 'working') { setOverrun(false); return }
    const t = setTimeout(() => setOverrun(true), PROGRESS_OVERRUN_AFTER_MS)
    return () => clearTimeout(t)
  }, [stage])

  const selected = cats?.find(c => c.slug === slug) ?? null

  const setSection = useCallback((key: string, v: string) => {
    setSections(prev => ({ ...prev, [key]: v }))
  }, [])

  function gate(): boolean {
    setError(''); setRefusal(''); setNotextReason('')
    if (!selected) { setError('Choose your category first.'); return false }
    if (!email.trim()) { setError('A work email is needed so the read can reach you.'); return false }
    if (!consent) { setConsentError('Tick the box to confirm you have read how this works.'); return false }
    setConsentError('')
    return true
  }

  // Reads the refusal apart. Two 429 reasons, two different strings: the daily
  // ceiling is "come back tomorrow", the per-caller throttle is "this
  // connection". Showing the queue string for a throttle would tell somebody on
  // a shared office IP that the whole service is full when it is not.
  function handleRefusal(status: number, data: Record<string, unknown>): boolean {
    if (status === 429) {
      setRefusal(data.reason === 'ip_throttle' ? QUEUE_IP_THROTTLE : QUEUE_DAILY_CAP)
      return true
    }
    // A 5xx is ours, not the entrant's, so we name it ourselves rather than
    // show whatever the upstream chain happened to say: production rendered
    // the server's own "Could not finish the read.", which is terse and never
    // says nothing was used up (T7e, 9 Sep 2026). 504 is excluded: it is not
    // a failure on the upload path (submitFile checks it before calling this
    // function, so it never reaches here from there), and this same function
    // also serves the paste path, which has no such carve-out.
    if (status >= 500 && status !== 504) {
      setError(READ_FAILED)
      return true
    }
    if (status >= 400) {
      setError(typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.')
      return true
    }
    return false
  }

  // ── Paste path ─────────────────────────────────────────────────────────────
  const submitPaste = async () => {
    if (runningRef.current) return
    if (!gate() || !selected) return
    // Refused locally, with the server's own words. Four empty boxes is the one
    // invalid paste the client can be certain about, and letting it through
    // costs the entrant six seconds and a throttle slot to be told so.
    const anyFilled = selected.boxes.some(b => (sections[b.key] ?? '').trim().length > 0)
    if (!anyFilled) { setError(PASTE_ALL_EMPTY); return }
    // Set synchronously, before any await: disabled={state} does not close a
    // double-click race, and a duplicate fire here spends a model call.
    runningRef.current = true
    setStatements(INDIE_READ_STATEMENTS)
    setStage('working')
    try {
      const res = await fetch('/api/indie/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_path: 'paste',
          category_slug: selected.slug,
          email: email.trim(),
          entry_id: entryId ? entryId : undefined,
          landing_code: landingCode,
          sections,
          background: background.trim() ? background.trim() : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (handleRefusal(res.status, data)) { setStage('form'); runningRef.current = false; return }
      // section_alignment_warnings above zero means the jury's section order
      // stopped matching the spec's sort_order, so a band may be attached to
      // the wrong criterion. That is worse than no read, so the page refuses
      // and the number is logged as a backend defect rather than rendered.
      const warnings = typeof data.section_alignment_warnings === 'number' ? data.section_alignment_warnings : 0
      if (warnings > 0) {
        console.error('[indie] section_alignment_warnings', warnings, 'on', data.token)
        setError(READ_FAILED)
        setStage('form'); runningRef.current = false; return
      }
      const token = typeof data.token === 'string' ? data.token : ''
      if (!token) {
        setError('Something went wrong. Please try again.')
        setStage('form'); runningRef.current = false; return
      }
      // reused means the cap key already held a read. The read page needs to
      // know, because on a first view of that older read read_count is still 0
      // and is_return_visit alone would render the wrong copy.
      router.push('/indie/r/' + token + (data.reused === true ? '?again=1' : ''))
    } catch {
      setError('Something went wrong. Please try again.')
      setStage('form')
      runningRef.current = false
    }
  }

  // ── Upload path ────────────────────────────────────────────────────────────
  // Every outcome now resolves to exactly one visible end state: the notext
  // screen, the refusal box, a redirect, the "On its way" screen, or the form
  // carrying an error. What shipped handled only notext, 429 and a token, and
  // everything else fell through to a bare runningRef reset that left the
  // entrant sitting on "On its way ... the link lands in your inbox in about
  // two minutes" with no email ever coming. That covered every 400
  // (INDIEREAD-EMAIL, INDIEREAD-NOCAT, INDIEREAD-EMPTY), both edge 502s
  // (INDIEREAD-SEGMENT, INDIEREAD-EVAL), any 500, a non-JSON upstream body and
  // a thrown fetch. The paste path was already correct on all of them.
  //
  // 504 IS NOT A FAILURE ON THIS PATH, and this is the one place this handler
  // must not follow the paste path. The route aborts its edge call at 110s and
  // returns INDIE-TIMEOUT, but the edge function is still running and still
  // sends the email: that is the documented two-minute upload flow, not a
  // fault. So a 504 resolves to the handoff screen, where the inbox promise is
  // true. Showing READ_FAILED there would tell an entrant the read died while
  // it was on its way to them, and READ_FAILED also claims nothing was used
  // up, which a completing read makes false.
  const submitFile = async (file: File) => {
    if (runningRef.current) return
    if (!gate() || !selected) return
    if (file.size > MAX_UPLOAD_BYTES) { setError('File size must be under 10MB.'); return }
    if (UPLOAD_EXTS.indexOf(fileExt(file.name)) === -1) {
      setError('Send a PDF or a Word document, or paste the sections instead.')
      return
    }
    // A zero-byte file cannot contain text, so it is answered here instead of
    // spending a throttle slot on a request whose result is already known. It
    // lands on the notext screen because that screen already says the true
    // thing: no readable text, paste instead, nothing used up. Empty EXTRACTED
    // text is deliberately NOT guarded this way. That is the scan case, and it
    // has to reach the server so the notext email goes out.
    if (file.size === 0) { setFilename(file.name); setNotextReason('no_text_in_file'); setStage('notext'); return }

    runningRef.current = true
    setFilename(file.name)
    setStatements(INDIE_PDF_STATEMENTS)
    setStage('working')
    if (handoffRef.current) clearTimeout(handoffRef.current)
    handoffRef.current = setTimeout(() => setStage('pdf_sent'), PDF_HANDOFF_AFTER_MS)

    // One exit door. Cancels a pending handoff, applies the end state, and
    // releases the double-click guard, so no branch can forget any of the
    // three. The redirect is the only path that does not use it, because it
    // leaves the page.
    const settle = (apply: () => void) => {
      if (handoffRef.current) { clearTimeout(handoffRef.current); handoffRef.current = null }
      apply()
      runningRef.current = false
    }

    try {
      // The file is read in the browser and never uploaded anywhere. Only the
      // extracted text is sent, which is what the consent block promises.
      // The Indie path never uses chart-page image blobs, and rendering them
      // needs requestAnimationFrame, which a hidden tab never fires (T7e).
      const { text } = await extractEntryText(file, setPdfStage, { skipChartPages: true })

      const res = await fetch('/api/indie/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_path: 'pdf',
          category_slug: selected.slug,
          email: email.trim(),
          entry_id: entryId ? entryId : undefined,
          landing_code: landingCode,
          extracted_text: text,
          filename: file.name,
        }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))

      // Read in this order deliberately. The timeout is checked before any
      // failure branch because it is not one, and notext before the generic
      // 4xx reader because it is a result rather than a refusal.
      if (res.status === 504) { settle(() => setStage('pdf_sent')); return }
      if (data.status === 'notext') {
        settle(() => {
          setNotextReason(typeof data.reason === 'string' ? data.reason : '')
          setStage('notext')
        })
        return
      }
      if (handleRefusal(res.status, data)) { settle(() => setStage('form')); return }

      // Same refusal as the paste path: a section_alignment_warnings count
      // above zero means a band may be attached to the wrong criterion, which
      // is worse than no read at all.
      const warnings = typeof data.section_alignment_warnings === 'number' ? data.section_alignment_warnings : 0
      if (warnings > 0) {
        console.error('[indie] section_alignment_warnings', warnings, 'on', data.token)
        settle(() => { setError(READ_FAILED); setStage('form') })
        return
      }

      const token = typeof data.token === 'string' ? data.token : ''
      if (!token) {
        // A 2xx with no token and no notext status. Nothing to redirect to and
        // nothing was promised, so it is a failure rather than a handoff.
        console.error('[indie] upload returned no token', res.status, data.code)
        settle(() => { setError(READ_FAILED); setStage('form') })
        return
      }
      if (handoffRef.current) { clearTimeout(handoffRef.current); handoffRef.current = null }
      router.push('/indie/r/' + token + (data.reused === true ? '?again=1' : ''))
    } catch {
      // extractEntryText swallows its own failures and returns empty text, so
      // this is the fetch: a dropped connection, or the browser giving up. We
      // cannot know whether the read started. READ_FAILED is the safer of the
      // two wrong answers available: if the read did complete, the entrant gets
      // an email they were not promised, and re-running the same entry ID
      // returns that same read rather than spending another. The handoff screen
      // would instead promise an email that may never arrive.
      settle(() => { setError(READ_FAILED); setStage('form') })
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  if (stage === 'working') {
    return (
      <div className="min-h-screen w-full bg-gray-100">
        <AppHeader />
        <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <h1 className="sl-serif text-gray-900" style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>{PROGRESS_H}</h1>
            <div className="mt-5">
              <GeneratingBar
                isGenerating
                statements={statements}
                estimatedDuration={PROGRESS_ESTIMATE_MS}
                statementInterval={PROGRESS_INTERVAL_MS}
                accent={PROGRESS_ACCENT}
                randomizeStart={false}
              />
            </div>
            {pdfStage && <p className="mt-3 text-xs text-gray-400">{pdfStage}</p>}
            {overrun && <p className="mt-4 text-sm leading-relaxed text-gray-600">{PROGRESS_OVERRUN}</p>}
          </div>
        </main>
      </div>
    )
  }

  if (stage === 'pdf_sent' || stage === 'notext') {
    return (
      <div className="min-h-screen w-full bg-gray-100">
        <AppHeader />
        <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            {stage === 'pdf_sent' ? (
              <>
                <h1 className="sl-serif text-gray-900" style={{ fontSize: '1.6rem', lineHeight: 1.2 }}>{PDF_SENT_H}</h1>
                <p className="mt-4 text-sm leading-relaxed text-gray-700">{pdfSentBody(filename, email.trim())}</p>
                <p className="mt-4 text-sm leading-relaxed text-gray-500">{PDF_SENT_CAVEAT}</p>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-gray-700">
                  {notextReason === 'no_sections_in_file'
                    ? pdfNoSectionsInline(filename, selected?.display ?? 'your category')
                    : pdfNoTextInline(filename)}
                </p>
                <button
                  type="button"
                  onClick={() => { setStage('form'); setShowPdf(false) }}
                  className="mt-5 rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                >
                  {SUBMIT_LABEL}
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gray-100">
      <AppHeader />
      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">

        <div className="mb-6">
          <h1 className="sl-serif text-gray-900" style={{ fontSize: '1.9rem', lineHeight: 1.15, letterSpacing: '-0.01em' }}>{LANDING_H1}</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{LANDING_SUB}</p>
        </div>

        {/* Category: picker branch, or the confirmation branch */}
        <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          {selected ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="text-base font-semibold text-gray-900">{confirmLine(selected.display)}</p>
              <button
                type="button"
                onClick={() => { setSlug(''); setSections({}) }}
                className="text-left text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800 sm:text-right"
              >
                {CONFIRM_CHANGE}
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="indie-cat" className="block text-base font-semibold text-gray-900">{PICKER_H}</label>
              <select
                id="indie-cat"
                value={slug}
                onChange={e => { setSlug(e.target.value); setSections({}) }}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 transition-colors focus:border-green-600 focus:outline-none"
              >
                <option value="">{PICKER_PLACEHOLDER}</option>
                {(cats ?? []).map(c => (<option key={c.slug} value={c.slug}>{c.display}</option>))}
              </select>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{PICKER_NOTE}</p>
              {catsFailed && (
                <p className="mt-3 text-sm text-gray-600">The category list did not load. Reload the page and it should come back.</p>
              )}
            </>
          )}
        </div>

        {/* The four boxes, the fifth optional one, then the keys and the gate */}
        {selected && (
          <>
            <div className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
              <h2 className="text-base font-semibold text-gray-900">{BOXES_H}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{boxesNote(selected.display)}</p>

              <div className="mt-5 grid grid-cols-1 gap-5">
                {selected.boxes.map((b, i) => {
                  const val = sections[b.key] ?? ''
                  const n = wordCount(val)
                  const limit = b.word_limit ?? 0
                  const over = limit > 0 && n > limit
                  return (
                    <div key={b.key}>
                      <label htmlFor={'box-' + b.key} className="block text-sm font-medium text-gray-900">
                        {(i + 1) + '. ' + b.label}
                      </label>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {limit > 0 ? limit + ' words on the entry form · ' : ''}
                        {/* Over the limit is a NOTE, never an error and never a
                            block: the entrant may be pasting a draft they mean
                            to cut, and a red state on a tool they did not ask
                            for is a bounce. */}
                        <span style={{ color: over ? '#92400e' : undefined }}>
                          {limit > 0 ? (over ? countOver(n, limit) : countUnder(n, limit)) : n + ' words'}
                        </span>
                      </p>
                      <textarea
                        id={'box-' + b.key}
                        value={val}
                        onChange={e => setSection(b.key, e.target.value)}
                        rows={5}
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 transition-colors focus:border-green-600 focus:outline-none"
                      />
                    </div>
                  )
                })}

                {selected.background && (
                  <div>
                    <label htmlFor="box-background" className="block text-sm font-medium text-gray-900">{BACKGROUND_LABEL}</label>
                    <p className="mt-0.5 text-xs text-gray-400">{BACKGROUND_NOTE}</p>
                    <textarea
                      id="box-background"
                      value={background}
                      onChange={e => setBackground(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 transition-colors focus:border-green-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* The entry ID sits directly under the boxes and above the email,
                  deliberately. It is the cap key: without it the fallback is
                  email plus category, so a second entry in the SAME category
                  from this address returns the first read. */}
              <div className="mt-6 grid grid-cols-1 gap-5">
                <div>
                  <label htmlFor="indie-entry-id" className="block text-sm font-medium text-gray-900">{ENTRY_ID_LABEL}</label>
                  <p className="mt-0.5 text-xs text-gray-400">{ENTRY_ID_NOTE}</p>
                  <input
                    id="indie-entry-id"
                    type="text"
                    value={entryId}
                    onChange={e => setEntryId(normEntryId(e.target.value))}
                    placeholder={ENTRY_ID_PLACEHOLDER}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-green-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="indie-email" className="block text-sm font-medium text-gray-900">{EMAIL_LABEL}</label>
                  <p className="mt-0.5 text-xs text-gray-400">{EMAIL_NOTE}</p>
                  <input
                    id="indie-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 transition-colors focus:border-green-600 focus:outline-none"
                  />
                </div>
              </div>

              <label className="mt-6 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => { setConsent(e.target.checked); if (e.target.checked) setConsentError('') }}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-green-800 focus:ring-green-600"
                />
                <span className="text-sm text-gray-900">{CONSENT_CHECKBOX}</span>
              </label>
              {consentError && <p className="mt-1.5 text-red-700" style={{ fontSize: '13px' }}>{consentError}</p>}

              <p className="mt-4 text-sm leading-relaxed text-gray-500">{CONSENT_BLOCK}</p>

              {refusal && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">{refusal}</div>
              )}
              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="button"
                onClick={() => void submitPaste()}
                className="mt-5 w-full rounded bg-green-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                {SUBMIT_LABEL}
              </button>
              <p className="mt-2 text-center text-xs text-gray-400">{SUBMIT_SUB}</p>
            </div>

            {/* The upload path, visually secondary and never a tab of equal
                weight. Two thirds of 2026 entrants uploaded rather than typed,
                so it is not an edge case, but it is the slow one and the copy
                says so before the click. */}
            <div className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6">
              {!showPdf ? (
                <button
                  type="button"
                  onClick={() => setShowPdf(true)}
                  className="text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800"
                >
                  {PDF_TOGGLE}
                </button>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-900">{PDF_TOGGLE}</p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{PDF_NOTE}</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="mt-4 block w-full text-sm text-gray-600"
                  />
                  <p className="mt-1 text-xs text-gray-400">{PDF_FILE_HINT}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const f = fileRef.current?.files?.[0]
                      if (!f) { setError('Choose a file first, or paste the sections instead.'); return }
                      void submitFile(f)
                    }}
                    className="mt-4 rounded border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-green-600 hover:text-green-700"
                  >
                    {PDF_SUBMIT_LABEL}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
