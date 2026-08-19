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
// B2.1 (18 Aug ~21:45 JST, Ben's UX review of the live surface): this route
// was dropping the project canvas top band (header + ProjectProgressSpine)
// for a bare "Back to project" link. Angles is a peer-level section of the
// canvas (decision 4 of record), not a link-out page, so it now renders the
// SAME header shape and the SAME ProjectProgressSpine component the project
// page renders — fed by the lightest queries that can honestly answer each
// step's done-state, never select('*'), never the heavy RPCs the project
// page's own full workspace needs (get_project_entry_drafts, the wide
// evaluations select). Spine steps other than Angles navigate to
// /projects/[id]?tab=<key>, read by a query-param effect on that page
// (mirrors the B3 draftDirection effect). Angles has no tab of its own on
// that page — clicking it here is a no-op, it is already the open surface.
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

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { appErrorFromResponse, formatError } from '@/lib/errorMessages'
import { ErrorBanner } from '@/components/ErrorBanner'
import GeneratingBar from '@/components/GeneratingBar'
import AoyEntryPicker from '@/components/AoyEntryPicker'
import AngleCard, { AngleRow } from '@/components/angles/AngleCard'
import { resolveBridgeShow } from '@/components/angles/angleBridge'
import { isAoyShow } from '@/lib/aoy-taxonomy'
import { categoriesForShow } from '@/lib/show-taxonomy'
import ProjectProgressSpine, { SpineStep } from '@/components/ProjectProgressSpine'
import { ENDORSEMENT_ITEMS } from '@/components/EndorsementsChecklist'

// Mirrors projects/[id]/page.tsx's exported Tab union as a local literal
// (not imported — this route should not depend on that page's module
// graph). Angles has no tab of its own on that page; every OTHER spine step
// resolves to one of these before navigating.
type ProjectTab = 'brief' | 'materials' | 'entries' | 'script' | 'directions' | 'facts' | 'endorsements' | 'presskit'

/* ── Avatar dropdown (top-right nav) — duplicated from projects/[id]/page.tsx.
   It is a local, unexported function there (a page.tsx may not add value
   exports beyond the allowlist, S161), so duplicating here is the smaller
   diff versus pulling it into a shared component for one more caller. Keep
   both copies in sync. ── */
function AvatarMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initial = (email || '?')[0].toUpperCase()
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-green-800 flex items-center justify-center text-white text-xs font-bold hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
        title={email}
      >
        {initial}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', minWidth: 180, zIndex: 50, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
          </div>
          <Link href="/settings/account" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 14px', fontSize: 14, color: '#374151', textDecoration: 'none' }}
            className="hover:bg-gray-50 transition-colors">
            Account settings
          </Link>
          <Link href="/settings/team" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 14px', fontSize: 14, color: '#374151', textDecoration: 'none', borderTop: '1px solid #f3f4f6' }}
            className="hover:bg-gray-50 transition-colors">
            Team
          </Link>
          <button onClick={() => { setOpen(false); onSignOut() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 14, color: '#dc2626', background: 'none', border: 'none', borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
            className="hover:bg-red-50 transition-colors">
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

type ProjectLite = {
  id: number
  campaign_name: string
  client_name: string | null
  target_shows: string[] | null
  entry_type: string | null
  status: string
  combined_text: string | null
  script_text: string | null
  agency_facts: Record<string, unknown> | null
  endorsements_checklist: Record<string, boolean> | null
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

// B2.1: scalar-only evaluations read for the spine's Jury Read/Refine and
// Draft/Evaluated done-states — never scores/output/section_rescores (see
// the project page's own evaluations select for the heavy version this
// route deliberately does not need).
type EvalSlim = {
  overall_score: number | null
  evaluation_mode: string | null
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

  // B2.1 spine parity: head-only counts / slim scalar selects, fetched
  // alongside the existing load below. See the comments on that effect.
  const [angleTotalCount, setAngleTotalCount] = useState(0)
  const [evalSlim, setEvalSlim] = useState<EvalSlim[]>([])
  const [draftGenerations, setDraftGenerations] = useState<number[]>([])
  const [pressKitCount, setPressKitCount] = useState(0)

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
        .select('id, campaign_name, client_name, target_shows, entry_type, status, combined_text, script_text, agency_facts, endorsements_checklist')
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
      // B2.1 spine parity (19 Aug 2026): the four reads below feed the
      // spine's done-states and counts ONLY. Head-only count for Angles
      // itself (the batch list above is capped at 40 rows across all
      // batches, not an exact total) and for Press Kit (whose real
      // pressKitStarted state lives in PressKitTab, unreachable from this
      // route); explicit scalar columns for evaluations and entry_drafts,
      // never the wide evaluations select or the get_project_entry_drafts
      // RPC the project page's own full workspace needs.
      supabase.from('angles')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
      supabase.from('evaluations')
        .select('overall_score, evaluation_mode')
        .eq('project_id', projectId),
      supabase.from('entry_drafts')
        .select('draft_generation')
        .eq('project_id', projectId),
      supabase.from('press_kit_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
    ]).then(([projRes, matsRes, dirsRes, anglesRes, angleCountRes, evalRes, draftsRes, pressKitRes]) => {
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
      setAngleTotalCount(angleCountRes.count ?? 0)
      setEvalSlim(((evalRes.data as EvalSlim[] | null) ?? []))
      setDraftGenerations((((draftsRes.data as { draft_generation: number | null }[] | null) ?? [])).map(d => d.draft_generation ?? 1))
      setPressKitCount(pressKitRes.count ?? 0)
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
        // The spine's Angles count reflects the persisted table, not just
        // this page's capped 40-row read — bump it optimistically so the
        // step flips to done without waiting on a re-fetch.
        setAngleTotalCount(prev => prev + rows.length)
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

  // ── B2.1 spine parity (19 Aug 2026) ─────────────────────────────────────
  // Byte-for-byte the same step keys/labels/order as projects/[id]/page.tsx's
  // aoySpineSteps/campaignSpineSteps, fed by the slim reads above. Verify
  // Facts is deliberately the SIMPLER of that page's two conditions
  // (agency_facts / entry_type only — this route skips the people/brand
  // pillar-facts branch, project_pillar_facts, entirely): the omission can
  // only ever UNDER-mark a step done, never fabricate a checkmark, the same
  // rule the design doc applies to figure trace badges (§3).
  const spineJudgeScores = evalSlim
    .filter(e => e.evaluation_mode !== 'coach' && e.overall_score !== null && !Number.isNaN(Number(e.overall_score)))
    .map(e => Number(e.overall_score))
  const spineHasJudge = spineJudgeScores.length > 0
  const spineHasCoach = evalSlim.some(e => e.evaluation_mode === 'coach')
  const spineHasEval = evalSlim.length > 0
  const spineBestJudge = spineJudgeScores.length > 0 ? Math.max(...spineJudgeScores) : null
  const spineMaxDraftGen = draftGenerations.length > 0 ? Math.max(...draftGenerations) : 0
  const spineFactsDone = !!project.agency_facts || project.entry_type === 'aoy'
  const endorsementsChecklist = (project.endorsements_checklist ?? {}) as Record<string, boolean>
  const spineEndorsementsDone = ENDORSEMENT_ITEMS.every(i => !!endorsementsChecklist[i.key])
  const spineScriptDone = !!project.script_text
  const spinePressKitStarted = pressKitCount > 0
  const spineAoyCategorySet = directions.some(d => (d.best_category ?? '').trim() !== '')

  const AOY_STEP_TO_TAB: Record<string, ProjectTab> = {
    materials: 'materials',
    jury: 'entries',
    facts: 'facts',
    directions: 'directions',
    refine: 'entries',
    endorsements: 'endorsements',
    script: 'script',
    presskit: 'presskit',
  }

  const aoySpineSteps: SpineStep[] = [
    { key: 'materials', label: 'Materials', done: materials.length > 0 && spineAoyCategorySet,
      summary: materials.length > 0 ? String(materials.length) : undefined },
    { key: 'jury', label: 'Jury', done: spineHasJudge,
      summary: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    { key: 'facts', label: 'Facts', done: spineFactsDone },
    { key: 'directions', label: 'Categories', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    { key: 'angles', label: 'Angles', done: angleTotalCount > 0,
      summary: angleTotalCount > 0 ? String(angleTotalCount) : undefined },
    { key: 'refine', label: 'Refine', done: spineHasCoach },
    { key: 'endorsements', label: 'Endorsements', done: spineEndorsementsDone },
    { key: 'script', label: 'Script', done: spineScriptDone },
    { key: 'presskit', label: 'Press Kit', done: spinePressKitStarted },
  ]

  const campaignSpineSteps: SpineStep[] = [
    { key: 'brief', label: 'Brief', done: !!(project.combined_text ?? '').trim() },
    { key: 'materials', label: 'Materials', done: materials.length > 0,
      summary: materials.length > 0 ? String(materials.length) : undefined },
    { key: 'directions', label: 'Categories', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    { key: 'angles', label: 'Angles', done: angleTotalCount > 0,
      summary: angleTotalCount > 0 ? String(angleTotalCount) : undefined },
    // B2.2 (19 Aug 2026): Draft and Evaluated merged into one chip, kept
    // byte-identical to the project page's copy (see that file for the
    // full rationale comment).
    { key: 'draft', label: 'Draft', done: draftGenerations.length > 0,
      summary: spineMaxDraftGen > 0 ? `Gen ${spineMaxDraftGen}` : undefined,
      summary2: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    { key: 'script', label: 'Script', done: spineScriptDone },
    { key: 'presskit', label: 'Press Kit', done: spinePressKitStarted },
  ]

  const spineSteps: SpineStep[] = projectIsAoy ? aoySpineSteps : campaignSpineSteps

  // Angles has no tab on the project page — it lives on this route, and this
  // route IS the open surface, so clicking it here is a no-op. Every other
  // step resolves to a Tab and navigates to /projects/[id]?tab=<key>, read
  // by that page's tabParamFiredRef effect.
  const handleSpineStepClick = (step: SpineStep) => {
    if (step.key === 'angles') return
    const target: ProjectTab = projectIsAoy
      ? (AOY_STEP_TO_TAB[step.key] ?? 'materials')
      : (step.key === 'draft' ? 'entries' : (step.key as ProjectTab))
    router.push(`/projects/${projectId}?tab=${target}`)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 overflow-x-hidden">

      {/* Header — same shape as projects/[id]/page.tsx's header (B2.1): back
          link, name, client, status chip, avatar. Name is display-only here;
          renaming stays on the project page, whose save handler lives there. */}
      <header className="border-b border-gray-200 bg-white py-3 sm:py-4">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">

          {/* ── Mobile layout: two rows ─────────────────────────────────────── */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <button onClick={() => router.push('/projects')} className="text-gray-500 hover:text-gray-900 transition-colors text-sm">
                ← Projects
              </button>
              <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
                project.status === 'active' ? 'bg-green-100 text-green-700' :
                project.status === 'final' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-500'
              }`}>{project.status}</span>
            </div>
            <div className="min-w-0">
              <h1 className="sl-serif text-gray-900 leading-tight truncate" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{project.campaign_name}</h1>
              {project.client_name && <p className="text-gray-500 text-xs truncate">{project.client_name}</p>}
            </div>
          </div>

          {/* ── Desktop layout: single row ──────────────────────────────────── */}
          <div className="hidden sm:flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.push('/projects')} className="text-gray-500 hover:text-gray-900 transition-colors text-sm shrink-0">
                ← Projects
              </button>
              <span className="text-gray-300 shrink-0">|</span>
              <div className="min-w-0">
                <h1 className="sl-serif text-gray-900 leading-tight truncate" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{project.campaign_name}</h1>
                {project.client_name && <p className="text-gray-500 text-xs truncate">{project.client_name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                project.status === 'active' ? 'bg-green-100 text-green-700' :
                project.status === 'final' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-500'
              }`}>{project.status}</span>
              <AvatarMenu email={user?.email ?? ''} onSignOut={async () => { await supabase.auth.signOut(); window.location.href = '/login' }} />
            </div>
          </div>

        </div>
      </header>

      {/* Session 54 spine, B2.1 parity: same component, same props shape the
          project page feeds it, Angles step active/current on this route. */}
      <ProjectProgressSpine steps={spineSteps} activeKey="angles" onStepClick={handleSpineStepClick} />

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
              {latestBatch.map(a => (
                <AngleCard
                  key={a.id}
                  angle={a}
                  projectId={project.id}
                  targetShow={resolveBridgeShow(targetShows, a.category)}
                  userId={user?.id ?? null}
                  directionCount={directions.length}
                />
              ))}
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
