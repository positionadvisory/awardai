'use client'
// components/tabs/VideoScriptTab.tsx — Video Script tab, extracted from
// app/projects/[id]/page.tsx (R2, refactor-r1r2-tabs-2026-07-13).
//
// Render/structure-only move. Everything under the "Phase 3 — Video
// Script" state block, the tonal-brief ("brief editor chat") sub-feature,
// and the script editor chat all moved verbatim — they only ever rendered
// inside this tab despite the confusing "brief" naming on some of it (it's
// the tonal-brief editor, not the project Brief tab).
//
// handleScriptFileUpload keeps its own simpler text extractor (mammoth /
// pdfjs-dist, no AcroForm handling, 10-char page threshold) — this is
// intentionally NOT unified with lib/extract-entry-text.ts, which is a
// separate, more thorough extractor used by the Materials tab. Moved as
// its own function, verbatim.
//
// project / directions / entries / evaluations / getToken / user /
// materialHasText / fetchMaterialText / getEntryDraftContent / showsStrip /
// guidanceEnabled / track / setProject all stay lifted on the page and
// arrive as props — all of them are shared with other tabs (Entries,
// Directions, Materials) which are out of scope for this chunk.
//
// Rendered unconditionally by the page and hidden with CSS when another
// tab is active, for the same reason as PressKitTab (R1): this tab holds
// substantial local state (uploaded/generated script text, chat
// histories, category suggestions) that used to persist across tab
// switches because it all lived on the page. Gating the mount on
// tab==='script' would lose that state the moment the user tabbed away.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatError, appErrorFromResponse } from '@/lib/errorMessages'
import { categoriesForShow } from '@/lib/show-taxonomy'
import GeneratingBar from '@/components/GeneratingBar'
import {
  ErrorBanner, materialWordCount, buildAnalysisText,
  type Tab, type Project, type Direction, type Material, type EntryDraft, type ChatMessage, type Evaluation,
  type ScriptAnalysis, type CategorySuggestion, type TonalBrief,
} from '@/app/projects/[id]/page'
import type { User } from '@supabase/supabase-js'
import type { EngagementEventName, EngagementContext } from '@/lib/useEngagement'

interface VideoScriptTabProps {
  tab: Tab
  projectId: string | number
  project: Project
  setProject: React.Dispatch<React.SetStateAction<Project | null>>
  directions: Direction[]
  entries: EntryDraft[]
  evaluations: Record<number, { judge?: Evaluation; coach?: Evaluation }>
  user: User | null
  guidanceEnabled: boolean
  projectIsAoy: boolean
  kbShows: string[]
  showsStrip: React.ReactNode
  getToken: () => Promise<string | null>
  materialHasText: (m: Material) => boolean
  fetchMaterialText: (material: Material | undefined) => Promise<string>
  getEntryDraftContent: (directionId: number) => string
  track: (event: EngagementEventName, context?: EngagementContext) => void
  setShowRequestName: React.Dispatch<React.SetStateAction<string>>
  setShowRequestUrl: React.Dispatch<React.SetStateAction<string>>
  setShowRequestMarket: React.Dispatch<React.SetStateAction<string>>
  setShowRequestKitUrl: React.Dispatch<React.SetStateAction<string>>
  setShowRequestDone: React.Dispatch<React.SetStateAction<boolean>>
  setShowRequestNoKit: React.Dispatch<React.SetStateAction<boolean>>
  setShowRequestModal: React.Dispatch<React.SetStateAction<boolean>>
  onScriptStartedChange: (started: boolean) => void
}

