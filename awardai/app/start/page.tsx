'use client'
// app/start/page.tsx — Trial first-run activation route (spec: Trial-First-Run-BUILD-SPEC-2026-07-13.md)
//
// The converting moment for a solo indie trial: land here straight from Stripe
// checkout, upload a past award entry, and get a jury read + fixes in one flow.
//
// Scope (S158, deliberately thin):
//  - Inline score covers the dominant standard-creative path (evaluate-entry,
//    6-dimension jury), rendered via the reused EvalSummaryBar + a fix-list.
//  - AOY / config-mode / SMARTIES entries hand off to /projects/[id] (their
//    section-keyed results need the project-page canvas).
//  - Scorers/edge functions reused unchanged. Publicly model-agnostic.
//  - Show + category selection reuses the SAME ShowCombobox + category taxonomy
//    (lib/show-taxonomy) as the main Quick Eval workflow — no drift.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useEngagement } from '@/lib/useEngagement'
import { isAoyShow } from '@/lib/aoy-taxonomy'
import { resolveEntryForm } from '@/lib/entry-form'
import {
  CANONICAL_SHOWS, categoriesForShow, showHasNoCategoryConcept,
  showHasNoCategoryList, NO_CATEGORY_PLACEHOLDER, isSmartiesShow,
} from '@/lib/show-taxonomy'
import EvalSummaryBar, { type SummarySection } from '@/components/EvalSummaryBar'
import ShowCombobox from '@/components/ShowCombobox'
import { extractEntryText, safeFileName, fileExt } from '@/lib/extract-entry-text'

// ── minimal local types (mirror of the project page's Evaluation shape) ──────
type EvaluationScores = {
  strategic_clarity: number; insight: number; idea: number
  execution: number; results: number; jury_fit: number
}
type JudgeOutput = { talks_up?: string[]; kills_it?: string[]; recommendations?: string }
type Evaluation = {
  id: number
  overall_score: number
  scores: EvaluationScores
  strengths: string[]
  gaps: string[]
  recommendations: string
  evaluation_mode?: 'judge' | 'coach'
  output?: JudgeOutput | null
}

const SCORE_DIMENSIONS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'strategic_clarity', label: 'Strategic Clarity' },
  { key: 'insight', label: 'Insight' },
  { key: 'idea', label: 'Idea' },
  { key: 'execution', label: 'Execution' },
  { key: 'results', label: 'Results' },
  { key: 'jury_fit', label: 'Jury Fit' },
]

function nameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return stem || 'Untitled entry'
}

type Stage = 'idle' | 'working' | 'confirm' | 'scored' | 'handoff' | 'notext' | 'error'

// Bundled anonymized sample for the empty-handed fallback (spec §8 decision 2).
// PLACEHOLDER — Ben may swap in a real scrubbed entry. Fixed show/category so it
// always scores through the standard path.
const SAMPLE_URL = '/sample-entry.txt'
const SAMPLE_SHOW = 'Spikes Asia'
const SAMPLE_CATEGORY = 'Creative Effectiveness'

// Brand mark — identical to the app header (green square "S" + sl-serif wordmark).
function AppHeader() {
  return (
    <header className="border-b border-gray-200 bg-white py-4">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
          <span className="text-xs font-bold text-white">S</span>
        </div>
        <span className="sl-serif text-gray-900" style={{ fontSize: '1.2rem', letterSpacing: '-0.01em' }}>Shortlist</span>
      </div>
    </header>
  )
}

