'use client'
// app/start/page.tsx — Trial first-run activation route (spec: Trial-First-Run-BUILD-SPEC-2026-07-13.md)
//
// The converting moment for a solo indie trial: land here straight from Stripe
// checkout, drop in a past award entry, and get a jury read + fixes in one
// screen, no Ben call. Checkout success_url points here (was /settings/billing).
//
// Scope (S158, deliberately thin — see the close notes and the planned
// projects/[id] refactor):
//  - The INLINE score on /start covers the dominant standard-creative path
//    (evaluate-entry, 6-dimension jury). Its result render reuses EvalSummaryBar
//    (the one cleanly-reusable eval component) plus a visible fix-list.
//  - AOY / config-mode (weighted|qualitative) / SMARTIES entries are section-
//    keyed and need the project page's native canvas to render. /start still
//    creates the project, uploads the entry, and detects the show, then hands
//    off to /projects/[id] where the existing Quick Eval scores them with the
//    right UI. Extending inline render to those is cheap once the project page's
//    eval render is componentized (future refactor), not this build.
//  - Scorers/edge functions are reused unchanged (byte-frozen). No new scoring
//    logic. detect-entry-context / evaluate-entry / append_project_material are
//    called exactly as the Materials-tab Quick Eval calls them.
//  - Publicly model-agnostic: the model name is never surfaced here.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useEngagement } from '@/lib/useEngagement'
import { isAoyShow } from '@/lib/aoy-taxonomy'
import { resolveEntryForm } from '@/lib/entry-form'
import EvalSummaryBar, { type SummarySection } from '@/components/EvalSummaryBar'
import { extractEntryText, safeFileName, fileExt } from '@/lib/extract-entry-text'

// ── minimal local types (mirror of the project page's Evaluation shape) ──────
type EvaluationScores = {
  strategic_clarity: number; insight: number; idea: number
  execution: number; results: number; jury_fit: number
}
type JudgeOutput = {
  talks_up?: string[]; kills_it?: string[]; recommendations?: string
}
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

// SMARTIES detection — byte-aligned with the copies in the edge fns + page.
function isSmartiesShow(showName: string | null | undefined): boolean {
  return (showName ?? '').trim().toLowerCase().includes('smarties')
}

function nameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return stem || 'Untitled entry'
}

type Stage = 'idle' | 'working' | 'confirm' | 'scored' | 'handoff' | 'notext' | 'error'

// A bundled, anonymized sample so an empty-handed user still hits the aha this
// session. PLACEHOLDER content — Ben to swap in a real scrubbed entry if desired
// (spec §8 decision 2). Its show/category are fixed so the sample always scores
// through the standard path without depending on detection.
const SAMPLE_URL = '/sample-entry.txt'
const SAMPLE_SHOW = 'Spikes Asia'
const SAMPLE_CATEGORY = 'Creative Effectiveness'

