'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

type Material = {
  name: string
  path: string
  type: string
  size: number
  uploaded_at: string
  extracted_text?: string
  chart_image_paths?: string[]
}

type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  combined_text: string | null
  target_shows: string[]
  materials: Material[]
  status: string
}

type Direction = {
  id: number
  name: string
  angle: string | null
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null
  likelihood_rationale: string | null
  strengths: string | null
  risks: string | null
  hook: string | null
  chosen: boolean
}

type EntryDraft = {
  id: number
  direction_id: number
  field_key: string
  field_label: string
  word_limit: number | null
  version_a: string | null
  version_b: string | null
  version_c: string | null
  selected: string | null
  award_show: string | null
  category: string | null
}

type EvaluationScores = {
  strategic_clarity: number
  insight: number
  idea: number
  execution: number
  results: number
  jury_fit: number
}

type Evaluation = {
  id: number
  entry_draft_id: number
  overall_score: number
  scores: EvaluationScores
  strengths: string[]
  gaps: string[]
  recommendations: string
  model_used: string | null
  created_at: string
}

type Tab = 'brief' | 'materials' | 'directions' | 'entries'

const SCORE_DIMENSIONS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'strategic_clarity', label: 'Strategic Clarity' },
  { key: 'insight', label: 'Insight' },
  { key: 'idea', label: 'Idea' },
  { key: 'execution', label: 'Execution' },
  { key: 'results', label: 'Results' },
  { key: 'jury_fit', label: 'Jury Fit' },
]

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-400'
  if (score >= 6) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 8) return 'bg-green-900/30 border-green-800/50'
  if (score >= 6) return 'bg-amber-900/30 border-amber-800/50'
  return 'bg-red-900/30 border-red-800/50'
}

