'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /projects/[id]/angles — Arc v2 B2 (angles surface, 18 Aug 2026)
//
// Per-category angle exploration off the user's own selected documents,
// design of record: Arc-V2-Design-2026-08-19.md (+ the 18 Aug decision
// resolutions). This page is deliberately its OWN route with its own
// component files (components/angles/*) — the 10.4k-line projects/[id]
// workspace page gets only the nav entry, the Category Recommender relabel
// strings, and the per-card cross-link (own-session rule).
//
// Contract with the deployed engine (B1, edge fn `generate-angles`):
//   POST { project_id: STRING, category, material_paths[] }, session ACCESS
//   TOKEN as Bearer (never the anon key). 200 → { angles: { batch_id,
//   angles: [rows...] } }. Errors carry ANGLES-* codes; 409
//   ANGLES-MATERIAL-NOTEXT names the unreadable documents. Angles rows are
//   read back via the normal authenticated client (RLS org-scoped SELECT);
//   the ONLY client-writable column is direction_id, which is B3's, not ours.
//
// Version-contamination mitigation (design §5.3, evidence-backed by the Run B
// acceptance result): every document renders WITH ITS UPLOAD DATE, so when a
// project holds several versions of one document the choice of which version
// feeds generation is the user's, and legible.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { appErrorFromResponse, formatError } from '@/lib/errorMessages'
import { ErrorBanner } from '@/components/ErrorBanner'
import GeneratingBar from '@/components/GeneratingBar'
import AoyEntryPicker from '@/components/AoyEntryPicker'
import AngleCard, { AngleRow } from '@/components/angles/AngleCard'
import { isAoyShow } from '@/lib/aoy-taxonomy'
import { categoriesForShow } from '@/lib/show-taxonomy'

type ProjectLite = {
  id: number
  campaign_name: string
  client_name: string | null
  target_shows: string[] | null
  entry_type: string | null
}

// Slim metadata from get_project_materials_meta (Session 52 payload diet):
// never extracted_text. has_text is the server-computed gate.
type MaterialMeta = {
  name: string
  path?: string
  type?: string
  size?: number
  uploaded_at?: string
  has_text?: boolean
  text_words?: number
}

type DirectionLite = {
  id: number
  best_show: string | null
  best_category: string | null
}

const ANGLES_SELECT =
  'id, batch_id, angle_index, category, name, premise, evidence_anchors, gaps, figure_trace, source_materials, seeded, created_at, direction_id'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
}

// Prefilled category choices (design §1): the project's target_shows'
// documented categories plus the distinct best_category values on existing
// directions. Dedup via a plain object — no Set spread/iteration (downlevel).
function buildCategoryOptions(directions: DirectionLite[], targetShows: string[]): string[] {
  const seen: Record<string, boolean> = {}
  const options: string[] = []
  const push = (raw: string | null | undefined) => {
    const c = (raw ?? '').trim()
    if (!c) return
    const key = c.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    options.push(c)
  }
  directions.forEach(d => push(d.best_category))
  targetShows.forEach(s => { categoriesForShow(s).forEach(c => push(c)) })
  return options
}