export default function StartPage() {
  const { user, loading: authLoading } = useAuth()
  const { track } = useEngagement(user?.id)
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const runningRef = useRef(false)

  const [projectId, setProjectId] = useState<number | null>(null)
  const [entryText, setEntryText] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [show, setShow] = useState('')
  const [category, setCategory] = useState('')
  const [detected, setDetected] = useState(false)
  const [handoffReason, setHandoffReason] = useState('')

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [projectName, setProjectName] = useState('')
  const [savingName, setSavingName] = useState(false)

  const landedRef = useRef(false)
  useEffect(() => {
    if (!user || landedRef.current) return
    landedRef.current = true
    track('first_run_landed', { source: 'checkout' })
  }, [user, track])

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  const resolveMyOrgId = useCallback(async (): Promise<string | null> => {
    // Canonical org resolution, same RPC the project page / Quick Eval use.
    const { data, error } = await supabase.rpc('get_my_org_id')
    if (error) { console.error('get_my_org_id failed', error); return null }
    return (data as string | null) ?? null
  }, [])

  // Is this a config-scored (weighted|qualitative) show? Mirrors resolveEntryFormFor
  // on the project page: find the canonical show_profiles key that prefixes the
  // free-text show, then defer to the shared resolveEntryForm helper.
  const resolveConfigMode = useCallback(async (showName: string, cat: string): Promise<'weighted' | 'qualitative' | null> => {
    const best = (showName ?? '').trim()
    if (!best || isAoyShow(best)) return null
    const { data: showRows } = await supabase
      .from('show_profiles').select('show_name').is('category_pattern', null)
    const bestLower = best.toLowerCase()
    const canonical = (showRows ?? [])
      .filter((r: { show_name?: string | null }) => typeof r.show_name === 'string' && bestLower.startsWith(r.show_name!.trim().toLowerCase()))
      .sort((a: { show_name?: string | null }, b: { show_name?: string | null }) => (b.show_name?.length ?? 0) - (a.show_name?.length ?? 0))[0]
    if (!canonical?.show_name) return null
    const spec = await resolveEntryForm(supabase, canonical.show_name, cat)
    if (spec && (spec.scoring_mode === 'weighted' || spec.scoring_mode === 'qualitative')) return spec.scoring_mode
    return null
  }, [])

  // ── main flow: upload → project → material → detect → confirm/handoff ───────
  const startFromFile = async (file: File) => {
    if (runningRef.current) return
    setError('')
    if (file.size > 10 * 1024 * 1024) { setError('File size must be under 10MB.'); return }
    const ext = fileExt(file.name)
    if (!['pdf', 'docx', 'txt'].includes(ext)) { setError('Only PDF, DOCX, and TXT files are supported.'); return }

    runningRef.current = true
    setStage('working')
    setProgress('Reading your entry…')
    track('first_run_upload_started', {})

    try {
      const { text, chartBlobs } = await extractEntryText(file, setProgress)
      if (!text.trim()) { setStage('notext'); runningRef.current = false; return }
      setEntryText(text)
      setDisplayName(file.name)

      const token = await getToken()
      if (!token) { router.replace('/login'); return }
      const orgId = await resolveMyOrgId()

      setProgress('Setting up your project…')
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .insert({
          campaign_name: nameFromFile(file.name),
          org_id: orgId,
          user_id: user?.id,
          status: 'draft',
          award_year: new Date().getFullYear(),
          target_shows: [],
        })
        .select('id')
        .single()
      if (projErr || !proj) { setError(projErr?.message || 'Could not set up your project.'); setStage('error'); runningRef.current = false; return }
      const pid = (proj as { id: number }).id
      setProjectId(pid)
      setProjectName(nameFromFile(file.name))

      setProgress('Uploading…')
      const key = `${pid}/${Date.now()}-${safeFileName(file.name)}`
      const { error: upErr } = await supabase.storage.from('project-materials').upload(key, file)
      if (upErr) { setError(upErr.message); setStage('error'); runningRef.current = false; return }

      const chartPaths: string[] = []
      for (const cb of chartBlobs) {
        const cpath = `${pid}/charts/${Date.now()}-page-${cb.pageNum}.jpg`
        const { error: cErr } = await supabase.storage.from('project-materials').upload(cpath, cb.blob, { contentType: 'image/jpeg' })
        if (!cErr) chartPaths.push(cpath)
      }

      const material = {
        name: file.name, path: key, type: ext, size: file.size,
        uploaded_at: new Date().toISOString(),
        extracted_text: text,
        ...(chartPaths.length ? { chart_image_paths: chartPaths } : {}),
      }
      const { error: saveErr } = await supabase.rpc('append_project_material', { p_project_id: pid, p_material: material })
      if (saveErr) { setError('The file uploaded but could not be saved. Please try again.'); setStage('error'); runningRef.current = false; return }

      setProgress('Detecting the show and category…')
      let detShow = ''
      let detCat = ''
      let detAoy = false
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detect-entry-context`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
            body: JSON.stringify({ text }),
          }
        )
        if (res.ok) {
          const d = await res.json()
          detShow = typeof d.show === 'string' ? d.show : ''
          detAoy = !!d.aoy || isAoyShow(detShow)
          if (!detAoy && typeof d.category === 'string') detCat = d.category
        }
      } catch (err) { console.warn('detect-entry-context failed', err) }

      setShow(detShow)
      setCategory(detAoy ? '' : (showHasNoCategoryConcept(detShow) ? NO_CATEGORY_PLACEHOLDER : detCat))
      setDetected(!!detShow || !!detCat)

      if (detAoy || isAoyShow(detShow)) {
        setHandoffReason('This looks like an Agency of the Year entry, which uses a guided category picker in the full workspace.')
        setStage('handoff')
        runningRef.current = false
        return
      }

      setStage('confirm')
      runningRef.current = false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStage('error')
      runningRef.current = false
    }
  }

  // ── score from the confirm step ─────────────────────────────────────────────
  const scoreIt = async () => {
    if (runningRef.current) return
    if (!projectId || !user) return
    const showT = show.trim()
    if (!showT) { setError('Please choose the award show this entry targeted.'); return }

    runningRef.current = true
    setError('')

    try {
      const token = await getToken()
      if (!token) { router.replace('/login'); return }
      const orgId = await resolveMyOrgId()

      // config-mode / SMARTIES / AOY → structured section scoring; hand off to the
      // project page's Quick Eval, which renders those natively.
      if (isAoyShow(showT)) {
        setHandoffReason('Agency of the Year entries use a guided category picker in the full workspace.')
        setStage('handoff'); runningRef.current = false; return
      }
      const smarties = isSmartiesShow(showT)
      const configMode = smarties ? null : await resolveConfigMode(showT, category.trim())
      if (smarties || configMode) {
        setHandoffReason('This show is scored section by section. Open the full workspace to run the jury read on it.')
        setStage('handoff'); runningRef.current = false; return
      }

      // ── standard path (evaluate-entry) ──
      setStage('working')
      setProgress('Setting up the evaluation…')
      const { data: newDir, error: dirErr } = await supabase
        .from('directions')
        .insert({
          project_id: projectId,
          org_id: orgId,
          created_by: user.id,
          name: category.trim() ? `${showT} — ${category.trim()}` : showT,
          best_show: showT,
          best_category: category.trim(),
          angle: 'Uploaded entry — direct evaluation',
          sort_order: 0,
        })
        .select()
        .single()
      if (dirErr || !newDir) { setError(dirErr?.message || 'Could not set up the evaluation.'); setStage('confirm'); runningRef.current = false; return }
      const dir = newDir as { id: number }

      const { data: draft, error: draftErr } = await supabase
        .from('entry_drafts')
        .insert({
          project_id: projectId,
          direction_id: dir.id,
          org_id: orgId,
          created_by: user.id,
          field_key: 'entry',
          field_label: 'Entry',
          version_a: entryText.slice(0, 50000),
          selected: 'a',
          award_show: showT,
          category: category.trim(),
          sort_order: 0,
        })
        .select()
        .single()
      if (draftErr || !draft) {
        await supabase.from('directions').delete().eq('id', dir.id)
        setError(draftErr?.message || 'Could not prepare the entry for scoring.'); setStage('confirm'); runningRef.current = false; return
      }

      setProgress('Reading it like a jury…')
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-entry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: projectId, direction_id: dir.id }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || `Evaluation error (${res.status}).`); setStage('confirm'); runningRef.current = false; return }
      if (!data.evaluation) { setError('The jury read did not come back. Please try again.'); setStage('confirm'); runningRef.current = false; return }

      const ev = data.evaluation as Evaluation
      setEvaluation(ev)
      track('first_run_score_shown', { project_id: projectId, direction_id: dir.id, show: showT })
      track('quick_eval_used', { project_id: projectId, direction_id: dir.id, show: showT })
      track('eval_completed', { project_id: projectId, direction_id: dir.id, mode: ev.evaluation_mode ?? 'judge', show: showT })
      setStage('scored')
      runningRef.current = false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
      setStage('confirm')
      runningRef.current = false
    }
  }

  const runSample = async () => {
    setError('')
    track('first_run_sample_used', {})
    try {
      const res = await fetch(SAMPLE_URL)
      if (!res.ok) { setError('Could not load the sample. Please upload your own entry.'); return }
      const blob = await res.blob()
      const file = new File([blob], 'sample-entry.txt', { type: 'text/plain' })
      await startFromFile(file)
      setShow(SAMPLE_SHOW)
      setCategory(SAMPLE_CATEGORY)
      setDetected(true)
    } catch {
      setError('Could not load the sample. Please upload your own entry.')
    }
  }

  const goToProject = (nextStep: string) => {
    if (!projectId) return
    track('first_run_nextstep_selected', { next: nextStep, project_id: projectId })
    router.push(`/projects/${projectId}`)
  }

  const saveNameAndOpen = async () => {
    if (!projectId) return
    setSavingName(true)
    const name = projectName.trim() || displayName || 'Untitled entry'
    await supabase.from('projects').update({ campaign_name: name }).eq('id', projectId)
    track('first_run_nextstep_selected', { next: 'save_as_project', project_id: projectId })
    router.push(`/projects/${projectId}`)
  }

  const skipToPlatform = () => {
    track('first_run_nextstep_selected', { next: 'skip_to_platform' })
    router.push('/projects')
  }

  const reset = () => {
    setStage('idle'); setError(''); setProgress('')
    setProjectId(null); setEntryText(''); setDisplayName(''); setShow(''); setCategory(''); setDetected(false)
    setEvaluation(null); setHandoffReason(''); setProjectName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── render ──────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen w-full bg-gray-100">
        <AppHeader />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    )
  }

  const summarySections: SummarySection[] = evaluation
    ? SCORE_DIMENSIONS.map(d => ({ key: d.key, label: d.label, score: evaluation.scores?.[d.key] ?? null }))
    : []
  const fixList = evaluation ? (evaluation.output?.kills_it?.length ? evaluation.output.kills_it : evaluation.gaps) : []
  const verdict = evaluation ? (evaluation.output?.recommendations || evaluation.recommendations || '') : ''

  const showIsAoy = isAoyShow(show)
  const showNoCat = showHasNoCategoryConcept(show)
  const catOptions = categoriesForShow(show)

  return (
    <div className="min-h-screen w-full bg-gray-100">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

        {/* idle / notext / error */}
        {(stage === 'idle' || stage === 'notext' || stage === 'error') && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">Welcome to Shortlist</h1>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Let&apos;s get you evaluating your first entry right away. Upload a past award entry below and we&apos;ll read it like a jury, then show you exactly where it wins and where it leaks points.
              </p>
            </div>

            <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-10 text-center transition-colors hover:border-green-600 hover:bg-green-50"
              >
                <span className="text-base font-medium text-gray-900">Drop a PDF, DOCX, or TXT here</span>
                <span className="text-xs text-gray-500">or tap to choose a file · max 10MB</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void startFromFile(f) }} />

              {stage === 'notext' && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  We couldn&apos;t read any text from that file. Try a text-based PDF or a DOCX, or score the sample below.
                </div>
              )}
              {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

              <div className="mt-5 text-center">
                <button type="button" onClick={() => void runSample()} className="text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
                  Don&apos;t have one to hand? Score a sample entry
                </button>
              </div>
            </div>

            {/* skip straight into the full platform / agency profile setup */}
            <div className="mt-5 rounded-xl border border-gray-200 bg-white px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">Rather dive straight in? Head into the full platform and set up your agency profile.</p>
              <button type="button" onClick={skipToPlatform} className="shrink-0 text-sm font-medium text-green-700 hover:text-green-800">
                Go to the platform →
              </button>
            </div>
          </>
        )}

        {/* working */}
        {stage === 'working' && (
          <div className="w-full rounded-xl border border-gray-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-green-700" />
            <p className="text-sm font-medium text-gray-700">{progress || 'Working…'}</p>
            <p className="mt-1 text-xs text-gray-400">This usually takes under a minute.</p>
          </div>
        )}

        {/* confirm — same ShowCombobox + category taxonomy as the main workflow */}
        {stage === 'confirm' && (
          <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <h2 className="text-base font-semibold text-gray-900">Which show is this entry for?</h2>
            <p className="mt-1 text-sm text-gray-500">
              {detected ? 'We detected this from your entry. Confirm or change it, then score.' : 'Choose the award show and category, then score.'}
              {displayName && <span className="mt-1 block truncate text-xs text-gray-400">{displayName}</span>}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Award Show</label>
                <ShowCombobox
                  value={show}
                  onChange={v => {
                    setShow(v)
                    setCategory(showHasNoCategoryConcept(v) ? NO_CATEGORY_PLACEHOLDER : '')
                    setDetected(false)
                  }}
                  options={CANONICAL_SHOWS}
                  placeholder="e.g. Cannes Lions, Spikes Asia, Effie APAC…"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-500">
                  Category{showHasNoCategoryList(show) ? ' (optional)' : ''}
                </label>
                {showIsAoy ? (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    Agency of the Year entries open in the full workspace, which has the guided category picker.
                  </p>
                ) : showNoCat ? (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    This show has one uniform nomination form — no category to choose.
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      list="start-categories"
                      value={category}
                      onChange={e => { setCategory(e.target.value); setDetected(false) }}
                      placeholder={catOptions.length > 0 ? 'e.g. Creative Effectiveness, Film Craft…' : 'Type a category if you know it (optional)'}
                      className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-green-600 focus:outline-none"
                    />
                    <datalist id="start-categories">
                      {catOptions.map((cat: string) => (<option key={cat} value={cat} />))}
                    </datalist>
                  </>
                )}
              </div>
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void scoreIt()} className="rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:flex-1">
                {showIsAoy ? 'Open the workspace' : 'Score it'}
              </button>
              <button type="button" onClick={reset} className="rounded px-4 py-2.5 text-sm text-gray-500 transition-colors hover:text-gray-900">
                Use a different file
              </button>
            </div>
          </div>
        )}

        {/* handoff */}
        {stage === 'handoff' && (
          <div className="w-full rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <p className="text-sm leading-relaxed text-gray-700">{handoffReason}</p>
            <p className="mt-2 text-sm text-gray-500">Your entry is uploaded and ready. Open the workspace to run the jury read.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => goToProject('handoff_open_workspace')} className="rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:flex-1">
                Open the workspace
              </button>
              <button type="button" onClick={reset} className="rounded px-4 py-2.5 text-sm text-gray-500 transition-colors hover:text-gray-900">
                Score a different entry
              </button>
            </div>
          </div>
        )}

        {/* scored — inline jury read (standard path) */}
        {stage === 'scored' && evaluation && (
          <>
            <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white px-5 pb-5">
              <EvalSummaryBar
                overallScore={evaluation.overall_score ?? null}
                verdict={verdict}
                sections={summarySections}
                strengths={evaluation.strengths}
                unattributedGaps={evaluation.gaps}
              />

              {(evaluation.output?.talks_up?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What the jury rates</p>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5">
                    {evaluation.output!.talks_up!.map((s, i) => (<li key={i} className="text-sm leading-snug text-gray-700">• {s}</li>))}
                  </ul>
                </div>
              )}

              {(fixList?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Where it leaks points</p>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5">
                    {fixList!.map((g, i) => (<li key={i} className="text-sm leading-snug text-gray-700">• {g}</li>))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-6">
              <p className="text-sm font-semibold text-gray-900">Save this as a project</p>
              <p className="mt-1 text-sm text-gray-600">Name it, then open the full breakdown to edit the entry, see section-by-section coaching, and re-run the jury.</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm transition-colors focus:border-green-600 focus:outline-none"
                />
                <button type="button" disabled={savingName} onClick={() => void saveNameAndOpen()} className="w-full rounded bg-green-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
                  {savingName ? 'Saving…' : 'Save & open full breakdown'}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row">
                <button type="button" onClick={reset} className="rounded border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 sm:w-auto">
                  Score another entry
                </button>
                <button type="button" onClick={() => { track('first_run_nextstep_selected', { next: 'start_fresh_entry' }); router.push('/projects/new') }} className="rounded border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 sm:w-auto">
                  Start a fresh entry
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