export default function ProjectPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [directions, setDirections] = useState<Direction[]>([])
  const [entries, setEntries] = useState<EntryDraft[]>([])
  // Evaluations keyed by direction_id for O(1) lookup
  const [evaluations, setEvaluations] = useState<Record<number, Evaluation>>({})
  const [tab, setTab] = useState<Tab>('brief')
  const [fetching, setFetching] = useState(true)

  // Brief
  const [briefEdit, setBriefEdit] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [savingBrief, setSavingBrief] = useState(false)

  // Materials
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  // Directions generation
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Draft generation
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [generateDraftError, setGenerateDraftError] = useState('')
  const [generatingForDirectionId, setGeneratingForDirectionId] = useState<number | null>(null)

  // Evaluation
  const [evaluating, setEvaluating] = useState(false)
  const [evaluateError, setEvaluateError] = useState('')
  const [evaluatingForDirectionId, setEvaluatingForDirectionId] = useState<number | null>(null)

  // Quick evaluate from uploaded material
  const [orgId, setOrgId] = useState<number | null>(null)
  const [showQuickEvalModal, setShowQuickEvalModal] = useState(false)
  const [quickEvalMaterialIdx, setQuickEvalMaterialIdx] = useState<number | null>(null)
  const [quickEvalShow, setQuickEvalShow] = useState('')
  const [quickEvalCategory, setQuickEvalCategory] = useState('')
  const [quickEvaluating, setQuickEvaluating] = useState(false)
  const [quickEvalError, setQuickEvalError] = useState('')

  useEffect(() => {
    if (!user || !projectId) return

    Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('directions').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('entry_drafts').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('evaluations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]).then(([{ data: proj }, { data: dirs }, { data: drafts }, { data: evals }]) => {
      if (proj) { setProject(proj); setBriefText(proj.combined_text || '') }
      if (dirs) setDirections(dirs)

      const draftsList = drafts || []
      if (draftsList.length > 0) setEntries(draftsList)

      // Map evaluations to direction_ids via entry_draft_id lookup
      if (evals && evals.length > 0 && draftsList.length > 0) {
        const evalMap: Record<number, Evaluation> = {}
        for (const ev of evals) {
          const relatedDraft = draftsList.find(d => d.id === ev.entry_draft_id)
          if (relatedDraft && !evalMap[relatedDraft.direction_id]) {
            evalMap[relatedDraft.direction_id] = ev
          }
        }
        setEvaluations(evalMap)
      }

      setFetching(false)
    })

    // Fetch org_id for quick-evaluate flow
    supabase.rpc('get_my_org_id').then(({ data }) => { if (data) setOrgId(data) })
  }, [user, projectId])

  const saveBrief = async () => {
    if (!project) return
    setSavingBrief(true)
    await supabase
      .from('projects')
      .update({ combined_text: briefText, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, combined_text: briefText } : p)
    setBriefEdit(false)
    setSavingBrief(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be under 10MB.')
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'txt'].includes(ext || '')) {
      setUploadError('Only PDF, DOCX, and TXT files are supported.')
      return
    }
    if ((project.materials || []).length >= 5) {
      setUploadError('Maximum 5 files per project.')
      return
    }

    setUploading(true)
    setUploadError('')
    setUploadProgress('Uploading file…')

    const path = `${project.id}/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage.from('project-materials').upload(path, file)
    if (uploadErr) {
      setUploadError(uploadErr.message)
      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
      return
    }

    const arrayBuffer = await file.arrayBuffer()
    let extractedText = ''
    const chartImagePaths: string[] = []

    if (ext === 'txt') {
      extractedText = new TextDecoder().decode(arrayBuffer).slice(0, 50000)
    } else if (ext === 'docx') {
      try {
        setUploadProgress('Extracting text from document…')
        const mammoth = (await import('mammoth')).default
        const result = await mammoth.extractRawText({ arrayBuffer })
        extractedText = result.value.slice(0, 50000)
      } catch (err) { console.warn('DOCX extraction failed:', err) }
    } else if (ext === 'pdf') {
      try {
        setUploadProgress('Reading PDF…')
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const textParts: string[] = []
        const chartPageNums: number[] = []

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          const pageText = (textContent.items as Array<{ str?: string }>)
            .filter(item => typeof item.str === 'string')
            .map(item => item.str as string)
            .join(' ').trim()
          if (pageText.length > 80) { textParts.push(pageText) }
          else { chartPageNums.push(pageNum) }
        }
        extractedText = textParts.join('\n\n').slice(0, 50000)

        if (chartPageNums.length > 0) {
          setUploadProgress(`Processing ${Math.min(chartPageNums.length, 8)} chart pages…`)
          for (const pageNum of chartPageNums.slice(0, 8)) {
            try {
              const page = await pdf.getPage(pageNum)
              const viewport = page.getViewport({ scale: 1.5 })
              const canvas = document.createElement('canvas')
              canvas.width = viewport.width
              canvas.height = viewport.height
              const ctx = canvas.getContext('2d')
              if (!ctx) continue
              await page.render({ canvasContext: ctx, viewport }).promise
              const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
              if (blob) {
                const chartPath = `${project.id}/charts/${Date.now()}-page-${pageNum}.jpg`
                const { error: chartErr } = await supabase.storage
                  .from('project-materials').upload(chartPath, blob, { contentType: 'image/jpeg' })
                if (!chartErr) chartImagePaths.push(chartPath)
              }
            } catch (err) { console.warn(`Chart render failed for page ${pageNum}:`, err) }
          }
        }
      } catch (err) { console.warn('PDF processing failed:', err) }
    }

    setUploadProgress('Saving…')
    const newMaterial: Material = {
      name: file.name, path, type: ext || '', size: file.size,
      uploaded_at: new Date().toISOString(),
      ...(extractedText ? { extracted_text: extractedText } : {}),
      ...(chartImagePaths.length > 0 ? { chart_image_paths: chartImagePaths } : {}),
    }
    const updatedMaterials = [...(project.materials || []), newMaterial]
    await supabase.from('projects')
      .update({ materials: updatedMaterials, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, materials: updatedMaterials } : p)
    setUploading(false)
    setUploadProgress('')
    e.target.value = ''
  }

  const deleteFile = async (index: number) => {
    if (!project) return
    const material = project.materials[index]
    await supabase.storage.from('project-materials').remove([material.path])
    if (material.chart_image_paths?.length) {
      await supabase.storage.from('project-materials').remove(material.chart_image_paths)
    }
    const updatedMaterials = project.materials.filter((_, i) => i !== index)
    await supabase.from('projects')
      .update({ materials: updatedMaterials, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, materials: updatedMaterials } : p)
  }

  const getToken = async (): Promise<string | null> => {
    const { data: refreshData } = await supabase.auth.refreshSession()
    if (refreshData?.session?.access_token) return refreshData.session.access_token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { window.location.href = '/login'; return null }
    return session.access_token
  }

  const generateDirections = async () => {
    if (!project) return
    setGenerating(true)
    setGenerateError('')
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-directions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setGenerateError(data.error || data.message || `Error ${res.status}`); return }
      setDirections(data.directions || [])
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Network error.')
    } finally { setGenerating(false) }
  }

  const generateDraft = async (directionId: number) => {
    if (!project) return
    setGeneratingDraft(true)
    setGenerateDraftError('')
    setGeneratingForDirectionId(directionId)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-draft`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setGenerateDraftError(data.error || `Error ${res.status}`); return }
      setEntries(prev => [...prev.filter(e => e.direction_id !== directionId), ...(data.entry_drafts || [])])
      // Clear stale evaluation for this direction since draft changed
      setEvaluations(prev => { const next = { ...prev }; delete next[directionId]; return next })
      setTab('entries')
    } catch (err) {
      setGenerateDraftError(err instanceof Error ? err.message : 'Network error.')
    } finally { setGeneratingDraft(false); setGeneratingForDirectionId(null) }
  }

  const evaluateEntry = async (directionId: number) => {
    if (!project) return
    setEvaluating(true)
    setEvaluateError('')
    setEvaluatingForDirectionId(directionId)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-entry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setEvaluateError(data.error || `Error ${res.status}`); return }
      if (data.evaluation) {
        setEvaluations(prev => ({ ...prev, [directionId]: data.evaluation }))
      }
    } catch (err) {
      setEvaluateError(err instanceof Error ? err.message : 'Network error.')
    } finally { setEvaluating(false); setEvaluatingForDirectionId(null) }
  }

  const evaluateUploadedEntry = async () => {
    if (!project || quickEvalMaterialIdx === null || !user) return
    const material = project.materials[quickEvalMaterialIdx]
    if (!material.extracted_text) return
    if (!quickEvalShow.trim() || !quickEvalCategory.trim()) {
      setQuickEvalError('Please enter both an award show and category.')
      return
    }

    setQuickEvaluating(true)
    setQuickEvalError('')

    try {
      const accessToken = await getToken()
      if (!accessToken) return

      // Resolve org_id
      let currentOrgId = orgId
      if (!currentOrgId) {
        const { data } = await supabase.rpc('get_my_org_id')
        currentOrgId = data
        if (currentOrgId) setOrgId(currentOrgId)
      }

      // 1. Create a direction row for this show/category
      const { data: dir, error: dirErr } = await supabase
        .from('directions')
        .insert({
          project_id: project.id,
          org_id: currentOrgId,
          created_by: user.id,
          name: `${quickEvalShow.trim()} — ${quickEvalCategory.trim()}`,
          best_show: quickEvalShow.trim(),
          best_category: quickEvalCategory.trim(),
          angle: 'Uploaded entry — direct evaluation',
          sort_order: directions.length,
        })
        .select()
        .single()

      if (dirErr || !dir) {
        setQuickEvalError(dirErr?.message || 'Failed to create direction record.')
        return
      }

      // 2. Create an entry_draft from the uploaded material text
      const { data: draft, error: draftErr } = await supabase
        .from('entry_drafts')
        .insert({
          project_id: project.id,
          direction_id: dir.id,
          org_id: currentOrgId,
          created_by: user.id,
          field_key: 'entry',
          field_label: 'Entry',
          version_a: material.extracted_text.slice(0, 10000),
          selected: 'a',
          award_show: quickEvalShow.trim(),
          category: quickEvalCategory.trim(),
          sort_order: 0,
        })
        .select()
        .single()

      if (draftErr || !draft) {
        await supabase.from('directions').delete().eq('id', dir.id)
        setQuickEvalError(draftErr?.message || 'Failed to create entry draft.')
        return
      }

      // Update local state so Entries tab renders immediately
      setDirections(prev => [...prev, dir])
      setEntries(prev => [...prev, draft])

      // 3. Call evaluate-entry Edge Function
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-entry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ project_id: project.id, direction_id: dir.id }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setQuickEvalError(data.error || `Evaluation error: ${res.status}`)
        return
      }
      if (data.evaluation) {
        setEvaluations(prev => ({ ...prev, [dir.id]: data.evaluation }))
      }

      // Close modal and show results in Entries tab
      setShowQuickEvalModal(false)
      setQuickEvalShow('')
      setQuickEvalCategory('')
      setQuickEvalMaterialIdx(null)
      setTab('entries')

    } catch (err) {
      setQuickEvalError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setQuickEvaluating(false)
    }
  }

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  const formatBytes = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  if (loading || fetching) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Loading…</div>
    </div>
  )
  if (!project) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Project not found.</p>
    </div>
  )

  const uniqueDirectionsWithEntries = Array.from(new Set(entries.map(e => e.direction_id)))

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'brief', label: 'Brief' },
    { key: 'materials', label: 'Materials', count: project.materials?.length || 0 },
    { key: 'directions', label: 'Directions', count: directions.length },
    { key: 'entries', label: 'Entries', count: uniqueDirectionsWithEntries.length },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/projects')} className="text-gray-400 hover:text-white transition-colors text-sm">
              ← Projects
            </button>
            <span className="text-gray-600">|</span>
            <div>
              <h1 className="font-semibold text-white leading-tight">{project.campaign_name}</h1>
              {project.client_name && <p className="text-gray-400 text-xs">{project.client_name}</p>}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            project.status === 'active' ? 'bg-green-900/50 text-green-400' :
            project.status === 'final' ? 'bg-indigo-900/50 text-indigo-400' :
            'bg-gray-800 text-gray-400'
          }`}>{project.status}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 flex">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.key ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-gray-800 text-gray-400 text-xs px-1.5 py-0.5 rounded-full leading-none">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── BRIEF ── */}
        {tab === 'brief' && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-300">Campaign Brief</h2>
              {!briefEdit && (
                <button onClick={() => setBriefEdit(true)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Edit</button>
              )}
            </div>
            {briefEdit ? (
              <div>
                <textarea value={briefText} onChange={e => setBriefText(e.target.value)} rows={12}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none text-sm leading-relaxed"
                  placeholder="Describe the campaign in detail…" />
                <div className="flex gap-3 mt-3">
                  <button onClick={saveBrief} disabled={savingBrief}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    {savingBrief ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setBriefEdit(false); setBriefText(project.combined_text || '') }}
                    className="text-gray-400 hover:text-white text-sm px-4 py-2 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                {project.combined_text
                  ? <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{project.combined_text}</p>
                  : <p className="text-gray-600 text-sm italic">No brief added yet. Click Edit to add campaign details.</p>}
              </div>
            )}
            {project.target_shows?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Target Shows</h3>
                <div className="flex flex-wrap gap-2">
                  {project.target_shows.map(show => (
                    <span key={show} className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full">{show}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MATERIALS ── */}
        {tab === 'materials' && (
          <div className="max-w-2xl">
            <p className="text-sm text-gray-400 mb-5">
              Upload supporting files — case studies, results decks, campaign documents. Text and chart data will be extracted and used when generating entry drafts.
            </p>
            {(project.materials || []).length < 5 ? (
              <label className={`block w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'border-gray-700 opacity-60 cursor-not-allowed' : 'border-gray-700 hover:border-indigo-500 cursor-pointer'
              }`}>
                <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                <div className="text-sm">
                  {uploading ? (
                    <div>
                      <div className="text-indigo-400 font-medium mb-1">{uploadProgress || 'Processing…'}</div>
                      <div className="text-gray-500 text-xs">PDFs with charts may take a moment</div>
                    </div>
                  ) : (
                    <><span className="text-indigo-400 font-medium">Click to upload</span><span className="text-gray-500"> — PDF, DOCX, or TXT · max 10MB</span></>
                  )}
                </div>
              </label>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center text-sm text-gray-500">
                Maximum of 5 files per project reached.
              </div>
            )}
            {uploadError && <p className="text-red-400 text-sm mt-2">{uploadError}</p>}
            {(project.materials || []).length > 0 && (
              <div className="mt-4 space-y-2">
                {project.materials.map((m, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-800 rounded-md flex items-center justify-center text-xs text-gray-400 uppercase font-bold flex-shrink-0">{m.type}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{m.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-gray-500">{formatBytes(m.size)} · {new Date(m.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          {m.extracted_text ? <span className="text-xs text-green-500">✓ text extracted</span> : m.type === 'pdf' ? <span className="text-xs text-gray-600">image-only PDF</span> : null}
                          {m.chart_image_paths && m.chart_image_paths.length > 0 && (
                            <span className="text-xs text-indigo-400">+ {m.chart_image_paths.length} chart{m.chart_image_paths.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m.extracted_text && (
                          <button
                            onClick={() => {
                              setQuickEvalMaterialIdx(i)
                              setQuickEvalShow(project.target_shows?.[0] || '')
                              setQuickEvalCategory('')
                              setQuickEvalError('')
                              setShowQuickEvalModal(true)
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Evaluate as Entry
                          </button>
                        )}
                        <button onClick={() => deleteFile(i)} className="text-gray-600 hover:text-red-400 transition-colors text-xs">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(project.materials || []).length === 0 && !uploading && (
              <p className="text-gray-600 text-sm mt-4 text-center">No files uploaded yet.</p>
            )}
          </div>
        )}

        {/* ── DIRECTIONS ── */}
        {tab === 'directions' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-medium text-gray-300">Award Directions</h2>
                <p className="text-gray-500 text-xs mt-0.5">AI-recommended show and category combinations. Generate a draft from any direction, then evaluate it.</p>
              </div>
              <button onClick={generateDirections} disabled={generating || !project.combined_text}
                title={!project.combined_text ? 'Add a brief first' : ''}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                {generating ? (
                  <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generating…</>
                ) : directions.length > 0 ? 'Regenerate Directions' : 'Generate Directions'}
              </button>
            </div>

            {generateError && <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3"><p className="text-red-400 text-sm">{generateError}</p></div>}
            {generateDraftError && <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3"><p className="text-red-400 text-sm">{generateDraftError}</p></div>}

            {!project.combined_text && directions.length === 0 && (
              <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4 mb-4">
                <p className="text-amber-400 text-sm">Add a campaign brief on the Brief tab before generating directions.</p>
              </div>
            )}

            {directions.length === 0 && !generating ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center max-w-lg">
                <p className="text-gray-500 text-sm">{project.combined_text ? 'Click Generate Directions to get started.' : 'Add a brief first, then generate directions.'}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {directions.map(d => {
                  const hasEntries = entries.some(e => e.direction_id === d.id)
                  const hasEval = !!evaluations[d.id]
                  const isGeneratingThis = generatingForDirectionId === d.id
                  return (
                    <div key={d.id} className={`bg-gray-900 border rounded-xl p-5 ${d.chosen ? 'border-indigo-600' : 'border-gray-800'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-white">{d.name}</h3>
                            {d.chosen && <span className="text-xs bg-indigo-900/50 text-indigo-400 px-2 py-0.5 rounded-full">Selected</span>}
                            {hasEntries && <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">Draft ready</span>}
                            {hasEval && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreBg(evaluations[d.id].overall_score)} ${scoreColor(evaluations[d.id].overall_score)}`}>{evaluations[d.id].overall_score}/10</span>}
                          </div>
                          {d.best_show && <p className="text-indigo-400 text-sm mt-0.5">{d.best_show} · <span className="text-gray-400">{d.best_category}</span></p>}
                          {d.hook && <p className="text-gray-200 text-sm mt-2 italic">"{d.hook}"</p>}
                          {d.angle && <p className="text-gray-400 text-sm mt-2">{d.angle}</p>}
                          {d.likelihood_rationale && <p className="text-gray-500 text-xs mt-2">{d.likelihood_rationale}</p>}
                          <div className="flex gap-4 mt-3">
                            {d.strengths && <div className="flex-1"><p className="text-xs text-green-400 font-medium mb-1">Strengths</p><p className="text-xs text-gray-400 leading-relaxed">{d.strengths}</p></div>}
                            {d.risks && <div className="flex-1"><p className="text-xs text-amber-400 font-medium mb-1">Risks</p><p className="text-xs text-gray-400 leading-relaxed">{d.risks}</p></div>}
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-3 flex-wrap">
                            <button onClick={() => generateDraft(d.id)} disabled={generatingDraft}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                              {isGeneratingThis ? (<><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Writing draft…</>) : hasEntries ? 'Regenerate Draft' : 'Generate Draft'}
                            </button>
                            {hasEntries && !isGeneratingThis && (
                              <button onClick={() => setTab('entries')} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                                {hasEval ? 'View entry & evaluation →' : 'View entry →'}
                              </button>
                            )}
                          </div>
                        </div>
                        {d.win_likelihood !== null && (
                          <div className="text-right flex-shrink-0">
                            <p className={`text-2xl font-bold tabular-nums ${d.win_likelihood >= 65 ? 'text-green-400' : d.win_likelihood >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{d.win_likelihood}%</p>
                            <p className="text-gray-600 text-xs">win likelihood</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ENTRIES ── */}
        {tab === 'entries' && (
          <div>
            {evaluateError && (
              <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{evaluateError}</p>
              </div>
            )}

            {entries.length === 0 ? (
              <div className="max-w-lg">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                  <div className="w-10 h-10 bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-indigo-400 text-lg">✦</span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-2">No entry drafts yet</h3>
                  <p className="text-gray-500 text-sm mb-6">
                    {directions.length === 0
                      ? 'Generate directions first, then click Generate Draft on any direction.'
                      : 'Go to Directions and click Generate Draft on the direction you want to enter.'}
                  </p>
                  <button onClick={() => setTab('directions')} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                    Go to Directions →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {directions
                  .filter(d => entries.some(e => e.direction_id === d.id))
                  .map(d => {
                    const fields = entries.filter(e => e.direction_id === d.id)
                    const evaluation = evaluations[d.id]
                    const isEvaluatingThis = evaluatingForDirectionId === d.id
                    const isGeneratingThis = generatingForDirectionId === d.id

                    return (
                      <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

                        {/* Direction header */}
                        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                          <div>
                            <h3 className="font-medium text-white">{d.name}</h3>
                            {d.best_show && (
                              <p className="text-indigo-400 text-xs mt-0.5">
                                {d.best_show} · <span className="text-gray-400">{d.best_category}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {/* Evaluate Entry — primary action */}
                            <button
                              onClick={() => evaluateEntry(d.id)}
                              disabled={evaluating || generatingDraft}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              {isEvaluatingThis ? (
                                <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                              ) : evaluation ? 'Re-evaluate' : 'Evaluate Entry'}
                            </button>
                            {/* Regenerate — secondary */}
                            <button
                              onClick={() => generateDraft(d.id)}
                              disabled={generatingDraft || evaluating}
                              className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                            >
                              {isGeneratingThis ? (
                                <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Regenerating…</>
                              ) : 'Regenerate draft'}
                            </button>
                          </div>
                        </div>

                        {/* Evaluation panel — shown above fields when evaluation exists */}
                        {evaluation && (
                          <div className="px-5 py-5 border-b border-gray-800 bg-gray-950/60">
                            {/* Overall score + timestamp */}
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-baseline gap-1">
                                  <span className={`text-4xl font-bold tabular-nums ${scoreColor(evaluation.overall_score)}`}>
                                    {evaluation.overall_score.toFixed(1)}
                                  </span>
                                  <span className="text-gray-500 text-lg">/10</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">Overall quality · Claude Opus 4.6</p>
                              </div>
                              <p className="text-xs text-gray-600">
                                {new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>

                            {/* Dimension scores — 3 × 2 grid */}
                            <div className="grid grid-cols-3 gap-2 mb-5">
                              {SCORE_DIMENSIONS.map(dim => {
                                const score = evaluation.scores[dim.key] ?? 0
                                return (
                                  <div key={dim.key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(score)}`}>
                                    <p className="text-xs text-gray-400 mb-1">{dim.label}</p>
                                    <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</p>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Strengths & Gaps */}
                            <div className="grid grid-cols-2 gap-5 mb-5">
                              <div>
                                <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Strengths</p>
                                <ul className="space-y-1.5">
                                  {evaluation.strengths.map((s, i) => (
                                    <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-2">
                                      <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                                      <span>{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Gaps</p>
                                <ul className="space-y-1.5">
                                  {evaluation.gaps.map((g, i) => (
                                    <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-2">
                                      <span className="text-red-500 flex-shrink-0 mt-0.5">✗</span>
                                      <span>{g}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            {/* Recommendations */}
                            <div>
                              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Recommendations</p>
                              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{evaluation.recommendations}</p>
                            </div>
                          </div>
                        )}

                        {/* Entry fields */}
                        <div className="divide-y divide-gray-800">
                          {fields.map(field => {
                            const content = field.selected
                              ? (field[`version_${field.selected}` as keyof EntryDraft] as string) ?? field.version_a
                              : field.version_a
                            const wordCount = content ? countWords(content) : 0
                            const overLimit = !!(field.word_limit && wordCount > field.word_limit)
                            return (
                              <div key={field.id} className="px-5 py-5">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-semibold text-gray-200 uppercase tracking-wide">{field.field_label}</p>
                                  <div className="flex items-center gap-3">
                                    {field.word_limit && (
                                      <span className={`text-xs tabular-nums ${overLimit ? 'text-red-400' : 'text-gray-500'}`}>
                                        {wordCount} / {field.word_limit}w
                                      </span>
                                    )}
                                    <button onClick={() => content && navigator.clipboard.writeText(content)}
                                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                                      Copy
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                  {content || <span className="italic text-gray-600">Not yet generated</span>}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── QUICK EVALUATE MODAL ── */}
      {showQuickEvalModal && quickEvalMaterialIdx !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-1">Evaluate Existing Entry</h2>
            <p className="text-xs text-gray-400 mb-5">
              Which award show and category is this entry targeting?
              <span className="block mt-1 text-gray-500 truncate">
                {project.materials[quickEvalMaterialIdx]?.name}
              </span>
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Award Show</label>
                <input
                  type="text"
                  value={quickEvalShow}
                  onChange={e => setQuickEvalShow(e.target.value)}
                  placeholder="e.g. Cannes Lions, Effies, WARC…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Category</label>
                <input
                  type="text"
                  value={quickEvalCategory}
                  onChange={e => setQuickEvalCategory(e.target.value)}
                  placeholder="e.g. Grand Prix, Silver, Creative Effectiveness…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {quickEvalError && (
              <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                <p className="text-red-400 text-xs">{quickEvalError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={evaluateUploadedEntry}
                disabled={quickEvaluating}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {quickEvaluating ? (
                  <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                ) : 'Evaluate Entry'}
              </button>
              <button
                onClick={() => { setShowQuickEvalModal(false); setQuickEvalError('') }}
                disabled={quickEvaluating}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
            </div>

            {quickEvaluating && (
              <p className="text-xs text-gray-500 text-center mt-3">Claude Opus 4.6 is reviewing your entry — this takes about 30–60 seconds.</p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