export default function StartPage() {
  const { user, loading: authLoading } = useAuth()
  const { track } = useEngagement(user?.id)
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const runningRef = useRef(false)

  // carried through the flow
  const [projectId, setProjectId] = useState<number | null>(null)
  const [entryText, setEntryText] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [show, setShow] = useState('')
  const [category, setCategory] = useState('')
  const [handoffReason, setHandoffReason] = useState('')

  // result
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [directionId, setDirectionId] = useState<number | null>(null)

  // save-as-project naming
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

  // Resolve a non-AOY show's config entry_form (mirror of resolveEntryFormFor on
  // the project page). Used only to decide whether an entry is config-scored and
  // therefore needs the project-page canvas rather than the inline standard path.
  const resolveConfigMode = useCallback(async (showName: string, cat: string): Promise<'weighted' | 'qualitative' | null> => {
    const best = (showName ?? '').trim()
    if (!best || isAoyShow(best)) return null
    // Detected show is free text; find the canonical show_profiles key whose
    // name prefixes it (same canonical-resolution step as resolveEntryFormFor on
    // the project page), then defer to the shared resolveEntryForm helper.
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

      // starter project (client insert; project creation is a client insert
      // guarded by the enforce_project_limit trigger — a fresh trial is under cap)
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

      // upload original
      setProgress('Uploading…')
      const key = `${pid}/${Date.now()}-${safeFileName(file.name)}`
      const { error: upErr } = await supabase.storage.from('project-materials').upload(key, file)
      if (upErr) { setError(upErr.message); setStage('error'); runningRef.current = false; return }

      // upload rendered chart pages (same as the Materials tab)
      const chartPaths: string[] = []
      for (const cb of chartBlobs) {
        const cpath = `${pid}/charts/${Date.now()}-page-${cb.pageNum}.jpg`
        const { error: cErr } = await supabase.storage.from('project-materials').upload(cpath, cb.blob, { contentType: 'image/jpeg' })
        if (!cErr) chartPaths.push(cpath)
      }

      // atomic append (NEVER the read-modify-write of the whole materials array)
      const material = {
        name: file.name, path: key, type: ext, size: file.size,
        uploaded_at: new Date().toISOString(),
        extracted_text: text,
        ...(chartPaths.length ? { chart_image_paths: chartPaths } : {}),
      }
      const { error: saveErr } = await supabase.rpc('append_project_material', { p_project_id: pid, p_material: material })
      if (saveErr) { setError('The file uploaded but could not be saved. Please try again.'); setStage('error'); runningRef.current = false; return }

      // detect show + category (same edge fn as Quick Eval)
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
      setCategory(detCat)

      // AOY → hand off to the full workspace (guided category picker lives there)
      if (detAoy || isAoyShow(detShow)) {
        setHandoffReason('This looks like an Agency of the Year entry, which uses a guided category picker in the full workspace.')
        setStage('handoff')
        runningRef.current = false
        return
      }

      // Non-AOY: land on a one-line confirm. The user confirms/edits show+category,
      // then we score. (No silent block if detection was empty — spec §4.)
      setStage('confirm')
      runningRef.current = false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStage('error')
      runningRef.current = false
    }
  }

  // ── score: from the confirm step ────────────────────────────────────────────
  const scoreIt = async () => {
    if (runningRef.current) return
    if (!projectId || !user) return
    const showT = show.trim()
    if (!showT) { setError('Please enter the award show this entry targeted.'); return }

    runningRef.current = true
    setError('')

    try {
      const token = await getToken()
      if (!token) { router.replace('/login'); return }
      const orgId = await resolveMyOrgId()

      // config-mode / SMARTIES → structured section scoring; hand off to the
      // project page's Quick Eval, which renders those natively.
      const smarties = isSmartiesShow(showT)
      const configMode = smarties ? null : await resolveConfigMode(showT, category.trim())
      if (smarties || configMode) {
        setHandoffReason('This show is scored section by section. Open the full workspace to run the jury read on it.')
        setStage('handoff')
        runningRef.current = false
        return
      }

      // ── standard path (evaluate-entry): create direction, insert one blob
      //    entry_draft, score. Mirrors evaluateUploadedEntry's standard branch. ──
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
      setDirectionId(dir.id)
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
      // The sample scores through the standard path with a fixed show/category.
      await startFromFile(file)
      setShow(SAMPLE_SHOW)
      setCategory(SAMPLE_CATEGORY)
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

  const reset = () => {
    setStage('idle'); setError(''); setProgress('')
    setProjectId(null); setEntryText(''); setDisplayName(''); setShow(''); setCategory('')
    setEvaluation(null); setDirectionId(null); setHandoffReason(''); setProjectName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── render ──────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen w-full bg-gray-100 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }

  const summarySections: SummarySection[] = evaluation
    ? SCORE_DIMENSIONS.map(d => ({ key: d.key, label: d.label, score: evaluation.scores?.[d.key] ?? null }))
    : []
  const fixList = evaluation ? (evaluation.output?.kills_it?.length ? evaluation.output.kills_it : evaluation.gaps) : []
  const verdict = evaluation ? (evaluation.output?.recommendations || evaluation.recommendations || '') : ''

  return (
    <div className="min-h-screen w-full bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* header */}
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-green-700">Shortlist</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">
            Upload your best past award entry
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-600">
            We read it like a jury and show you where it wins and where it leaks points.
          </p>
        </div>

        {/* idle: drop zone */}
        {(stage === 'idle' || stage === 'notext' || stage === 'error') && (
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-10 text-center transition-colors hover:border-green-600 hover:bg-green-50"
            >
              <span className="text-base font-medium text-gray-900">Drop a PDF, DOCX, or TXT here</span>
              <span className="text-xs text-gray-500">or tap to choose a file · max 10MB</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void startFromFile(f) }}
            />

            {stage === 'notext' && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                We couldn&apos;t read any text from that file. Try a text-based PDF or a DOCX, or score the sample below.
              </div>
            )}
            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="mt-5 text-center">
              <button type="button" onClick={() => void runSample()} className="text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
                Don&apos;t have one to hand? Score a sample entry
              </button>
            </div>
          </div>
        )}

        {/* working: progress */}
        {stage === 'working' && (
          <div className="w-full rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-green-700" />
            <p className="text-sm font-medium text-gray-700">{progress || 'Working…'}</p>
            <p className="mt-1 text-xs text-gray-400">This usually takes under a minute.</p>
          </div>
        )}

        {/* confirm: show + category */}
        {stage === 'confirm' && (
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm text-gray-600">
              {show ? 'We detected this entry’s target. Confirm or change it, then score.' : 'Tell us which show this entry targeted, then score.'}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Award show</span>
                <input
                  value={show}
                  onChange={(e) => setShow(e.target.value)}
                  placeholder="e.g. Cannes Lions, Spikes Asia, D&AD"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Category <span className="font-normal normal-case text-gray-400">(optional)</span></span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Creative Effectiveness"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
                />
              </label>
            </div>
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void scoreIt()} className="w-full rounded-lg bg-green-800 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 sm:w-auto">
                Score it
              </button>
              <button type="button" onClick={reset} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 sm:w-auto">
                Use a different file
              </button>
            </div>
          </div>
        )}

        {/* handoff: AOY / structured shows open in the full workspace */}
        {stage === 'handoff' && (
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm leading-relaxed text-gray-700">{handoffReason}</p>
            <p className="mt-2 text-sm text-gray-500">Your entry is uploaded and ready. Open the workspace to run the jury read.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => goToProject('handoff_open_workspace')} className="w-full rounded-lg bg-green-800 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 sm:w-auto">
                Open the workspace
              </button>
              <button type="button" onClick={reset} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 sm:w-auto">
                Score a different entry
              </button>
            </div>
          </div>
        )}

        {/* scored: inline jury read (standard path) */}
        {stage === 'scored' && evaluation && (
          <div className="w-full">
            <div className="w-full overflow-hidden rounded-2xl bg-white px-5 pb-5 shadow-sm">
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
                    {evaluation.output!.talks_up!.map((s, i) => (
                      <li key={i} className="text-sm leading-snug text-gray-700">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(fixList?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Where it leaks points</p>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5">
                    {fixList!.map((g, i) => (
                      <li key={i} className="text-sm leading-snug text-gray-700">• {g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* next steps — save as a project is primary (signed-off) */}
            <div className="mt-4 w-full rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">Save this as a project</p>
              <p className="mt-1 text-sm text-gray-600">Name it, then open the full breakdown to edit the entry, see section-by-section coaching, and re-run the jury.</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none"
                />
                <button type="button" disabled={savingName} onClick={() => void saveNameAndOpen()} className="w-full rounded-lg bg-green-800 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                  {savingName ? 'Saving…' : 'Save & open full breakdown'}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row">
                <button type="button" onClick={reset} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 sm:w-auto">
                  Score another entry
                </button>
                <button type="button" onClick={() => { track('first_run_nextstep_selected', { next: 'start_fresh_entry' }); router.push('/projects/new') }} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 sm:w-auto">
                  Start a fresh entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