export default function VideoScriptTab({
  tab, projectId, project, setProject, directions, entries, evaluations, user,
  guidanceEnabled, projectIsAoy, kbShows, showsStrip, getToken, materialHasText, fetchMaterialText,
  getEntryDraftContent, track,
  setShowRequestName, setShowRequestUrl, setShowRequestMarket, setShowRequestKitUrl,
  setShowRequestDone, setShowRequestNoKit, setShowRequestModal,
  onScriptStartedChange,
}: VideoScriptTabProps) {

  // Tonal brief (Feature 6)
  const [tonalBriefLoading, setTonalBriefLoading] = useState(false)
  const [tonalBriefData, setTonalBriefData] = useState<TonalBrief | null>(null)
  const [tonalBriefError, setTonalBriefError] = useState('')

  // Script editor chat
  const [scriptChatOpen, setScriptChatOpen] = useState(false)
  const [scriptChatInput, setScriptChatInput] = useState('')
  const [scriptChatting, setScriptChatting] = useState(false)
  const [scriptChatHistory, setScriptChatHistory] = useState<ChatMessage[]>([])
  const [scriptChatError, setScriptChatError] = useState('')

  // Brief editor chat
  const [briefChatOpen, setBriefChatOpen] = useState(false)
  const [briefChatInput, setBriefChatInput] = useState('')
  const [briefChatting, setBriefChatting] = useState(false)
  const [briefChatHistory, setBriefChatHistory] = useState<ChatMessage[]>([])
  const [briefChatError, setBriefChatError] = useState('')

  // Phase 3 — Video Script
  type ScriptMode = 'generate' | 'review'
  const [scriptMode, setScriptMode] = useState<ScriptMode>('generate')
  const [scriptText, setScriptText] = useState<string>('')
  const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysis | null>(null)
  const [generatingScript, setGeneratingScript] = useState(false)
  const [scriptError, setScriptError] = useState('')
  // Award Show + Category dropdowns for script
  const [scriptShow, setScriptShow] = useState<string>('')
  const [scriptCategory, setScriptCategory] = useState<string>('')
  const [customScriptCategory, setCustomScriptCategory] = useState<string>('')
  // Category suggestions
  const [suggestingCategories, setSuggestingCategories] = useState(false)
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([])
  const [suggestCategoryError, setSuggestCategoryError] = useState('')
  // Review mode — file upload
  const [uploadedScriptText, setUploadedScriptText] = useState('')
  const [uploadedScriptName, setUploadedScriptName] = useState('')
  const [scriptFileUploading, setScriptFileUploading] = useState(false)
  const [scriptFileError, setScriptFileError] = useState('')
  // Track last reviewed show/category so button reactivates when user changes them
  const [lastReviewedParams, setLastReviewedParams] = useState<{ show: string; category: string } | null>(null)
  // Script tab: source selector
  const [scriptSourceType, setScriptSourceType] = useState<'all' | 'material' | 'entry'>('all')
  const [scriptSourceMaterialIdx, setScriptSourceMaterialIdx] = useState<number>(-1)
  const [scriptSourceEntryDirectionId, setScriptSourceEntryDirectionId] = useState<number>(-1)

  // KB awards count for Script Analysis subheadline
  const [kbCount, setKbCount] = useState<number>(0)
  // Script: asset mode + eval inclusion
  const [scriptAssetMode, setScriptAssetMode] = useState<'best_possible' | 'minimal'>('best_possible')
  const [scriptIncludeEval, setScriptIncludeEval] = useState(false)
  const [scriptEvalDirectionId, setScriptEvalDirectionId] = useState<number>(-1)

  // Derive the available categories for the chosen script show
  const availableCategories = scriptShow ? categoriesForShow(scriptShow) : []

  // Local equivalent of the page's old spineScriptDone (same formula) —
  // used only for this tab's own guidance-line gating.
  const spineScriptDone = !!(scriptText && scriptText.trim()) || !!project.script_text

  // Effective script category label for display
  const effectiveCategoryLabel = scriptCategory === 'suggest'
    ? (customScriptCategory || 'Suggest Best Fits')
    : scriptCategory

  // Sync local state from the persisted project row on load. Mirrors the
  // page's old one-time hydration (inside its big mount fetch effect) as a
  // targeted effect here, keyed on the specific field so an unrelated
  // project update elsewhere on the page doesn't clobber in-progress edits.
  useEffect(() => {
    if (project?.script_text) setScriptText(project.script_text)
  }, [project?.script_text])
  useEffect(() => {
    if (project?.script_analysis) setScriptAnalysis(project.script_analysis)
  }, [project?.script_analysis])
  useEffect(() => {
    if (project?.tonal_brief) setTonalBriefData(project.tonal_brief as TonalBrief)
  }, [project?.tonal_brief])

  // Fetch total KB campaign count for the Script Analysis subheadline
  // (moved out of the page's shared mount-time fetch effect into its own
  // effect here, now that kbCount lives in this component).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('campaigns').select('*', { count: 'exact', head: true })
      .then(({ count }) => { if (!cancelled && count !== null) setKbCount(count) })
    return () => { cancelled = true }
  }, [user])

  // Report "has the user started a script" up to the page, which feeds the
  // shared progress spine (spineScriptDone used to read scriptText directly
  // on the page; scriptText moved here, so the page can no longer read it).
  useEffect(() => {
    onScriptStartedChange(!!(scriptText && scriptText.trim()))
  }, [scriptText, onScriptStartedChange])

  const generateTonalBrief = async (scriptText?: string) => {
    if (!project) return
    setTonalBriefLoading(true)
    setTonalBriefError('')
    setTonalBriefData(null)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-tonal-brief`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, ...(scriptText ? { script_text: scriptText } : {}) }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setTonalBriefError(formatError(appErrorFromResponse(data, res.status, 'TONAL')))
        return
      }
      if (data.brief) setTonalBriefData(data.brief as TonalBrief)
    } catch (err) {
      setTonalBriefError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'TONAL-NET' }))
    } finally {
      setTonalBriefLoading(false)
    }
  }

  // Script editor chat — sends targeted edit instruction, receives updated script + confirmation
  const sendScriptChat = async () => {
    if (!project || !scriptChatInput.trim() || scriptChatting) return
    const message = scriptChatInput.trim()
    setScriptChatInput('')
    setScriptChatting(true)
    setScriptChatError('')
    const newHistory: ChatMessage[] = [...scriptChatHistory, { role: 'user', content: message }]
    setScriptChatHistory(newHistory)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, message, target: 'script', chat_history: scriptChatHistory }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setScriptChatError(formatError(appErrorFromResponse(data, res.status, 'CHAT-SCRIPT')))
        setScriptChatHistory(prev => prev.slice(0, -1))
        return
      }
      if (data.script) setScriptText(data.script)
      setScriptChatHistory([...newHistory, { role: 'assistant', content: data.reply || 'Script updated.' }])
    } catch (err) {
      setScriptChatError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'CHAT-SCRIPT-NET' }))
      setScriptChatHistory(prev => prev.slice(0, -1))
    } finally {
      setScriptChatting(false)
    }
  }

  // Brief editor chat — sends targeted edit instruction, receives updated brief + confirmation
  const sendBriefChat = async () => {
    if (!project || !briefChatInput.trim() || briefChatting) return
    const message = briefChatInput.trim()
    setBriefChatInput('')
    setBriefChatting(true)
    setBriefChatError('')
    const newHistory: ChatMessage[] = [...briefChatHistory, { role: 'user', content: message }]
    setBriefChatHistory(newHistory)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, message, target: 'brief', chat_history: briefChatHistory, current_brief: tonalBriefData }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setBriefChatError(formatError(appErrorFromResponse(data, res.status, 'CHAT-BRIEF')))
        setBriefChatHistory(prev => prev.slice(0, -1))
        return
      }
      if (data.brief) setTonalBriefData(data.brief as TonalBrief)
      setBriefChatHistory([...newHistory, { role: 'assistant', content: data.reply || 'Brief updated.' }])
    } catch (err) {
      setBriefChatError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'CHAT-BRIEF-NET' }))
      setBriefChatHistory(prev => prev.slice(0, -1))
    } finally {
      setBriefChatting(false)
    }
  }

  const handleScriptFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'txt'].includes(ext || '')) {
      setScriptFileError('Only PDF, DOCX, and TXT files are supported.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setScriptFileError('File size must be under 10MB.')
      return
    }
    setScriptFileUploading(true)
    setScriptFileError('')
    setUploadedScriptText('')
    setUploadedScriptName(file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      let text = ''
      if (ext === 'txt') {
        text = new TextDecoder().decode(arrayBuffer).slice(0, 50000)
      } else if (ext === 'docx') {
        const mammoth = (await import('mammoth')).default
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value.slice(0, 50000)
      } else if (ext === 'pdf') {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const textParts: string[] = []
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          const pageText = (textContent.items as Array<{ str?: string }>)
            .filter(item => typeof item.str === 'string')
            .map(item => item.str as string)
            .join(' ').trim()
          if (pageText.length > 10) textParts.push(pageText)
        }
        text = textParts.join('\n\n').slice(0, 50000)
      }
      if (!text.trim()) {
        setScriptFileError('Could not extract text from this file. Try a different format.')
      } else {
        setUploadedScriptText(text)
      }
    } catch (err) {
      setScriptFileError(err instanceof Error ? err.message : 'Failed to read file.')
    } finally {
      setScriptFileUploading(false)
      e.target.value = ''
    }
  }

  // Suggest best-fit categories for the chosen award show
  const suggestCategories = async () => {
    if (!project || !scriptShow) return
    setSuggestingCategories(true)
    setSuggestCategoryError('')
    setCategorySuggestions([])
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-video-script`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            project_id: project.id,
            mode: 'suggest_categories',
            show: scriptShow,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setSuggestCategoryError(data.error || `Error ${res.status}`)
        return
      }
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setCategorySuggestions(data.suggestions)
      }
    } catch (err) {
      setSuggestCategoryError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSuggestingCategories(false)
    }
  }

  // Call generate-video-script Edge Function (generate or review mode)
  const generateScript = async () => {
    if (!project) return
    if (scriptMode === 'review' && !uploadedScriptText.trim()) {
      setScriptError('Please upload a script file first.')
      return
    }
    setGeneratingScript(true)
    setScriptError('')
    try {
      const accessToken = await getToken()
      if (!accessToken) return

      // Resolve effective show and category
      const effectiveShow = scriptShow.trim() || undefined
      const effectiveCategory = (scriptCategory && scriptCategory !== 'suggest')
        ? scriptCategory
        : customScriptCategory.trim() || undefined

      // Resolve source override (generate mode only)
      // Session 52 (P-03): material text fetched on demand — filtered-list index
      // matches the selector render (same materialHasText predicate).
      let contextOverride: string | undefined
      if (scriptMode === 'generate' && scriptSourceType !== 'all') {
        if (scriptSourceType === 'material') {
          const mats = (project.materials || []).filter(materialHasText)
          contextOverride = (await fetchMaterialText(mats[scriptSourceMaterialIdx])) || undefined
        } else if (scriptSourceType === 'entry' && scriptSourceEntryDirectionId > -1) {
          contextOverride = getEntryDraftContent(scriptSourceEntryDirectionId) || undefined
        }
      }

      // Resolve eval ID for eval-informed script
      let resolvedEvalId: number | undefined
      if (scriptMode === 'generate' && scriptIncludeEval && scriptEvalDirectionId > -1) {
        const dirEvalBoth = evaluations[scriptEvalDirectionId] ?? {}
        const evalForScript = dirEvalBoth.judge ?? dirEvalBoth.coach
        if (evalForScript) resolvedEvalId = evalForScript.id
      }

      const body: Record<string, unknown> = {
        project_id: project.id,
        mode: scriptMode,
        ...(effectiveShow ? { show: effectiveShow } : {}),
        ...(effectiveCategory ? { category: effectiveCategory } : {}),
        ...(scriptMode === 'review' ? { uploaded_script_text: uploadedScriptText } : {}),
        ...(contextOverride ? { context_override: contextOverride } : {}),
        ...(scriptMode === 'generate' ? { asset_mode: scriptAssetMode } : {}),
        ...(resolvedEvalId ? { evaluation_id: resolvedEvalId } : {}),
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-video-script`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setScriptError(data.error || `Error ${res.status}`)
        return
      }
      if (data.script) setScriptText(data.script)
      if (data.analysis) {
        setScriptAnalysis(data.analysis)
        // Track which show/category was used so button reactivates when user changes them
        if (scriptMode === 'review') {
          setLastReviewedParams({ show: scriptShow, category: scriptCategory })
        }
      }
      setProject(p => p ? {
        ...p,
        script_text: data.script || p.script_text,
        script_analysis: data.analysis || p.script_analysis,
      } : p)

      // Auto-generate production brief alongside the script — clear any prior chat histories
      if (data.script) {
        setScriptChatHistory([])
        setBriefChatHistory([])
        generateTonalBrief(data.script)
        track('script_generated', { project_id: Number(projectId), mode: scriptMode, show: scriptShow.trim() || null })
      }
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setGeneratingScript(false)
    }
  }

  return (
          <div className="max-w-3xl">
            {showsStrip}

            {/* Session 54 — guidance-flavored first-visit line (v3 brief §10).
                Shown only while no script exists; respects the toggle. */}
            {guidanceEnabled && !spineScriptDone && (
              <p className="text-gray-700 text-sm mb-4">
                {projectIsAoy
                  ? 'A two-minute agency highlight reel or sizzle of the work, scored for win likelihood, in about twenty minutes.'
                  : 'A two-minute case study script, scored for win likelihood, in about twenty minutes.'}
              </p>
            )}

            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mb-6">
              {(['generate', 'review'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setScriptMode(m); setScriptError('') }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    scriptMode === m
                      ? 'bg-green-800 text-white'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {m === 'generate' ? 'Generate Script' : 'Review my Script'}
                </button>
              ))}
            </div>

            {/* Mode description */}
            <p className="text-sm text-gray-500 mb-5">
              {scriptMode === 'generate'
                ? (projectIsAoy
                    ? 'Generate a 2-minute agency highlight reel or sizzle of the work from your uploaded materials or a completed entry draft. The script follows the Hook → Challenge → Idea → Execution → Results → Close structure used at Cannes, D&AD, and Effies.'
                    : 'Generate a 2-minute award case study film script from your uploaded materials or a completed entry draft. The script follows the Hook → Challenge → Idea → Execution → Results → Close structure used at Cannes, D&AD, and Effies.')
                : (projectIsAoy
                    ? 'Upload your existing highlight reel script and get an optimised version with detailed reasoning on every change — written by a simulated 20-year award jury veteran.'
                    : 'Upload your existing video script and get an optimised version with detailed reasoning on every change — written by a simulated 20-year award jury veteran.')}
            </p>

            {/* Source selector — generate mode only */}
            {scriptMode === 'generate' && (() => {
              const materialsWithText = (project.materials || []).filter(materialHasText)
              const entryDirectionIds = Array.from(new Set(entries.map(e => e.direction_id)))
              if (materialsWithText.length === 0 && entryDirectionIds.length === 0) return null
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Script Source</p>
                  <div className="space-y-2.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="radio" name="scriptSource" checked={scriptSourceType === 'all'}
                        onChange={() => setScriptSourceType('all')}
                        className="mt-0.5 accent-green-700" />
                      <div>
                        <p className="text-sm text-gray-900">All project context</p>
                        <p className="text-xs text-gray-400">Brief description + all uploaded materials</p>
                      </div>
                    </label>
                    {materialsWithText.map((m, i) => (
                      <label key={i} className="flex items-start gap-3 cursor-pointer">
                        <input type="radio" name="scriptSource"
                          checked={scriptSourceType === 'material' && scriptSourceMaterialIdx === i}
                          onChange={() => { setScriptSourceType('material'); setScriptSourceMaterialIdx(i) }}
                          className="mt-0.5 accent-green-700" />
                        <div>
                          <p className="text-sm text-gray-900">{m.name}</p>
                          <p className="text-xs text-gray-400">Uploaded material · {materialWordCount(m).toLocaleString()} words</p>
                        </div>
                      </label>
                    ))}
                    {entryDirectionIds.map(dirId => {
                      const dir = directions.find(d => d.id === dirId)
                      return (
                        <label key={dirId} className="flex items-start gap-3 cursor-pointer">
                          <input type="radio" name="scriptSource"
                            checked={scriptSourceType === 'entry' && scriptSourceEntryDirectionId === dirId}
                            onChange={() => { setScriptSourceType('entry'); setScriptSourceEntryDirectionId(dirId) }}
                            className="mt-0.5 accent-green-700" />
                          <div>
                            <p className="text-sm text-gray-900">Entry Draft{dir?.name ? ` — ${dir.name}` : ''}</p>
                            <p className="text-xs text-gray-400">{dir?.best_show || 'Generated entry'}{dir?.best_category ? ` · ${dir.best_category}` : ''}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Award Show + Category selectors — shared across both modes */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Award Show &amp; Category <span className="text-gray-400 font-normal normal-case">(optional — focuses the script)</span></p>

              {/* Award Show + Category dropdowns */}
              <div className="grid grid-cols-2 gap-4">
                {/* Award Show */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Award Show</label>
                  <div className="relative">
                    <select
                      value={scriptShow}
                      onChange={e => {
                        if (e.target.value === '__request__') {
                          setShowRequestName('')
                          setShowRequestUrl('')
                          setShowRequestMarket('')
                          setShowRequestKitUrl('')
                          setShowRequestDone(false)
                          setShowRequestNoKit(false)
                          setShowRequestModal(true)
                          return
                        }
                        setScriptShow(e.target.value)
                        setScriptCategory('')
                        setCategorySuggestions([])
                        setSuggestCategoryError('')
                      }}
                      className="w-full appearance-none bg-white border border-gray-300 rounded-xl px-3 py-2 pr-8 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors cursor-pointer"
                    >
                      <option value="">No specific show</option>
                      {kbShows.map(show => (
                        <option key={show} value={show}>{show}</option>
                      ))}
                      <option value="__request__">✦ Request a show…</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Category</label>
                  {availableCategories.length > 0 ? (
                    <div className="relative">
                      <select
                        value={scriptCategory}
                        onChange={e => {
                          setScriptCategory(e.target.value)
                          setCategorySuggestions([])
                          setSuggestCategoryError('')
                        }}
                        className="w-full appearance-none bg-white border border-gray-300 rounded-xl px-3 py-2 pr-8 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors cursor-pointer"
                      >
                        <option value="">No specific category</option>
                        <option value="suggest">✦ Suggest Best Fits (AI)</option>
                        {availableCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  ) : scriptShow ? (
                    // Show not in SHOW_CATEGORIES map — free-text input
                    <input
                      type="text"
                      value={customScriptCategory}
                      onChange={e => setCustomScriptCategory(e.target.value)}
                      placeholder="Type category…"
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  ) : (
                    <div className="relative">
                      <select disabled className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-400 cursor-not-allowed">
                        <option>Select a show first</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Suggest Best Fits panel */}
              {scriptCategory === 'suggest' && scriptShow && (
                <div className="pt-1">
                  {categorySuggestions.length === 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-3">
                        AI will analyse your campaign and suggest the top 3 best-fit categories for <strong className="text-gray-700">{scriptShow}</strong>.
                      </p>
                      {suggestCategoryError && (
                        <p className="text-xs text-red-600 mb-2">{suggestCategoryError}</p>
                      )}
                      <button
                        onClick={suggestCategories}
                        disabled={suggestingCategories || (!project.combined_text && !(project.materials || []).some(materialHasText))}
                        className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2"
                      >
                        {suggestingCategories ? (
                          <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Analysing…</>
                        ) : 'Suggest Best Fit Categories'}
                      </button>
                      {!project.combined_text && !(project.materials || []).some(materialHasText) && (
                        <p className="text-xs text-amber-700 mt-2">Add a brief or upload materials first.</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-gray-500 mb-3">Click a suggestion to select it as your target category:</p>
                      <div className="space-y-2">
                        {categorySuggestions.map((sug, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setScriptCategory(sug.category)
                              setCategorySuggestions([])
                            }}
                            className="w-full text-left bg-gray-50 border border-gray-200 hover:border-green-500 hover:bg-green-50 rounded-lg px-4 py-3 transition-colors group"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xs font-bold text-green-700 bg-green-100 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900 group-hover:text-green-800">{sug.category}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sug.reasoning}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => { setCategorySuggestions([]); setSuggestCategoryError('') }}
                        className="text-xs text-gray-400 hover:text-gray-700 mt-3 transition-colors"
                      >
                        ← Try again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Review mode — file upload */}
            {scriptMode === 'review' && (
              <div className="mb-5 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Upload your script (PDF, DOCX, or TXT)</label>
                  <label className={`block w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    scriptFileUploading ? 'border-gray-200 opacity-60 cursor-not-allowed' : 'border-gray-300 hover:border-green-600 cursor-pointer'
                  }`}>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleScriptFileUpload}
                      className="hidden"
                      disabled={scriptFileUploading}
                    />
                    {scriptFileUploading ? (
                      <p className="text-green-700 text-sm font-medium">Extracting text…</p>
                    ) : uploadedScriptText ? (
                      <div>
                        <p className="text-green-700 text-sm font-medium">✓ {uploadedScriptName}</p>
                        <p className="text-gray-400 text-xs mt-1">{uploadedScriptText.trim().split(/\s+/).length.toLocaleString()} words extracted · click to replace</p>
                      </div>
                    ) : (
                      <><span className="text-green-700 font-medium text-sm">Click to upload your script</span><span className="text-gray-400 text-sm"> — PDF, DOCX, or TXT · max 10MB</span></>
                    )}
                  </label>
                  {scriptFileError && <p className="text-red-600 text-xs mt-1.5">{scriptFileError}</p>}
                </div>
              </div>
            )}

            {/* Generate mode guard */}
            {scriptMode === 'generate' && !project.combined_text && !(project.materials || []).some(materialHasText) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <p className="text-amber-700 text-sm">Add a campaign brief on the Brief tab, or upload materials, before generating a script.</p>
              </div>
            )}

            {/* Asset mode + eval options — generate mode only */}
            {scriptMode === 'generate' && (
              <div className="mb-5 space-y-4">
                {/* Asset mode toggle */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Asset availability</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScriptAssetMode('best_possible')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        scriptAssetMode === 'best_possible'
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-gray-600 hover:text-gray-700'
                      }`}
                    >
                      Best possible assets
                    </button>
                    <button
                      onClick={() => setScriptAssetMode('minimal')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        scriptAssetMode === 'minimal'
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-gray-600 hover:text-gray-700'
                      }`}
                    >
                      Minimal assets only
                    </button>
                  </div>
                  {scriptAssetMode === 'minimal' && (
                    <p className="text-xs text-gray-400 mt-1.5">Script will call out exactly what to source for each scene — ideal for lean productions.</p>
                  )}
                </div>

                {/* Eval context inclusion */}
                {directions.some(d => !!(evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)) && (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scriptIncludeEval}
                        onChange={e => setScriptIncludeEval(e.target.checked)}
                        className="rounded border-gray-300 text-green-700 focus:ring-green-600"
                      />
                      <span className="text-xs font-medium text-gray-700">Include evaluation insights</span>
                    </label>
                    {scriptIncludeEval && (
                      <div className="mt-2 ml-5">
                        <p className="text-xs text-gray-400 mb-1.5">Which direction's evaluation to use:</p>
                        <select
                          value={scriptEvalDirectionId}
                          onChange={e => setScriptEvalDirectionId(Number(e.target.value))}
                          className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
                        >
                          <option value={-1}>Select a direction…</option>
                          {directions.filter(d => !!(evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        {scriptEvalDirectionId > -1 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Script will amplify this entry's strengths and directly address the gaps identified in the evaluation.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {scriptError && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-600 text-sm">{scriptError}</p>
              </div>
            )}

            {/* Generate / Review CTA */}
            <button
              onClick={generateScript}
              disabled={
                generatingScript ||
                (scriptMode === 'generate' && !project.combined_text && !(project.materials || []).some(materialHasText)) ||
                (scriptMode === 'review' && !uploadedScriptText.trim()) ||
                scriptCategory === 'suggest'
              }
              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded transition-colors flex items-center gap-2 mb-8"
            >
              {generatingScript ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                {scriptMode === 'generate' ? 'Writing script…' : 'Reviewing script…'}</>
              ) : scriptText && scriptMode === 'generate' ? 'Regenerate Script'
                : scriptMode === 'review' ? (scriptAnalysis ? 'Review Script Again' : 'Review & Optimise Script')
                : 'Generate Script'}
            </button>
            {generatingScript && (
              <div className="mb-6 -mt-4">
                <GeneratingBar isGenerating={generatingScript} estimatedDuration={70000} />
              </div>
            )}

            {scriptCategory === 'suggest' && (
              <p className="text-xs text-amber-700 -mt-6 mb-8">Select a category from the suggestions above before generating.</p>
            )}
            {scriptMode === 'review' && scriptAnalysis && lastReviewedParams &&
              (scriptShow !== lastReviewedParams.show || scriptCategory !== lastReviewedParams.category) && (
              <p className="text-xs text-green-700 -mt-6 mb-8">Show or category changed — click to re-review with new settings.</p>
            )}

            {/* Script output */}
            {scriptText && (
              <div className="space-y-6">

                {/* Review mode: reasoning panel first */}
                {scriptMode === 'review' && scriptAnalysis && (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Script Analysis</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Based on 20 years of award jury experience and {kbCount > 0 ? kbCount.toLocaleString() : '…'} awards won.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const text = buildAnalysisText(
                              scriptAnalysis,
                              project.campaign_name,
                              scriptShow,
                              scriptCategory !== 'suggest' ? scriptCategory : customScriptCategory
                            )
                            navigator.clipboard.writeText(text)
                          }}
                          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                          title="Copy analysis to clipboard"
                        >
                          Copy analysis
                        </button>
                        <button
                          onClick={() => {
                            const text = buildAnalysisText(
                              scriptAnalysis,
                              project.campaign_name,
                              scriptShow,
                              scriptCategory !== 'suggest' ? scriptCategory : customScriptCategory
                            )
                            const blob = new Blob([text], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `${(project.campaign_name || 'script').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-analysis.txt`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                          title="Download analysis as text file"
                        >
                          ↓ Download
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-5 space-y-5">
                      {/* Summary */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overall Assessment</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{scriptAnalysis.summary}</p>
                      </div>

                      {/* Key improvements */}
                      {scriptAnalysis.key_improvements.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Key Improvements</p>
                          <ul className="space-y-2">
                            {scriptAnalysis.key_improvements.map((item, i) => (
                              <li key={i} className="text-sm text-gray-700 flex gap-2">
                                <span className="text-green-700 flex-shrink-0 mt-0.5">✦</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Change-by-change breakdown */}
                      {scriptAnalysis.changes.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Scene-by-Scene Changes</p>
                          <div className="space-y-3">
                            {scriptAnalysis.changes.map((change, i) => (
                              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">{change.section}</p>
                                {change.original && (
                                  <p className="text-xs text-gray-400 italic mb-1.5">Original: "{change.original}"</p>
                                )}
                                <p className="text-sm text-gray-700">{change.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Script text */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {scriptMode === 'review' ? 'Optimised Script' : 'Generated Script'}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        2-minute case study film
                        {(scriptShow || effectiveCategoryLabel) && (
                          <span className="text-green-700"> · {[scriptShow, effectiveCategoryLabel && effectiveCategoryLabel !== 'Suggest Best Fits' ? effectiveCategoryLabel : null].filter(Boolean).join(' — ')}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => navigator.clipboard.writeText(scriptText)}
                        className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Copy script
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([scriptText], { type: 'text/plain' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${(project.campaign_name || 'script').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-script.txt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        ↓ Download
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">{scriptText}</pre>
                  </div>

                  {/* ── Script editor chat ─────────────────────────────────────── */}
                  <div className="px-5 py-4 border-t border-gray-100">
                    <button
                      onClick={() => setScriptChatOpen(v => !v)}
                      className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-600 transition-colors"
                    >
                      <span>✦ Refine with feedback</span>
                      <span className="text-gray-400 text-xs">{scriptChatOpen ? '↑' : '↓'}</span>
                      {scriptChatHistory.length > 0 && !scriptChatOpen && (
                        <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full leading-none ml-1">
                          {Math.floor(scriptChatHistory.length / 2)} edit{Math.floor(scriptChatHistory.length / 2) !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>

                    {scriptChatOpen && (
                      <div className="mt-4">
                        {scriptChatHistory.length === 0 ? (
                          <div className="mb-4">
                            <p className="text-xs text-gray-400 mb-3">Tell me what to change — a specific scene, the VO tone, the close. I'll apply the edit and leave everything else untouched.</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                'Make the hook snappier',
                                'The VO is too formal — loosen it',
                                'Cut Scene 4, it\'s too long',
                                'Rewrite the close to land harder',
                              ].map(prompt => (
                                <button
                                  key={prompt}
                                  onClick={() => setScriptChatInput(prompt)}
                                  className="text-xs text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
                            {scriptChatHistory.map((msg, i) => (
                              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                  msg.role === 'user'
                                    ? 'bg-green-800 text-white'
                                    : 'bg-gray-50 border border-gray-200 text-gray-700'
                                }`}>
                                  <span className="whitespace-pre-wrap">{msg.content}</span>
                                </div>
                              </div>
                            ))}
                            {scriptChatting && (
                              <div className="flex justify-start">
                                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 flex items-center gap-1.5">
                                  <svg className="animate-spin h-3.5 w-3.5 text-green-700" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                  </svg>
                                  <span className="text-xs text-gray-400">Editing script…</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {scriptChatError && (
                          <div className="mb-3">
                            <ErrorBanner error={scriptChatError} />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <input
                            value={scriptChatInput}
                            onChange={e => setScriptChatInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey && !scriptChatting) {
                                e.preventDefault()
                                sendScriptChat()
                              }
                            }}
                            placeholder="What would you like to change? e.g. 'Scene 2 VO is too long — cut it by half'"
                            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                            disabled={scriptChatting}
                          />
                          <button
                            onClick={sendScriptChat}
                            disabled={scriptChatting || !scriptChatInput.trim()}
                            className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors flex-shrink-0"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Production Brief (Feature 6) ─────────────────────────────── */}
                {(tonalBriefLoading || tonalBriefData || tonalBriefError) && (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Production Brief</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Creative direction for your production team — colour, tone, type, voice, and music.</p>
                      </div>
                      {tonalBriefData && (
                        <button
                          onClick={() => {
                            if (!tonalBriefData) return
                            const lines: string[] = [
                              `PRODUCTION BRIEF — ${project.campaign_name || 'Campaign'}`,
                              '═'.repeat(60),
                              '',
                              'OVERVIEW',
                              tonalBriefData.summary,
                              '',
                              'MOOD & TONE',
                              tonalBriefData.mood,
                              '',
                              'COLOUR PALETTE',
                              ...tonalBriefData.color_palette.map(c => `  ${c.hex}  ${c.name} — ${c.role}`),
                              '',
                              'TYPOGRAPHY & SUPERS',
                              tonalBriefData.typography,
                              '',
                              'VOICE OVER DIRECTION',
                              tonalBriefData.vo_style,
                              '',
                              'MUSIC & SOUND',
                              tonalBriefData.music_style,
                              '',
                              'BRAND VISUAL ALIGNMENT',
                              tonalBriefData.brand_notes,
                            ]
                            const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `${(project.campaign_name || 'brief').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-production-brief.txt`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          ↓ Download
                        </button>
                      )}
                    </div>

                    {/* Loading state */}
                    {tonalBriefLoading && (
                      <div className="px-5 py-8 flex items-center gap-3 text-gray-400">
                        <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span className="text-sm">Generating production brief…</span>
                      </div>
                    )}

                    {/* Error state */}
                    {!tonalBriefLoading && tonalBriefError && (
                      <div className="px-5 py-5">
                        <ErrorBanner error={tonalBriefError} />
                        <button
                          onClick={() => generateTonalBrief(scriptText)}
                          className="text-sm text-green-700 hover:text-green-900 font-medium"
                        >
                          Try again
                        </button>
                      </div>
                    )}

                    {/* Brief content */}
                    {!tonalBriefLoading && tonalBriefData && (
                      <div className="px-5 py-6 space-y-7">

                        {/* Summary */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overview</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.summary}</p>
                        </div>

                        {/* Mood */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mood &amp; Tone</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.mood}</p>
                        </div>

                        {/* Colour palette */}
                        {tonalBriefData.color_palette.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Colour Palette</p>
                            <div className="flex gap-3 flex-wrap">
                              {tonalBriefData.color_palette.map((swatch, i) => (
                                <div key={i} className="flex flex-col items-center gap-1.5 min-w-[72px]">
                                  <div
                                    className="w-14 h-14 rounded-xl border border-black/10 shadow-sm flex-shrink-0"
                                    style={{ backgroundColor: swatch.hex }}
                                    title={swatch.name}
                                  />
                                  <span className="text-xs font-mono text-gray-500 select-all">{swatch.hex.toUpperCase()}</span>
                                  <span className="text-xs text-gray-600 text-center leading-snug max-w-[80px]">{swatch.name}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 space-y-2">
                              {tonalBriefData.color_palette.map((swatch, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                  <div
                                    className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5 border border-black/10"
                                    style={{ backgroundColor: swatch.hex }}
                                  />
                                  <p className="text-xs text-gray-600 leading-snug">
                                    <span className="font-medium text-gray-700">{swatch.name}</span> — {swatch.role}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Typography */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Typography &amp; Supers</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.typography}</p>
                        </div>

                        {/* VO Style */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Voice Over Direction</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.vo_style}</p>
                        </div>

                        {/* Music */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Music &amp; Sound</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.music_style}</p>
                        </div>

                        {/* Brand notes */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Brand Visual Alignment</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{tonalBriefData.brand_notes}</p>
                        </div>

                      </div>
                    )}

                    {/* ── Brief editor chat ──────────────────────────────────── */}
                    {!tonalBriefLoading && tonalBriefData && (
                      <div className="px-5 py-4 border-t border-gray-100">
                        <button
                          onClick={() => setBriefChatOpen(v => !v)}
                          className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-600 transition-colors"
                        >
                          <span>✦ Refine with feedback</span>
                          <span className="text-gray-400 text-xs">{briefChatOpen ? '↑' : '↓'}</span>
                          {briefChatHistory.length > 0 && !briefChatOpen && (
                            <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full leading-none ml-1">
                              {Math.floor(briefChatHistory.length / 2)} edit{Math.floor(briefChatHistory.length / 2) !== 1 ? 's' : ''}
                            </span>
                          )}
                        </button>

                        {briefChatOpen && (
                          <div className="mt-4">
                            {briefChatHistory.length === 0 ? (
                              <div className="mb-4">
                                <p className="text-xs text-gray-400 mb-3">Tell me what to adjust — a specific field or the whole direction. Everything else stays the same.</p>
                                <div className="flex flex-wrap gap-2">
                                  {[
                                    'Make the palette more muted',
                                    'The VO style is too formal',
                                    'Suggest a different music direction',
                                    'Make the typography more contemporary',
                                  ].map(prompt => (
                                    <button
                                      key={prompt}
                                      onClick={() => setBriefChatInput(prompt)}
                                      className="text-xs text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      {prompt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
                                {briefChatHistory.map((msg, i) => (
                                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                      msg.role === 'user'
                                        ? 'bg-green-800 text-white'
                                        : 'bg-gray-50 border border-gray-200 text-gray-700'
                                    }`}>
                                      <span className="whitespace-pre-wrap">{msg.content}</span>
                                    </div>
                                  </div>
                                ))}
                                {briefChatting && (
                                  <div className="flex justify-start">
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 flex items-center gap-1.5">
                                      <svg className="animate-spin h-3.5 w-3.5 text-green-700" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                      </svg>
                                      <span className="text-xs text-gray-400">Updating brief…</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {briefChatError && (
                              <div className="mb-3">
                                <ErrorBanner error={briefChatError} />
                              </div>
                            )}

                            <div className="flex gap-2">
                              <input
                                value={briefChatInput}
                                onChange={e => setBriefChatInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey && !briefChatting) {
                                    e.preventDefault()
                                    sendBriefChat()
                                  }
                                }}
                                placeholder="What would you like to change? e.g. 'Swap the green for a warm amber'"
                                className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                                disabled={briefChatting}
                              />
                              <button
                                onClick={sendBriefChat}
                                disabled={briefChatting || !briefChatInput.trim()}
                                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors flex-shrink-0"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* Empty state */}
            {!scriptText && !generatingScript && (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-lg">
                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-700 text-lg">▶</span>
                </div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">No script yet</h3>
                <p className="text-gray-400 text-sm">
                  {scriptMode === 'generate'
                    ? 'Click Generate Script to create a 2-minute award case study film script from your campaign materials.'
                    : 'Upload your existing script and click Review & Optimise to get a rewritten version with detailed change notes.'}
                </p>
              </div>
            )}

          </div>
  )
}