export default function AnglesPage() {
  const params = useParams()
  const projectId = params?.id as string
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [project, setProject] = useState<ProjectLite | null>(null)
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [directions, setDirections] = useState<DirectionLite[]>([])
  const [anglesRows, setAnglesRows] = useState<AngleRow[]>([])
  const [fetching, setFetching] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [category, setCategory] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [showGenBar, setShowGenBar] = useState(false)
  const [genError, setGenError] = useState('')

  // Preselect from the query string (the recommender's per-card cross-link
  // arrives as ?category=...). window.location.search in an effect, never
  // useSearchParams (build-time Suspense requirement).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('category')
    if (c && c.trim()) setCategory(c.trim())
  }, [])

  useEffect(() => {
    if (!user || !projectId) return
    let cancelled = false
    Promise.all([
      supabase.from('projects')
        .select('id, campaign_name, client_name, target_shows, entry_type')
        .eq('id', projectId).single(),
      supabase.rpc('get_project_materials_meta', { p_project_id: projectId }),
      supabase.from('directions')
        .select('id, best_show, best_category')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('angles')
        .select(ANGLES_SELECT)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .order('angle_index', { ascending: true })
        .limit(40),
    ]).then(([projRes, matsRes, dirsRes, anglesRes]) => {
      if (cancelled) return
      if (projRes.error || !projRes.data) {
        setLoadError('Could not load this project. It may not exist, or you may not have access to it.')
        setFetching(false)
        return
      }
      setProject(projRes.data as ProjectLite)
      const mats = ((matsRes.data as MaterialMeta[] | null) ?? [])
      setMaterials(mats)
      // Material scope default (design §5.3): all current readable documents
      // selected; the user deselects. Docs with no extracted text stay
      // unselectable (the engine 409s on them by design).
      const sel: Record<string, boolean> = {}
      mats.forEach((m: MaterialMeta) => { if (m.path && m.has_text) sel[m.path] = true })
      setSelectedPaths(sel)
      setDirections(((dirsRes.data as DirectionLite[] | null) ?? []))
      setAnglesRows(((anglesRes.data as AngleRow[] | null) ?? []))
      setFetching(false)
    })
    return () => { cancelled = true }
  }, [user, projectId])

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return session.access_token
    window.location.href = '/login'
    return null
  }

  const generateAngles = async () => {
    if (!project) return
    const cat = category.trim()
    const paths = Object.keys(selectedPaths).filter(p => selectedPaths[p])
    if (!cat) {
      setGenError(formatError({ message: 'Pick one category to explore angles in.', retryable: false, code: 'ANGLES-400' }))
      return
    }
    if (paths.length === 0) {
      setGenError(formatError({ message: 'Select at least one document to generate angles from.', retryable: false, code: 'ANGLES-400' }))
      return
    }
    setGenerating(true)
    setShowGenBar(true)
    setGenError('')
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-angles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: String(project.id), category: cat, material_paths: paths }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        const appErr = appErrorFromResponse(data, res.status, 'ANGLES')
        if (data.code === 'ANGLES-MATERIAL-NOTEXT' && Array.isArray(data.documents) && data.documents.length > 0) {
          appErr.message = appErr.message + ' (' + (data.documents as string[]).join(', ') + ')'
        }
        setGenError(formatError(appErr))
        return
      }
      const batch = data.angles
      const rows: AngleRow[] = Array.isArray(batch?.angles) ? (batch.angles as AngleRow[]) : []
      if (rows.length > 0) {
        const sorted = [...rows].sort((a, b) => a.angle_index - b.angle_index)
        setAnglesRows(prev => sorted.concat(prev))
      }
    } catch {
      setGenError(formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'ANGLES-NET' }))
    } finally {
      setGenerating(false)
    }
  }

  // Latest persisted batch (leave-and-return artifact, design §1): rows are
  // ordered created_at DESC, so the first row's batch_id is the newest set.
  const latestBatch: AngleRow[] = (() => {
    if (anglesRows.length === 0) return []
    const latestId = anglesRows[0].batch_id
    return anglesRows
      .filter(a => a.batch_id === latestId)
      .sort((a, b) => a.angle_index - b.angle_index)
  })()

  const targetShows = project?.target_shows ?? []
  const projectIsAoy = !!project && (
    targetShows.some(isAoyShow) ||
    project.entry_type === 'aoy' ||
    directions.some(d => isAoyShow(d.best_show))
  )
  const categoryOptions = buildCategoryOptions(directions, targetShows)
  const readableCount = materials.filter(m => !!m.path && !!m.has_text).length
  const selectedCount = Object.keys(selectedPaths).filter(p => selectedPaths[p]).length

  const recommenderLink = (
    <button
      onClick={() => router.push(`/projects/${projectId}`)}
      className="text-sm text-green-700 hover:text-green-600 transition-colors"
    >
      Not sure which category? → Category Recommender
    </button>
  )

  if (authLoading || fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-gray-700 mb-3">{loadError || 'Could not load this project.'}</p>
          <button onClick={() => router.push('/projects')} className="text-sm text-green-700 hover:text-green-600 transition-colors">← Back to projects</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 overflow-x-hidden">
      <header className="border-b border-gray-200 bg-white py-3 sm:py-4">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${projectId}`)} className="text-gray-500 hover:text-gray-900 transition-colors text-sm shrink-0">
            ← Back to project
          </button>
          <span className="text-gray-300 shrink-0">|</span>
          <div className="min-w-0">
            <h1 className="sl-serif text-gray-900 leading-tight truncate" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{project.campaign_name}</h1>
            {project.client_name && <p className="text-gray-500 text-xs truncate">{project.client_name}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-700">Angles</h2>
          <p className="text-gray-400 text-xs mt-0.5">New angles for your selected category. Pick a category first. Angles explore stories inside it.</p>
        </div>

        {/* ── Setup: one category, explicit material scope ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">1. Category (exactly one)</p>

            {projectIsAoy && (
              <div className="mb-3">
                <AoyEntryPicker onChange={(canonical: string) => { if (canonical) setCategory(canonical) }} compact />
              </div>
            )}

            {categoryOptions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {categoryOptions.slice(0, 12).map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      category === c
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-gray-100 text-gray-500 border-gray-300 hover:border-green-600 hover:text-green-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              list="angles-category-options"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder={projectIsAoy ? 'Or type a category' : 'Type or pick a category'}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
            />
            <datalist id="angles-category-options">
              {categoryOptions.map(c => <option key={c} value={c} />)}
            </datalist>

            {!category.trim() && <div className="mt-2">{recommenderLink}</div>}
          </div>

          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">2. Documents to build from</p>
            <p className="text-sm text-gray-700 mb-3">Angles read only the documents you select here. If this project holds more than one version of a document, the upload dates below are how you pick the current one.</p>

            {materials.length === 0 ? (
              <p className="text-sm text-gray-700">
                No documents on this project yet. Upload materials on the project page first, then come back here.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {materials.map((m, i) => {
                  const path = m.path ?? ''
                  const usable = !!path && !!m.has_text
                  const checked = usable && !!selectedPaths[path]
                  return (
                    <label
                      key={path || 'material-' + i}
                      className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 ${usable ? 'bg-white border-gray-200 cursor-pointer hover:border-green-600' : 'bg-gray-50 border-gray-200 opacity-60'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!usable}
                        checked={checked}
                        onChange={() => { if (usable) setSelectedPaths(prev => ({ ...prev, [path]: !prev[path] })) }}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 truncate">{m.name}</span>
                        <span className="block text-sm text-gray-700 mt-0.5">
                          {fmtDate(m.uploaded_at) ? 'Uploaded ' + fmtDate(m.uploaded_at) : 'Upload date unknown'}
                          {typeof m.text_words === 'number' && m.text_words > 0 ? ' · ' + m.text_words.toLocaleString() + ' words' : ''}
                          {!usable ? ' · no readable text yet, cannot feed generation' : ''}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generateAngles}
              disabled={generating || !category.trim() || selectedCount === 0 || readableCount === 0}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors flex items-center gap-2"
            >
              {generating ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Exploring angles…</>
              ) : latestBatch.length > 0 ? 'Generate new angles' : 'Generate angles'}
            </button>
            <span className="text-xs text-gray-400">Four angles, about a minute. No scores, no ranking.</span>
          </div>

          {showGenBar && (
            <div className="mt-4">
              <GeneratingBar isGenerating={generating} estimatedDuration={50000} onComplete={() => setShowGenBar(false)} />
            </div>
          )}

          {genError && <div className="mt-3"><ErrorBanner error={genError} /></div>}
        </div>

        {/* ── Latest persisted batch ── */}
        {latestBatch.length > 0 ? (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700">Angles for {latestBatch[0].category}</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                Generated {fmtDate(latestBatch[0].created_at)}
                {Array.isArray(latestBatch[0].source_materials) && latestBatch[0].source_materials.length > 0
                  ? ' from ' + latestBatch[0].source_materials.map(sm => sm.name + (sm.uploaded_at ? ' (uploaded ' + fmtDate(sm.uploaded_at) + ')' : '')).join(', ')
                  : ''}
                . Saved with this project: leave, get what an angle is missing, come back.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {latestBatch.map(a => <AngleCard key={a.id} angle={a} />)}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-700 mb-2">No angles yet. Pick one category, choose the documents to build from, and generate.</p>
            <p className="text-sm text-gray-500 mb-3">Each angle names what it rests on in your material and what the story is still missing.</p>
            {recommenderLink}
          </div>
        )}
      </main>
    </div>
  )
}
