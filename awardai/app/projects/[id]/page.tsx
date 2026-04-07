'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import GeneratingBar from '@/components/GeneratingBar'
import { MATERIALS_EVAL_STATEMENTS, JURY_EVAL_STATEMENTS, COACH_REVIEW_STATEMENTS } from '@/lib/generatingStatements'

// Canonical list of award shows — displayed in the Brief tab selector
const CANONICAL_SHOWS = [
  'Cannes Lions',
  'D&AD',
  'Clio Awards',
  'One Show',
  'Effies',
  'WARC Awards',
  'WARC Effectiveness Awards',
  'Spikes Asia',
  'Dubai Lynx',
  'Eurobest',
  'New York Festivals',
  'London International Awards',
  'Campaign Big Awards',
  'Creative Circle',
  'Epica Awards',
  'Webby Awards',
  'Shorty Awards',
  'The Drum Awards',
  'Festival of Media',
  'MMA Smarties',
  'Anthem Awards',
  'PR Week Awards',
  'ADMA Awards',
  'Mumbrella Awards',
  'B&T Awards',
  'Campaign Asia Awards',
  'AdFest',
  'Asian Marketing Effectiveness Awards',
  'Asia Pacific Effie Awards',
  'Global Effie Awards',
  'Australian Effies',
  'IAB Mixx Awards',
  'Caples Awards',
  'Gerety Awards',
  'Andy Awards',
  'Communication Arts Awards',
  'Transform Awards',
  'World PR Awards',
  'PRCA Awards',
  'SABRE Awards',
  'Holmes Report SABRE',
  'PRovoke Awards',
  'Cannes Lions PR Lions',
  'INMA Awards',
  'WAN-IFRA Awards',
  'Social Media Marketing Awards',
  'Content Marketing Awards',
  'Digital Communication Awards',
]

// Comprehensive category lists per award show — used in Script tab dropdowns
const SHOW_CATEGORIES: Record<string, string[]> = {
  'Cannes Lions': [
    'Film Lions', 'Film Craft Lions', 'Titanium Lions', 'Grand Prix for Good',
    'Creative Business Transformation Lions', 'Creative Effectiveness Lions',
    'Creative Commerce Lions', 'Creative Data Lions', 'Creative Strategy Lions',
    'Creative X Lions', 'Digital Craft Lions', 'Direct Lions',
    'Entertainment Lions', 'Entertainment Lions for Gaming',
    'Entertainment Lions for Music', 'Entertainment Lions for Sport',
    'Health & Wellness Lions', 'Industry Craft Lions', 'Innovation Lions',
    'Luxury & Lifestyle Lions', 'Media Lions', 'Mobile Lions',
    'Outdoor Lions', 'PR Lions', 'Print & Publishing Lions',
    'Radio & Audio Lions', 'Social & Influencer Lions',
    'Sustainable Development Goals Lions',
  ],
  'D&AD': [
    'Film Advertising', 'Film Advertising Crafts', 'TV & Cinema Advertising',
    'TV & Cinema Crafts', 'Branding', 'Design', 'Digital Design', 'Direct',
    'Experiential', 'Gaming', 'Graphic Design', 'Illustration',
    'Impact / Act / Change', 'Innovation', 'Integrated', 'Music',
    'Outdoor Advertising', 'Packaging Design', 'Photography', 'PR',
    'Publishing', 'Radio & Audio Advertising', 'Social Media',
    'Use of Craft', 'Writing for Design',
  ],
  'Clio Awards': [
    'Branded Entertainment', 'Content & Contact', 'Creative Effectiveness',
    'Culture & Context', 'Design', 'Direct', 'Event & Experiential', 'Fashion',
    'Film', 'Film Technique', 'Health & Wellness', 'Innovation', 'Integration',
    'Out-of-Home', 'PR', 'Print', 'Radio & Audio', 'Social Media',
    'Sports', 'Student', 'Sustainable Development Goals',
  ],
  'One Show': [
    'Advertising', 'Brand Experience', 'Branded Entertainment', 'Branded Film',
    'Business Transformation', 'Content & Distribution', 'Craft',
    'Cultural Impact', 'Design', 'Digital/Mobile', 'Direct', 'Innovation',
    'Integrated', 'Market Disruption', 'Out of Home', 'PR', 'Promotions',
    'Radio & Audio', 'Social & Influencer', 'Spatial Design',
  ],
  'Effies': [
    'Best Insights & Strategic Thinking', 'Best Integrated Campaign',
    'Best Launch', 'Best Long-Term Effects', 'Best New Product/Service',
    'Best Use of Data', 'Best Use of Digital', 'Best Use of Media', 'B2B',
    'Challenger Brand', 'Cultural Breakthrough', 'David vs. Goliath',
    'E-Commerce / Shopper Marketing', 'Engagement & Retention', 'Grand Effie',
    'Health & Wellness', 'Local Brand', 'Purpose-Driven Marketing',
    'Sustained Success',
  ],
  'WARC Awards': [
    'Creative Effectiveness', 'Content', 'Effective Channel Integration',
    'Effective Innovation', 'Grand Prix', 'Media Strategy', 'Social',
  ],
  'WARC Effectiveness Awards': [
    'Best Insight', 'Best Use of Data', 'Grand Prix', 'Long-Term Effectiveness',
    'New Brand or Product', 'Purpose', 'Short-Term Sales', 'Small Budget',
  ],
  'Spikes Asia': [
    'Brand Experience', 'Creative Commerce', 'Creative Data',
    'Creative Effectiveness', 'Creative Strategy', 'Design', 'Digital',
    'Direct', 'Entertainment', 'Film', 'Film Craft', 'Health & Wellness',
    'Innovation', 'Integrated', 'Media', 'Mobile', 'Outdoor', 'PR',
    'Print & Publishing', 'Radio & Audio', 'Social & Influencer',
    'Sustainable Development Goals',
  ],
  'Dubai Lynx': [
    'Brand Experience & Activation', 'Creative Commerce', 'Creative Data',
    'Creative Strategy', 'Design', 'Digital', 'Direct', 'Entertainment',
    'Film', 'Film Craft', 'Health & Wellness', 'Innovation', 'Integrated',
    'Media', 'Mobile', 'Outdoor', 'PR', 'Print & Publishing', 'Radio & Audio',
    'Social & Influencer', 'Sustainable Development Goals',
  ],
  'Eurobest': [
    'Brand Experience & Activation', 'Creative Commerce', 'Creative Data',
    'Creative Effectiveness', 'Creative Strategy', 'Design', 'Digital Craft',
    'Direct', 'Entertainment', 'Film', 'Film Craft', 'Health & Wellness',
    'Industry Craft', 'Innovation', 'Integrated', 'Media', 'Mobile',
    'Outdoor', 'PR', 'Print & Publishing', 'Radio & Audio', 'Social & Influencer',
  ],
  'New York Festivals': [
    'Advertising', 'Brand Design', 'Entertainment', 'Gaming',
    'Health & Wellness', 'Innovation', 'Interactive', 'Out of Home',
    'Branded Film', 'Radio & Audio', 'TV & Cinema',
  ],
  'London International Awards': [
    'Brand Culture', 'Campaign of the Year', 'Creative Use of Data',
    'Design', 'Digital', 'Film', 'Health', 'Innovation', 'Integrated',
    'Non-Traditional', 'Outdoor', 'Print Craft', 'Radio & Audio', 'TV/Cinema',
  ],
  'Campaign Big Awards': [
    'Advertising Effectiveness', 'Best of Show', 'Campaign Film',
    'Campaign of the Year', 'Creative Effectiveness', 'Direct & Data',
    'Digital & Social', 'Integrated Campaign', 'PR Campaign', 'Print & Outdoor',
    'Purpose Campaign', 'Radio & Audio',
  ],
  'Creative Circle': [
    'Best Art Direction', 'Best Campaign', 'Best Copywriting', 'Best Design',
    'Best Digital', 'Best Film', 'Best Integrated', 'Best Music/Audio',
    'Best Outdoor', 'Best PR Campaign', 'Gold Award',
  ],
  'Epica Awards': [
    'Advertising', 'Design', 'Digital', 'Entertainment', 'Film',
    'Green Advertising', 'Integration', 'Outdoor', 'PR', 'Print', 'Radio',
  ],
  'Webby Awards': [
    'Advertising & Media', 'Apps & Software', 'Brands & Marketing',
    'Games', 'General Website & Apps', 'Humor', 'Podcasts & Digital Audio',
    'Social', 'Special Achievement', 'Video',
  ],
  'Shorty Awards': [
    'B2B', 'Brand Strategy', 'Community', 'Content Series',
    'Creative Use of Technology', 'Events & Experiential', 'Gaming',
    'Integration', 'Live Events', 'Long Form Video', 'Rebranding',
    'Short Form Video', 'Social Good', 'Social Media', 'Storytelling',
    'Use of Influencers',
  ],
  'MMA Smarties': [
    'Audience Technology', 'Brand Awareness', 'Brand Innovation',
    'Commerce & Shopper', 'Cross-Platform', 'Data and Insights',
    'KPI Achievement', 'Lead Generation', 'New Market Entry', 'Purpose',
    'Social Impact', 'Sustained Success',
  ],
  'AdFest': [
    'Brand Experience', 'Design', 'Digital', 'Direct', 'Film',
    'Film Craft', 'Integrated', 'Lotus Innovation', 'Media', 'Mobile',
    'Outdoor', 'PR', 'Print', 'Radio',
  ],
  'Asian Marketing Effectiveness Awards': [
    'Best Awareness Campaign', 'Best Brand Experience', 'Best Digital Campaign',
    'Best Effectiveness Campaign', 'Best Integrated Campaign',
    'Best Mobile Campaign', 'Best PR Campaign', 'Best Use of Data', 'Grand Prix',
  ],
  'Asia Pacific Effie Awards': [
    'Best Use of Data', 'Brand Experience', 'Cultural Breakthrough',
    'E-Commerce', 'Grand Effie', 'Insight-Driven', 'Integrated Campaign',
    'Long-Term Effects', 'Media Innovation', 'New Product', 'Purpose',
    'Sustained Success',
  ],
  'Global Effie Awards': [
    'Best Global Campaign', 'Best Use of Insights', 'Cultural Breakthrough',
    'Grand Effie', 'Integrated Campaign', 'Long-Term Effects', 'Media Innovation',
    'New Product/Service', 'Purpose', 'Sustained Success',
  ],
  'Australian Effies': [
    'Best Insight', 'Best Use of Media', 'Brand Experience', 'David vs Goliath',
    'Effectiveness Grand Prix', 'Integrated Campaign', 'Long-Term Effects',
    'New Product Launch', 'Purpose', 'Short-Term Sales',
  ],
}

// Base win rates (% chance of shortlist/metal) per show — used in Directions tab Win Likelihood calculation.
// Sources: published show statistics and industry estimates. Default cap: 30%.
const BASE_WIN_RATES: Record<string, number> = {
  'Cannes Lions': 5,            // ~3–7% for shortlist/metal across most Lions
  'D&AD': 4,                    // Pencils are extremely scarce; ~2–6%
  'One Show': 10,               // Pencil win rate ~8–12%
  'Clio Awards': 12,
  'Effies': 18,                 // Effectiveness shows tend to have broader recognition
  'WARC Awards': 15,
  'WARC Effectiveness Awards': 15,
  'Spikes Asia': 10,
  'Dubai Lynx': 15,
  'Eurobest': 10,
  'New York Festivals': 15,
  'London International Awards': 12,
  'Campaign Big Awards': 15,
  'Creative Circle': 14,
  'Epica Awards': 18,
  'AdFest': 12,
  'Webby Awards': 20,
  'Shorty Awards': 20,
  'MMA Smarties': 20,
  'Asian Marketing Effectiveness Awards': 18,
  'Asia Pacific Effie Awards': 18,
  'Global Effie Awards': 12,
  'Australian Effies': 18,
}

// Calculate realistic win likelihood: base rate × quality adjustment from eval score
// Score 10 → 1.5×, score 5 → 1.0×, score 0 → 0.5×. Hard cap at 45%.
function calculateWinLikelihood(show: string | null, evalScore?: number): number {
  const base = Math.min(BASE_WIN_RATES[show ?? ''] ?? 20, 30)
  if (evalScore !== undefined) {
    const multiplier = 0.5 + (evalScore / 10)
    return Math.round(Math.min(base * multiplier, 45))
  }
  return base
}

type Material = {
  name: string
  path: string
  type: string
  size: number
  uploaded_at: string
  extracted_text?: string
  chart_image_paths?: string[]
}

type ScriptChange = {
  section: string
  original: string
  reason: string
}

type ScriptAnalysis = {
  mode: 'review'
  original_script: string
  summary: string
  key_improvements: string[]
  changes: ScriptChange[]
}

type CategorySuggestion = {
  category: string
  reasoning: string
}

type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  combined_text: string | null
  target_shows: string[]
  materials: Material[]
  status: string
  script_text: string | null
  script_analysis: ScriptAnalysis | null
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

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  version_created?: string
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
  custom_text: string | null
  chat_history: ChatMessage[] | null
  award_show: string | null
  category: string | null
  draft_generation: number       // which generation this draft belongs to (1 = first, 2 = first improvement, etc.)
  created_at?: string
}

type EvaluationScores = {
  strategic_clarity: number
  insight: number
  idea: number
  execution: number
  results: number
  jury_fit: number
  brief_alignment?: number  // coach mode only
}

// v3 evaluation output types (stored in output jsonb column)
type JudgeOutput = {
  talks_up: string[]
  kills_it: string[]
  recommendations: string
}
type PriorityFix = { fix: string; why: string; action: string }
type CoachOutput = {
  focus_point: string
  priority_fixes: PriorityFix[]
  cuts: string[]
}
type EvaluationOutput = JudgeOutput | CoachOutput

type Evaluation = {
  id: number
  entry_draft_id: number
  overall_score: number
  scores: EvaluationScores
  strengths: string[]
  gaps: string[]
  recommendations: string
  changes_analysis?: string | null
  model_used: string | null
  evaluation_mode?: 'judge' | 'coach'
  created_at: string
  eval_chat_history?: ChatMessage[]
  // v3: structured output — null/undefined means legacy display
  output?: EvaluationOutput | null
}

type Tab = 'brief' | 'materials' | 'entries' | 'script' | 'directions'

const SCORE_DIMENSIONS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'strategic_clarity', label: 'Strategic Clarity' },
  { key: 'insight', label: 'Insight' },
  { key: 'idea', label: 'Idea' },
  { key: 'execution', label: 'Execution' },
  { key: 'results', label: 'Results' },
  { key: 'jury_fit', label: 'Jury Fit' },
]

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-700'
  if (score >= 6) return 'text-amber-700'
  return 'text-red-600'
}

function scoreBg(score: number): string {
  if (score >= 8) return 'bg-green-50 border-green-200'
  if (score >= 6) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function buildAnalysisText(
  analysis: ScriptAnalysis,
  campaignName: string,
  show: string,
  category: string
): string {
  const lines = [
    'SCRIPT ANALYSIS REPORT',
    '================================',
    `Project:  ${campaignName}`,
    ...(show ? [`Show:     ${show}`] : []),
    ...(category ? [`Category: ${category}`] : []),
    `Model:    Claude Opus 4.6`,
    '',
    'OVERALL ASSESSMENT',
    '================================',
    analysis.summary,
    '',
  ]
  if (analysis.key_improvements.length > 0) {
    lines.push('KEY IMPROVEMENTS', '================================')
    analysis.key_improvements.forEach((item, i) => {
      lines.push(`${i + 1}. ${item}`)
    })
    lines.push('')
  }
  if (analysis.changes.length > 0) {
    lines.push('SCENE-BY-SCENE CHANGES', '================================')
    analysis.changes.forEach((change, i) => {
      lines.push(`\n[${i + 1}] ${change.section}`)
      if (change.original) lines.push(`Original: "${change.original}"`)
      lines.push(`Rationale: ${change.reason}`)
    })
    lines.push('')
  }
  lines.push('---', 'Generated by AwardAI · awardai-opal.vercel.app')
  return lines.join('\n')
}

export default function ProjectPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [directions, setDirections] = useState<Direction[]>([])
  const [entries, setEntries] = useState<EntryDraft[]>([])
  const [evaluations, setEvaluations] = useState<Record<number, { judge?: Evaluation; coach?: Evaluation }>>({})
  const [evalDisplayMode, setEvalDisplayMode] = useState<Record<number, 'judge' | 'coach'>>({})
  const [evalHistory, setEvalHistory] = useState<Record<number, Evaluation[]>>({})
  const [evalHistoryOpen, setEvalHistoryOpen] = useState<Record<number, boolean>>({})
  const [tab, setTab] = useState<Tab>('brief')
  const [fetching, setFetching] = useState(true)

  // Brief
  const [briefEdit, setBriefEdit] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [savingBrief, setSavingBrief] = useState(false)
  const [targetShows, setTargetShows] = useState<string[]>([])
  const [editingShows, setEditingShows] = useState(false)
  const [savingShows, setSavingShows] = useState(false)
  const [kbShows, setKbShows] = useState<string[]>([])
  const [customShowInput, setCustomShowInput] = useState('')
  // Show request flow
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showRequestName, setShowRequestName] = useState('')
  const [showRequestUrl, setShowRequestUrl] = useState('')
  const [showRequestMarket, setShowRequestMarket] = useState('')
  const [showRequestKitUrl, setShowRequestKitUrl] = useState('')
  const [showRequestSubmitting, setShowRequestSubmitting] = useState(false)
  const [showRequestDone, setShowRequestDone] = useState(false)
  const [showRequestNoKit, setShowRequestNoKit] = useState(false)

  // Materials
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  // Directions generation
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [smartDirectionsLoading, setSmartDirectionsLoading] = useState<Record<number, 'alternatives' | 'other_shows' | null>>({})
  const [smartDirectionsError, setSmartDirectionsError] = useState<Record<number, string>>({})

  // Draft generation
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [generateDraftError, setGenerateDraftError] = useState('')
  const [generatingForDirectionId, setGeneratingForDirectionId] = useState<number | null>(null)

  // Evaluation
  const [evaluating, setEvaluating] = useState(false)
  const [evaluateError, setEvaluateError] = useState('')
  const [evaluatingForDirectionId, setEvaluatingForDirectionId] = useState<number | null>(null)
  const [evaluatingMode, setEvaluatingMode] = useState<Record<number, 'judge' | 'coach'>>({})  // tracks which mode button is spinning
  const [scoreDeltas, setScoreDeltas] = useState<Record<number, Record<string, number>>>({})    // delta per directionId, set after re-evaluation

  // Evaluation chat — keyed by directionId
  const [evalChatOpen, setEvalChatOpen] = useState<Record<number, boolean>>({})
  const [evalChatInput, setEvalChatInput] = useState<Record<number, string>>({})
  const [evalChatting, setEvalChatting] = useState<Record<number, boolean>>({})
  const [evalChatHistory, setEvalChatHistory] = useState<Record<number, ChatMessage[]>>({})

  // Uploaded entry text expand/collapse in Entries tab
  const [expandedEntryFields, setExpandedEntryFields] = useState<Record<number, boolean>>({})
  // Draft version history expand/collapse — keyed by directionId
  const [expandedDraftHistory, setExpandedDraftHistory] = useState<Record<number, boolean>>({})

  // Phase 2 — field refinement via edit-entry Edge Function
  const [refineMessage, setRefineMessage] = useState<Record<number, string>>({})
  const [refiningFieldId, setRefiningFieldId] = useState<number | null>(null)
  const [refineErrors, setRefineErrors] = useState<Record<number, string>>({})

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
  // Directions tab: source selector (same pattern)
  const [dirSourceType, setDirSourceType] = useState<'all' | 'material' | 'entry'>('all')
  const [dirSourceMaterialIdx, setDirSourceMaterialIdx] = useState<number>(-1)
  const [dirSourceEntryDirectionId, setDirSourceEntryDirectionId] = useState<number>(-1)
  // KB awards count for Script Analysis subheadline
  const [kbCount, setKbCount] = useState<number>(0)
  // Script: asset mode + eval inclusion
  const [scriptAssetMode, setScriptAssetMode] = useState<'best_possible' | 'minimal'>('best_possible')
  const [scriptIncludeEval, setScriptIncludeEval] = useState(false)
  const [scriptEvalDirectionId, setScriptEvalDirectionId] = useState<number>(-1)

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

    // Fetch total KB campaign count for the Script Analysis subheadline
    supabase.from('campaigns').select('*', { count: 'exact', head: true })
      .then(({ count }) => { if (count !== null) setKbCount(count) })

    supabase.from('campaigns').select('show_raw').not('show_raw', 'is', null)
      .then(({ data }) => {
        const extra: string[] = []
        if (data) {
          const normalise = (raw: string) =>
            raw
              .replace(/\s+20\d{2}(\s.*)?$/, '')
              .replace(/\s*[-–—:\/]\s*.*$/, '')
              .trim()
          const kbNormalised = Array.from(
            new Set(data.map((d: { show_raw: string }) => normalise(d.show_raw)).filter(s => s.length > 2))
          )
          for (const s of kbNormalised) {
            if (!CANONICAL_SHOWS.some(c => c.toLowerCase() === s.toLowerCase())) {
              extra.push(s)
            }
          }
        }
        setKbShows([...CANONICAL_SHOWS, ...extra.sort()])
      })

    Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('directions').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('entry_drafts').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('evaluations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]).then(([{ data: proj }, { data: dirs }, { data: drafts }, { data: evals }]) => {
      if (proj) {
        setProject(proj)
        setBriefText(proj.combined_text || '')
        setTargetShows(proj.target_shows || [])
        if (proj.script_text) setScriptText(proj.script_text)
        if (proj.script_analysis) setScriptAnalysis(proj.script_analysis)
      }
      if (dirs) setDirections(dirs)

      const draftsList = drafts || []
      if (draftsList.length > 0) setEntries(draftsList)

      if (evals && evals.length > 0 && draftsList.length > 0) {
        // Build lookup: entry_draft_id → { direction_id, draft_generation }
        const draftInfo: Record<number, { direction_id: number; draft_generation: number }> = {}
        for (const d of draftsList) {
          draftInfo[d.id] = { direction_id: d.direction_id, draft_generation: d.draft_generation ?? 0 }
        }

        // Find the max draft_generation per direction (current generation)
        const maxGenByDir: Record<number, number> = {}
        for (const d of draftsList) {
          const gen = d.draft_generation ?? 0
          if (maxGenByDir[d.direction_id] === undefined || gen > maxGenByDir[d.direction_id]) {
            maxGenByDir[d.direction_id] = gen
          }
        }

        // evals ordered by created_at DESC — first seen wins for active slot
        const evalMap: Record<number, { judge?: Evaluation; coach?: Evaluation }> = {}
        const historyMap: Record<number, Evaluation[]> = {}
        const displayModeMap: Record<number, 'judge' | 'coach'> = {}
        const chatMap: Record<number, ChatMessage[]> = {}
        // Track most-recent created_at per direction to set display mode
        const latestByDir: Record<number, { ts: string; mode: 'judge' | 'coach' }> = {}

        for (const ev of evals) {
          const info = draftInfo[ev.entry_draft_id]
          if (!info) continue
          const { direction_id, draft_generation } = info
          const maxGen = maxGenByDir[direction_id] ?? 0
          const mode: 'judge' | 'coach' = ev.evaluation_mode === 'coach' ? 'coach' : 'judge'

          if (draft_generation === maxGen && !evalMap[direction_id]?.[mode]) {
            // Active slot for this mode — first (most recent) wins
            if (!evalMap[direction_id]) evalMap[direction_id] = {}
            evalMap[direction_id][mode] = ev

            // Track most-recently run mode for display default
            if (!latestByDir[direction_id] || ev.created_at > latestByDir[direction_id].ts) {
              latestByDir[direction_id] = { ts: ev.created_at, mode }
            }

            // Restore chat history from most-recent judge eval
            if (mode === 'judge' && ev.eval_chat_history && Array.isArray(ev.eval_chat_history) && ev.eval_chat_history.length > 0) {
              chatMap[direction_id] = ev.eval_chat_history
            }
          } else {
            // Older generation or second eval of same mode → history
            if (!historyMap[direction_id]) historyMap[direction_id] = []
            historyMap[direction_id].push(ev)
          }
        }

        // Set display mode to whichever mode was run most recently
        for (const [dirId, { mode }] of Object.entries(latestByDir)) {
          displayModeMap[Number(dirId)] = mode
        }

        setEvaluations(evalMap)
        setEvalHistory(historyMap)
        setEvalDisplayMode(displayModeMap)
        if (Object.keys(chatMap).length > 0) setEvalChatHistory(chatMap)
      }

      setFetching(false)
    })

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

  const saveShows = async () => {
    if (!project) return
    setSavingShows(true)
    await supabase
      .from('projects')
      .update({ target_shows: targetShows, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, target_shows: targetShows } : p)
    setEditingShows(false)
    setSavingShows(false)
  }

  const toggleShow = (show: string) => {
    setTargetShows(prev =>
      prev.includes(show) ? prev.filter(s => s !== show) : [...prev, show]
    )
  }

  // Check if a typed show name is unknown (not in kbShows) and open the request modal
  const handleCustomShowAdd = (val: string) => {
    if (!val.trim()) return
    const isKnown = kbShows.some(s => s.toLowerCase() === val.trim().toLowerCase())
    if (isKnown) {
      // Just add it — it's a known show
      const canonical = kbShows.find(s => s.toLowerCase() === val.trim().toLowerCase()) ?? val.trim()
      if (!targetShows.includes(canonical)) setTargetShows(prev => [...prev, canonical])
      setCustomShowInput('')
    } else {
      // Unknown show — open the request modal
      setShowRequestName(val.trim())
      setShowRequestUrl('')
      setShowRequestMarket('')
      setShowRequestKitUrl('')
      setShowRequestDone(false)
      setShowRequestNoKit(false)
      setShowRequestModal(true)
    }
  }

  const submitShowRequest = async () => {
    if (!showRequestName.trim()) return
    setShowRequestSubmitting(true)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch('/api/shows/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          show_name:     showRequestName.trim(),
          show_url:      showRequestUrl.trim() || null,
          market:        showRequestMarket.trim() || null,
          entry_kit_url: showRequestKitUrl.trim() || null,
          project_id:    project?.id ?? null,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Add to the user's target shows anyway so they can proceed
        if (!targetShows.includes(showRequestName.trim())) {
          setTargetShows(prev => [...prev, showRequestName.trim()])
        }
        setCustomShowInput('')
        setShowRequestDone(true)
        setShowRequestNoKit(!showRequestKitUrl.trim())
      }
    } catch (e) {
      console.error('Show request submit error:', e)
    } finally {
      setShowRequestSubmitting(false)
    }
  }

  const downloadEvaluation = (d: Direction, evaluation: Evaluation) => {
    const scoreLabel = (s: number) => s >= 8 ? '★★★' : s >= 6 ? '★★☆' : '★☆☆'
    const lines = [
      'AWARD ENTRY EVALUATION REPORT',
      '================================',
      `Project:   ${project?.campaign_name || ''}`,
      `Client:    ${project?.client_name || '—'}`,
      `Direction: ${d.name}`,
      `Show:      ${d.best_show || '—'}`,
      `Category:  ${d.best_category || '—'}`,
      `Evaluated: ${new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Model:     Claude Opus 4.6`,
      '',
      `OVERALL SCORE: ${evaluation.overall_score.toFixed(1)} / 10`,
      '================================',
      '',
      'DIMENSION SCORES:',
      ...SCORE_DIMENSIONS.map(dim => {
        const s = evaluation.scores[dim.key] ?? 0
        return `  ${dim.label.padEnd(20)} ${s}/10  ${scoreLabel(s)}`
      }),
      '',
      'STRENGTHS:',
      ...evaluation.strengths.map((s, i) => `  ${i + 1}. ${s}`),
      '',
      'GAPS:',
      ...evaluation.gaps.map((g, i) => `  ${i + 1}. ${g}`),
      '',
      'RECOMMENDATIONS:',
      evaluation.recommendations,
      '',
      '---',
      'Generated by AwardAI · awardai-opal.vercel.app',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = (d.name || 'evaluation').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    a.download = `evaluation-${safeName}.txt`
    a.click()
    URL.revokeObjectURL(url)
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

      // Resolve context_override from source selector (same pattern as generateScript)
      let dirContextOverride: string | undefined
      if (dirSourceType === 'material') {
        const mats = (project.materials || []).filter((m: { extracted_text?: string }) => m.extracted_text)
        dirContextOverride = mats[dirSourceMaterialIdx]?.extracted_text || undefined
      } else if (dirSourceType === 'entry' && dirSourceEntryDirectionId > -1) {
        dirContextOverride = getEntryDraftContent(dirSourceEntryDirectionId) || undefined
      }

      const body: Record<string, unknown> = { project_id: project.id }
      if (dirContextOverride?.trim()) body.context_override = dirContextOverride

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-directions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setGenerateError(data.error || data.message || `Error ${res.status}`); return }
      setDirections(data.directions || [])
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Network error.')
    } finally { setGenerating(false) }
  }

  // Generate smart directions from a specific evaluation
  const generateSmartDirections = async (
    directionId: number,
    evaluationId: number,
    mode: 'alternatives' | 'other_shows'
  ) => {
    if (!project) return
    setSmartDirectionsLoading(prev => ({ ...prev, [directionId]: mode }))
    setSmartDirectionsError(prev => { const n = { ...prev }; delete n[directionId]; return n })
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-directions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({
            project_id: project.id,
            evaluation_id: evaluationId,
            suggest_mode: mode,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setSmartDirectionsError(prev => ({ ...prev, [directionId]: data.error || `Error ${res.status}` }))
        return
      }
      // Append new smart directions to existing list and switch to Directions tab
      if (data.directions?.length) {
        setDirections(prev => [...prev, ...data.directions])
        setTab('directions')
      }
    } catch (err) {
      setSmartDirectionsError(prev => ({ ...prev, [directionId]: err instanceof Error ? err.message : 'Network error.' }))
    } finally {
      setSmartDirectionsLoading(prev => { const n = { ...prev }; delete n[directionId]; return n })
    }
  }

  const generateDraft = async (directionId: number, evaluationId?: number) => {
    if (!project) return
    setGeneratingDraft(true)
    setGenerateDraftError('')
    setGeneratingForDirectionId(directionId)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const body: Record<string, unknown> = { project_id: project.id, direction_id: directionId }
      if (evaluationId) body.evaluation_id = evaluationId
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-draft`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setGenerateDraftError(data.error || `Error ${res.status}`); return }
      if (data.entry_drafts?.length) {
        // Append new generation — old drafts remain in state for history display
        setEntries(prev => [...prev, ...data.entry_drafts])
        // Note: evaluations are NOT cleared — they belong to their specific generation rows
      }
      setTab('entries')
    } catch (err) {
      setGenerateDraftError(err instanceof Error ? err.message : 'Network error.')
    } finally { setGeneratingDraft(false); setGeneratingForDirectionId(null) }
  }

  const evaluateEntry = async (directionId: number, mode: 'judge' | 'coach' = 'judge', previousEvaluationId?: number) => {
    if (!project) return
    setEvaluating(true)
    setEvaluateError('')
    setEvaluatingForDirectionId(directionId)
    setEvaluatingMode(prev => ({ ...prev, [directionId]: mode }))
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const body: Record<string, unknown> = { project_id: project.id, direction_id: directionId, mode }
      if (previousEvaluationId) body.previous_evaluation_id = previousEvaluationId
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-entry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) { setEvaluateError(data.error || `Error ${res.status}`); return }
      if (data.evaluation) {
        const newEval: Evaluation = data.evaluation
        const evalMode: 'judge' | 'coach' = newEval.evaluation_mode === 'coach' ? 'coach' : 'judge'
        // Push old eval of same mode to history before replacing
        const displaced = evaluations[directionId]?.[evalMode]
        if (displaced) {
          setEvalHistory(prev => ({
            ...prev,
            [directionId]: [displaced, ...(prev[directionId] ?? [])]
          }))
        }
        setEvaluations(prev => ({
          ...prev,
          [directionId]: { ...(prev[directionId] ?? {}), [evalMode]: newEval }
        }))
        setEvalDisplayMode(prev => ({ ...prev, [directionId]: evalMode }))
        // Store score deltas if returned (comparison mode)
        if (data.score_deltas) {
          setScoreDeltas(prev => ({ ...prev, [directionId]: data.score_deltas }))
        } else {
          // Fresh eval with no previous — clear any stored deltas
          setScoreDeltas(prev => { const next = { ...prev }; delete next[directionId]; return next })
        }
        // Reset eval chat when a fresh evaluation is run
        setEvalChatHistory(prev => { const next = { ...prev }; delete next[directionId]; return next })
        setEvalChatOpen(prev => { const next = { ...prev }; delete next[directionId]; return next })
      }
    } catch (err) {
      setEvaluateError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setEvaluating(false)
      setEvaluatingForDirectionId(null)
      setEvaluatingMode(prev => { const next = { ...prev }; delete next[directionId]; return next })
    }
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

      let currentOrgId = orgId
      if (!currentOrgId) {
        const { data } = await supabase.rpc('get_my_org_id')
        currentOrgId = data
        if (currentOrgId) setOrgId(currentOrgId)
      }

      let dir: Direction
      const { data: existingDirs } = await supabase
        .from('directions')
        .select('*')
        .eq('project_id', project.id)
        .eq('best_show', quickEvalShow.trim())
        .eq('best_category', quickEvalCategory.trim())
        .limit(1)

      if (existingDirs && existingDirs.length > 0) {
        dir = existingDirs[0] as Direction
        const { data: oldDrafts } = await supabase
          .from('entry_drafts').select('id').eq('direction_id', dir.id)
        if (oldDrafts && oldDrafts.length > 0) {
          await supabase.from('evaluations').delete().in('entry_draft_id', oldDrafts.map((d: { id: number }) => d.id))
          await supabase.from('entry_drafts').delete().eq('direction_id', dir.id)
        }
        setEntries(prev => prev.filter(e => e.direction_id !== dir.id))
        setEvaluations(prev => { const next = { ...prev }; delete next[dir.id]; return next })
      } else {
        const { data: newDir, error: dirErr } = await supabase
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
        if (dirErr || !newDir) {
          setQuickEvalError(dirErr?.message || 'Failed to create direction record.')
          return
        }
        dir = newDir as Direction
        setDirections(prev => [...prev, dir])
      }

      const { data: draft, error: draftErr } = await supabase
        .from('entry_drafts')
        .insert({
          project_id: project.id,
          direction_id: dir.id,
          org_id: currentOrgId,
          created_by: user.id,
          field_key: 'entry',
          field_label: 'Entry',
          version_a: material.extracted_text.slice(0, 50000),
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

      setEntries(prev => [...prev, draft])

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
        const newEval: Evaluation = data.evaluation
        const evalMode: 'judge' | 'coach' = newEval.evaluation_mode === 'coach' ? 'coach' : 'judge'
        const displacedQuick = evaluations[dir.id]?.[evalMode]
        if (displacedQuick) {
          setEvalHistory(prev => ({
            ...prev,
            [dir.id]: [displacedQuick, ...(prev[dir.id] ?? [])]
          }))
        }
        setEvaluations(prev => ({
          ...prev,
          [dir.id]: { ...(prev[dir.id] ?? {}), [evalMode]: newEval }
        }))
        setEvalDisplayMode(prev => ({ ...prev, [dir.id]: evalMode }))
        // Reset eval chat on fresh quick-evaluation
        setEvalChatHistory(prev => { const next = { ...prev }; delete next[dir.id]; return next })
        setEvalChatOpen(prev => { const next = { ...prev }; delete next[dir.id]; return next })
      }

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

  const switchVersion = async (fieldId: number, version: 'a' | 'b' | 'c') => {
    await supabase.from('entry_drafts').update({ selected: version }).eq('id', fieldId)
    setEntries(prev => prev.map(e => e.id === fieldId ? { ...e, selected: version } : e))
  }

  const refineField = async (field: EntryDraft, dirId: number) => {
    const msg = refineMessage[field.id]?.trim()
    if (!msg || !project) return

    setRefiningFieldId(field.id)
    setRefineErrors(prev => { const next = { ...prev }; delete next[field.id]; return next })
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/edit-entry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            project_id: project.id,
            direction_id: dirId,
            entry_draft_id: field.id,
            message: msg,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setRefineErrors(prev => ({ ...prev, [field.id]: data.error || `Error ${res.status}` }))
        return
      }
      if (data.updated_draft) {
        setEntries(prev => prev.map(e => e.id === field.id ? data.updated_draft : e))
      }
      setRefineMessage(prev => { const next = { ...prev }; delete next[field.id]; return next })
    } catch (err) {
      setRefineErrors(prev => ({ ...prev, [field.id]: err instanceof Error ? err.message : 'Network error.' }))
    } finally {
      setRefiningFieldId(null)
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

  // Send a message to the evaluation chat for a given direction
  const sendEvalChat = async (dirId: number) => {
    const activeMode = evalDisplayMode[dirId] ?? 'judge'
    const evaluation = evaluations[dirId]?.[activeMode]
    if (!evaluation) return
    const msg = (evalChatInput[dirId] || '').trim()
    if (!msg) return

    setEvalChatting(prev => ({ ...prev, [dirId]: true }))
    setEvalChatInput(prev => ({ ...prev, [dirId]: '' }))

    try {
      const accessToken = await getToken()
      if (!accessToken) return

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-evaluation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            evaluation_id: evaluation.id,
            message: msg,
            // chat_history intentionally omitted — loaded server-side from DB (Phase 2 security)
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        // Show error inline without disrupting the chat
        const errMsg = data.error || `Error ${res.status}`
        setEvalChatHistory(prev => ({
          ...prev,
          [dirId]: [...(prev[dirId] || []), { role: 'user', content: msg }, { role: 'assistant', content: `⚠ ${errMsg}` }],
        }))
        return
      }
      if (data.chat_history) {
        setEvalChatHistory(prev => ({ ...prev, [dirId]: data.chat_history }))
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error.'
      setEvalChatHistory(prev => ({
        ...prev,
        [dirId]: [...(prev[dirId] || []), { role: 'user', content: msg }, { role: 'assistant', content: `⚠ ${errMsg}` }],
      }))
    } finally {
      setEvalChatting(prev => ({ ...prev, [dirId]: false }))
    }
  }

  // Helper: build concatenated entry content for a given direction
  const getEntryDraftContent = (directionId: number): string => {
    const dirEntries = entries
      .filter(e => e.direction_id === directionId)
      .sort((a, b) => (a as { sort_order?: number }).sort_order ?? 0 - ((b as { sort_order?: number }).sort_order ?? 0))
    return dirEntries.map(e => {
      const content = e.custom_text ||
        (e.selected === 'c' ? e.version_c : e.selected === 'b' ? e.version_b : e.version_a) ||
        e.version_a || ''
      return content.trim() ? `${e.field_label}:\n${content.trim()}` : ''
    }).filter(Boolean).join('\n\n')
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
      let contextOverride: string | undefined
      if (scriptMode === 'generate' && scriptSourceType !== 'all') {
        if (scriptSourceType === 'material') {
          const mats = (project.materials || []).filter(m => m.extracted_text)
          contextOverride = mats[scriptSourceMaterialIdx]?.extracted_text || undefined
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
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setGeneratingScript(false)
    }
  }

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  const formatBytes = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  // Derive the available categories for the chosen script show
  const availableCategories = scriptShow ? (SHOW_CATEGORIES[scriptShow] || []) : []

  if (loading || fetching) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )
  if (!project) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Project not found.</p>
    </div>
  )

  const uniqueDirectionsWithEntries = Array.from(new Set(entries.map(e => e.direction_id)))

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'brief', label: 'Brief' },
    { key: 'materials', label: 'Materials', count: project.materials?.length || 0 },
    { key: 'directions', label: 'Directions', count: directions.length },
    { key: 'entries', label: 'Entries', count: uniqueDirectionsWithEntries.length },
    { key: 'script', label: 'Video Script' },
  ]

  // Effective script category label for display
  const effectiveCategoryLabel = scriptCategory === 'suggest'
    ? (customScriptCategory || 'Suggest Best Fits')
    : scriptCategory

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.push('/projects')} className="text-gray-500 hover:text-gray-900 transition-colors text-sm shrink-0">
              ← Projects
            </button>
            <span className="text-gray-300 shrink-0">|</span>
            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 leading-tight truncate">{project.campaign_name}</h1>
              {project.client_name && <p className="text-gray-500 text-xs truncate">{project.client_name}</p>}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
            project.status === 'active' ? 'bg-green-100 text-green-700' :
            project.status === 'final' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-500'
          }`}>{project.status}</span>
        </div>
      </header>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-2 sm:px-6 flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.key ? 'border-green-700 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full leading-none">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ── BRIEF ── */}
        {tab === 'brief' && (
          <div className="max-w-2xl space-y-8">

            {/* Project Description */}
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Project Description</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Describe the campaign and what you're hoping to achieve with your entry. The AI uses this to evaluate whether your chosen shows and categories are a strong fit.</p>
                </div>
                {!briefEdit && (
                  <button onClick={() => setBriefEdit(true)} className="text-xs text-green-700 hover:text-green-600 transition-colors ml-4 flex-shrink-0">Edit</button>
                )}
              </div>
              {briefEdit ? (
                <div>
                  <textarea value={briefText} onChange={e => setBriefText(e.target.value)} rows={10}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none text-sm leading-relaxed"
                    placeholder={`Example:\n\nCampaign: [Name of campaign]\nClient: [Client name]\nWhat it was: [Short description of what the campaign did]\nResults: [Key metrics — reach, sales, engagement, etc.]\nWhy you're entering: [Which aspects do you think are strongest? What do you want the AI to focus on when evaluating and drafting?]`} />
                  <div className="flex gap-3 mt-3">
                    <button onClick={saveBrief} disabled={savingBrief}
                      className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                      {savingBrief ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setBriefEdit(false); setBriefText(project.combined_text || '') }}
                      className="text-gray-500 hover:text-gray-900 text-sm px-4 py-2 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-gray-300 transition-colors" onClick={() => setBriefEdit(true)}>
                  {project.combined_text
                    ? <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{project.combined_text}</p>
                    : <p className="text-gray-400 text-sm italic">Click to describe your campaign and entry intentions — this helps the AI evaluate show and category fit.</p>}
                </div>
              )}
            </div>

            {/* Target Award Shows */}
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Target Award Shows</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Select the shows you're considering entering. The AI uses these when suggesting directions and evaluating category fit.</p>
                </div>
                {!editingShows && (
                  <button onClick={() => setEditingShows(true)} className="text-xs text-green-700 hover:text-green-600 transition-colors ml-4 flex-shrink-0">Edit</button>
                )}
              </div>

              {editingShows ? (
                <div>
                  {targetShows.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {targetShows.map(show => (
                        <button key={show} onClick={() => toggleShow(show)}
                          className="flex items-center gap-1.5 text-xs bg-green-100 text-green-800 border border-green-300 px-3 py-1.5 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors">
                          {show} <span>×</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                    <p className="text-xs text-gray-400 mb-3">Select from the list:</p>
                    <div className="flex flex-wrap gap-2">
                      {kbShows.map(show => {
                        const selected = targetShows.includes(show)
                        return (
                          <button key={show} onClick={() => toggleShow(show)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : 'bg-gray-100 text-gray-500 border-gray-300 hover:border-green-600 hover:text-green-700'
                            }`}>
                            {show}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={customShowInput}
                      onChange={e => setCustomShowInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCustomShowAdd(customShowInput)
                        }
                      }}
                      placeholder="Add a show not in the list…"
                      className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                    <button
                      onClick={() => handleCustomShowAdd(customShowInput)}
                      disabled={!customShowInput.trim()}
                      className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-sm px-4 py-2 rounded-lg border border-gray-300 transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={saveShows} disabled={savingShows}
                      className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                      {savingShows ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingShows(false); setTargetShows(project.target_shows || []); setCustomShowInput('') }}
                      className="text-gray-500 hover:text-gray-900 text-sm px-4 py-2 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-300 transition-colors" onClick={() => setEditingShows(true)}>
                  {targetShows.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {targetShows.map(show => (
                        <span key={show} className="text-xs bg-green-50 text-green-800 border border-green-200 px-3 py-1 rounded-full">{show}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm italic">Click to select target award shows.</p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── MATERIALS ── */}
        {tab === 'materials' && (
          <div className="max-w-2xl">
            <p className="text-sm text-gray-500 mb-5">
              Upload supporting files — case studies, results decks, campaign documents. Text and chart data will be extracted and used when generating entry drafts.
            </p>
            {(project.materials || []).length < 5 ? (
              <label className={`block w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'border-gray-300 opacity-60 cursor-not-allowed' : 'border-gray-300 hover:border-green-600 cursor-pointer'
              }`}>
                <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                <div className="text-sm">
                  {uploading ? (
                    <div>
                      <div className="text-green-700 font-medium mb-1">{uploadProgress || 'Processing…'}</div>
                      <div className="text-gray-400 text-xs">PDFs with charts may take a moment</div>
                    </div>
                  ) : (
                    <><span className="text-green-700 font-medium">Click to upload</span><span className="text-gray-400"> — PDF, DOCX, or TXT · max 10MB</span></>
                  )}
                </div>
              </label>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-400">
                Maximum of 5 files per project reached.
              </div>
            )}
            {uploadError && <p className="text-red-600 text-sm mt-2">{uploadError}</p>}
            {(project.materials || []).length > 0 && (
              <div className="mt-4 space-y-2">
                {project.materials.map((m, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-md flex items-center justify-center text-xs text-gray-500 uppercase font-bold flex-shrink-0">{m.type}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{m.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-gray-400">{formatBytes(m.size)} · {new Date(m.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          {m.extracted_text ? <span className="text-xs text-green-700">✓ text extracted</span> : m.type === 'pdf' ? <span className="text-xs text-gray-400">image-only PDF</span> : null}
                          {m.chart_image_paths && m.chart_image_paths.length > 0 && (
                            <span className="text-xs text-green-700">+ {m.chart_image_paths.length} chart{m.chart_image_paths.length > 1 ? 's' : ''}</span>
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
                            className="bg-green-800 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Evaluate as Entry
                          </button>
                        )}
                        <button onClick={() => deleteFile(i)} className="text-gray-400 hover:text-red-600 transition-colors text-xs">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(project.materials || []).length === 0 && !uploading && (
              <p className="text-gray-400 text-sm mt-4 text-center">No files uploaded yet.</p>
            )}
          </div>
        )}

        {/* ── DIRECTIONS ── */}
        {tab === 'directions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-700">Award Directions</h2>
                <p className="text-gray-400 text-xs mt-0.5">AI-recommended show and category combinations. Generate a draft from any direction, then evaluate it.</p>
              </div>
              <button onClick={generateDirections} disabled={generating || (!project.combined_text && !(project.materials || []).some((m: { extracted_text?: string }) => m.extracted_text))}
                title={(!project.combined_text && !(project.materials || []).some((m: { extracted_text?: string }) => m.extracted_text)) ? 'Add a brief or upload materials first' : ''}
                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                {generating ? (
                  <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generating…</>
                ) : directions.length > 0 ? 'Regenerate Directions' : 'Generate Directions'}
              </button>
            </div>

            {generating && (
              <div className="mt-3 mb-4">
                <GeneratingBar isGenerating={generating} estimatedDuration={50000} />
              </div>
            )}

            {/* Directions source selector — only when materials or entries exist */}
            {(() => {
              const mats = (project.materials || []).filter((m: { extracted_text?: string }) => m.extracted_text)
              const entryDirIds = Array.from(new Set(entries.map(e => e.direction_id)))
              if (mats.length === 0 && entryDirIds.length === 0) return null
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Direction Source</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="radio" name="dirSource" checked={dirSourceType === 'all'}
                        onChange={() => setDirSourceType('all')} className="mt-0.5 accent-green-700" />
                      <div>
                        <p className="text-sm text-gray-900">All project context</p>
                        <p className="text-xs text-gray-400">Brief + all uploaded materials</p>
                      </div>
                    </label>
                    {mats.map((m: { name: string; extracted_text?: string }, i: number) => (
                      <label key={i} className="flex items-start gap-3 cursor-pointer">
                        <input type="radio" name="dirSource"
                          checked={dirSourceType === 'material' && dirSourceMaterialIdx === i}
                          onChange={() => { setDirSourceType('material'); setDirSourceMaterialIdx(i) }}
                          className="mt-0.5 accent-green-700" />
                        <div>
                          <p className="text-sm text-gray-900">{m.name}</p>
                          <p className="text-xs text-gray-400">{(m.extracted_text || '').trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</p>
                        </div>
                      </label>
                    ))}
                    {entryDirIds.map(eid => {
                      const dir = directions.find(d => d.id === eid)
                      const label = dir ? `${dir.best_show} · ${dir.best_category}` : `Entry ${eid}`
                      return (
                        <label key={eid} className="flex items-start gap-3 cursor-pointer">
                          <input type="radio" name="dirSource"
                            checked={dirSourceType === 'entry' && dirSourceEntryDirectionId === eid}
                            onChange={() => { setDirSourceType('entry'); setDirSourceEntryDirectionId(eid) }}
                            className="mt-0.5 accent-green-700" />
                          <div>
                            <p className="text-sm text-gray-900">Entry draft — {label}</p>
                            <p className="text-xs text-gray-400">Completed draft entry</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {generateError && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-red-600 text-sm">{generateError}</p></div>}
            {generateDraftError && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-red-600 text-sm">{generateDraftError}</p></div>}

            {!project.combined_text && !(project.materials || []).some(m => m.extracted_text) && directions.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-amber-700 text-sm">Add a campaign brief on the Brief tab, or upload campaign materials, before generating directions.</p>
              </div>
            )}

            {directions.length === 0 && !generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-lg">
                <p className="text-gray-400 text-sm">
                  {(project.combined_text || (project.materials || []).some(m => m.extracted_text))
                    ? 'Click Generate Directions to get started.'
                    : 'Add a brief or upload materials first, then generate directions.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {directions.map(d => {
                  const hasEntries = entries.some(e => e.direction_id === d.id)
                  const dirEvalBoth = evaluations[d.id] ?? {}
                  const dirBestEval = dirEvalBoth.judge ?? dirEvalBoth.coach ?? null
                  const hasEval = !!dirBestEval
                  const isGeneratingThis = generatingForDirectionId === d.id
                  return (
                    <div key={d.id} className={`bg-white border rounded-xl p-5 ${d.chosen ? 'border-green-700' : 'border-gray-200'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-900">{d.name}</h3>
                            {d.chosen && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Selected</span>}
                            {hasEntries && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Draft ready</span>}
                            {hasEval && dirBestEval && <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${scoreBg(dirBestEval.overall_score)} ${scoreColor(dirBestEval.overall_score)}`}>{dirBestEval.overall_score}/10</span>}
                          </div>
                          {d.best_show && <p className="text-green-700 text-sm mt-0.5">{d.best_show} · <span className="text-gray-500">{d.best_category}</span></p>}
                          {d.hook && <p className="text-gray-700 text-sm mt-2 italic">"{d.hook}"</p>}
                          {d.angle && <p className="text-gray-500 text-sm mt-2">{d.angle}</p>}
                          {d.likelihood_rationale && <p className="text-gray-400 text-xs mt-2">{d.likelihood_rationale}</p>}
                          <div className="flex gap-4 mt-3">
                            {d.strengths && <div className="flex-1"><p className="text-xs text-green-700 font-medium mb-1">Strengths</p><p className="text-xs text-gray-500 leading-relaxed">{d.strengths}</p></div>}
                            {d.risks && <div className="flex-1"><p className="text-xs text-amber-700 font-medium mb-1">Risks</p><p className="text-xs text-gray-500 leading-relaxed">{d.risks}</p></div>}
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3 flex-wrap">
                            <button onClick={() => generateDraft(d.id)} disabled={generatingDraft}
                              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                              {isGeneratingThis ? (<><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Writing draft…</>) : hasEntries ? 'Regenerate Draft' : 'Generate Draft'}
                            </button>
                            {hasEntries && !isGeneratingThis && (
                              <button onClick={() => setTab('entries')} className="text-xs text-green-700 hover:text-green-600 transition-colors">
                                {hasEval ? 'View entry & evaluation →' : 'View entry →'}
                              </button>
                            )}
                          </div>
                          {isGeneratingThis && (
                            <div className="mt-3">
                              <GeneratingBar isGenerating={isGeneratingThis} estimatedDuration={60000} />
                            </div>
                          )}
                        </div>
                        {d.win_likelihood !== null && (
                          <div className="flex sm:flex-col gap-6 sm:gap-3 sm:text-right sm:flex-shrink-0 border-t sm:border-0 border-gray-100 pt-3 sm:pt-0">
                            {/* Category Fit */}
                            <div>
                              <p className={`text-2xl font-bold tabular-nums ${d.win_likelihood >= 70 ? 'text-green-700' : d.win_likelihood >= 45 ? 'text-amber-700' : 'text-red-600'}`}>{d.win_likelihood}%</p>
                              <p className="text-gray-400 text-xs">category fit</p>
                            </div>
                            {/* Win Likelihood */}
                            <div>
                              {(() => {
                                const evalScore = (evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)?.overall_score
                                const winPct = calculateWinLikelihood(d.best_show, evalScore)
                                return (
                                  <>
                                    <p className={`text-base font-semibold tabular-nums ${winPct >= 20 ? 'text-green-700' : winPct >= 10 ? 'text-amber-700' : 'text-red-600'}`}>~{winPct}%</p>
                                    <p className="text-gray-400 text-xs">win likelihood{!evalScore ? '*' : ''}</p>
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {directions.some(d => d.win_likelihood !== null && !(evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)) && (
              <p className="text-xs text-gray-400 mt-4">* Win likelihood based on show base rate only — evaluate an entry to factor in content quality.</p>
            )}
          </div>
        )}

        {/* ── ENTRIES ── */}
        {tab === 'entries' && (
          <div>
            {evaluateError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-red-600 text-sm">{evaluateError}</p>
              </div>
            )}

            {entries.length === 0 ? (
              <div className="max-w-lg">
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-700 text-lg">✦</span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">No entry drafts yet</h3>
                  <p className="text-gray-400 text-sm mb-6">
                    {directions.length === 0
                      ? 'Generate directions first, then click Generate Draft on any direction.'
                      : 'Go to Directions and click Generate Draft on the direction you want to enter.'}
                  </p>
                  <button onClick={() => setTab('directions')} className="text-green-700 hover:text-green-600 text-sm transition-colors">
                    Go to Directions →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {Array.from(new Set(entries.map(e => e.direction_id))).map(dirId => {
                    const d = directions.find(dir => dir.id === dirId)
                    const allDirEntries = entries.filter(e => e.direction_id === dirId)
                    // Split by generation: current (latest) vs historical
                    const maxGen = allDirEntries.length > 0 ? Math.max(...allDirEntries.map(e => e.draft_generation ?? 1)) : 1
                    const fields = allDirEntries.filter(e => (e.draft_generation ?? 1) === maxGen)
                    // Group historical generations: each group is an array of fields, sorted desc
                    const historyGens: number[] = Array.from(new Set(allDirEntries.map(e => e.draft_generation ?? 1)))
                      .filter(g => g < maxGen).sort((a, b) => b - a)
                    const historyByGen: Record<number, typeof allDirEntries> = {}
                    for (const g of historyGens) historyByGen[g] = allDirEntries.filter(e => (e.draft_generation ?? 1) === g)
                    const dirName = d?.name || `${fields[0]?.award_show || ''} — ${fields[0]?.category || ''}`.replace(/^ — $/, 'Entry')
                    const dirShow = d?.best_show || fields[0]?.award_show || null
                    const dirCategory = d?.best_category || fields[0]?.category || null
                    const evalBoth = evaluations[dirId] ?? {}
                    const activeMode: 'judge' | 'coach' = evalDisplayMode[dirId] ?? 'judge'
                    const evaluation = evalBoth[activeMode]
                    const hasJudge = !!evalBoth.judge
                    const hasCoach = !!evalBoth.coach
                    const hasBothModes = hasJudge && hasCoach
                    const dirHistory = evalHistory[dirId] ?? []
                    const isEvaluatingThis = evaluatingForDirectionId === dirId
                    const isGeneratingThis = generatingForDirectionId === dirId
                    // Detect when draft has been improved since the last evaluation
                    const evalDraft = evaluation ? allDirEntries.find(e => e.id === evaluation.entry_draft_id) : null
                    const evalGeneration = evalDraft?.draft_generation ?? (evaluation ? 1 : maxGen)
                    const needsReEval = evaluation !== undefined && maxGen > evalGeneration
                    // Score deltas for this direction (set after a comparison re-evaluation)
                    const deltas = scoreDeltas[dirId] ?? null

                    return (
                      <div key={dirId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

                        {/* Direction header */}
                        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
                          <div>
                            <h3 className="font-medium text-gray-900">{dirName}</h3>
                            {dirShow && (
                              <p className="text-green-700 text-xs mt-0.5">
                                {dirShow} · <span className="text-gray-400">{dirCategory}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                            {/* Jury Evaluation button */}
                            <button
                              onClick={() => evaluateEntry(dirId, 'judge', evalBoth.judge?.id)}
                              disabled={evaluating || generatingDraft}
                              title="Evaluate the entry as written — mirrors what a jury member sees"
                              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              {isEvaluatingThis && evaluatingMode[dirId] === 'judge' ? (
                                <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                              ) : (
                                <>⚖ {hasJudge ? 'Re-run Jury Eval' : 'Jury Evaluation'}</>
                              )}
                            </button>
                            {/* Coach Review button */}
                            <button
                              onClick={() => evaluateEntry(dirId, 'coach', evalBoth.coach?.id)}
                              disabled={evaluating || generatingDraft}
                              title="Review entry against all brief & materials — identifies what's being undersold"
                              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              {isEvaluatingThis && evaluatingMode[dirId] === 'coach' ? (
                                <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Coaching…</>
                              ) : (
                                <>✦ {hasCoach ? 'Re-run Coach Review' : 'Coach Review'}</>
                              )}
                            </button>
                            {evaluation && d && (
                              <button
                                onClick={() => downloadEvaluation(d, evaluation)}
                                className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
                                title="Download evaluation as text file"
                              >
                                ↓ Download
                              </button>
                            )}
                            {/* Smart Directions — shown when an evaluation exists */}
                            {(hasJudge || hasCoach) ? (
                              <>
                                <button
                                  onClick={() => {
                                    const evalForSmart = evalBoth.judge ?? evalBoth.coach
                                    if (evalForSmart) generateSmartDirections(dirId, evalForSmart.id, 'alternatives')
                                  }}
                                  disabled={evaluating || generatingDraft || !!smartDirectionsLoading[dirId]}
                                  title="Suggest alternative categories in the same show, informed by this evaluation"
                                  className="text-xs text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40"
                                >
                                  {smartDirectionsLoading[dirId] === 'alternatives' ? (
                                    <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Finding…</>
                                  ) : '✦ Alt Categories'}
                                </button>
                                <button
                                  onClick={() => {
                                    const evalForSmart = evalBoth.judge ?? evalBoth.coach
                                    if (evalForSmart) generateSmartDirections(dirId, evalForSmart.id, 'other_shows')
                                  }}
                                  disabled={evaluating || generatingDraft || !!smartDirectionsLoading[dirId]}
                                  title="Suggest other shows where this entry's strengths would land best"
                                  className="text-xs text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40"
                                >
                                  {smartDirectionsLoading[dirId] === 'other_shows' ? (
                                    <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Finding…</>
                                  ) : '✦ Other Shows'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setTab('directions')}
                                className="text-xs text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                                title="Explore AI-recommended show and category directions"
                              >
                                <span>Suggest Directions</span>
                                <span>→</span>
                              </button>
                            )}
                            <button
                              onClick={() => generateDraft(dirId)}
                              disabled={generatingDraft || evaluating}
                              className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors flex items-center gap-1"
                            >
                              {isGeneratingThis ? (
                                <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Regenerating…</>
                              ) : 'Regenerate draft'}
                            </button>
                          </div>
                        </div>

                        {isGeneratingThis && (
                          <div className="px-5 pt-3 pb-1">
                            <GeneratingBar isGenerating={isGeneratingThis} estimatedDuration={60000} />
                          </div>
                        )}

                        {isEvaluatingThis && (
                          <div className="px-5 pt-3 pb-1">
                            <GeneratingBar
                              isGenerating={isEvaluatingThis}
                              estimatedDuration={50000}
                              statements={evaluatingMode[dirId] === 'coach' ? COACH_REVIEW_STATEMENTS : JURY_EVAL_STATEMENTS}
                            />
                          </div>
                        )}

                        {/* Smart directions error */}
                        {smartDirectionsError[dirId] && (
                          <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between gap-2">
                            <p className="text-xs text-red-600">{smartDirectionsError[dirId]}</p>
                            <button onClick={() => setSmartDirectionsError(prev => { const n = { ...prev }; delete n[dirId]; return n })} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                          </div>
                        )}

                        {/* Needs re-evaluation notice — shown when draft has been improved since last eval */}
                        {needsReEval && !isEvaluatingThis && (
                          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-amber-600 text-sm">⚡</span>
                              <p className="text-sm text-amber-800">
                                Draft updated — re-evaluate to see the impact on scores
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => evaluateEntry(dirId, 'judge', evalBoth.judge?.id)}
                                disabled={evaluating || generatingDraft}
                                className="text-xs font-medium text-amber-800 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                ⚖ {hasJudge ? 'Re-run Jury Eval' : 'Jury Evaluation'}
                              </button>
                              <button
                                onClick={() => evaluateEntry(dirId, 'coach', evalBoth.coach?.id)}
                                disabled={evaluating || generatingDraft}
                                className="text-xs font-medium text-amber-800 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                ✦ {hasCoach ? 'Re-run Coach Review' : 'Coach Review'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Evaluation panel */}
                        {(hasJudge || hasCoach) && (
                          <div className="border-b border-gray-200 bg-gray-50">

                            {/* Mode toggle tab strip — only shown when both modes have been run */}
                            {hasBothModes && (
                              <div className="px-5 pt-4 flex items-center gap-1 border-b border-gray-200">
                                <button
                                  onClick={() => setEvalDisplayMode(prev => ({ ...prev, [dirId]: 'judge' }))}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-t-lg border-b-2 transition-colors -mb-px ${activeMode === 'judge' ? 'border-gray-800 text-gray-900 bg-white' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                                >
                                  ⚖ Jury Evaluation
                                </button>
                                <button
                                  onClick={() => setEvalDisplayMode(prev => ({ ...prev, [dirId]: 'coach' }))}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-t-lg border-b-2 transition-colors -mb-px ${activeMode === 'coach' ? 'border-green-700 text-green-800 bg-white' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                                >
                                  ✦ Coach Review
                                </button>
                              </div>
                            )}

                          <div className="px-5 py-5">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className={`text-4xl font-bold tabular-nums ${scoreColor(evaluation.overall_score)}`}>
                                    {evaluation.overall_score.toFixed(1)}
                                  </span>
                                  <span className="text-gray-400 text-lg">/10</span>
                                  {/* Overall delta badge */}
                                  {deltas?.['overall'] !== undefined && deltas['overall'] !== 0 && (
                                    <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-full ${deltas['overall'] > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                      {deltas['overall'] > 0 ? `↑ +${deltas['overall']}` : `↓ ${deltas['overall']}`}
                                    </span>
                                  )}
                                  {deltas?.['overall'] === 0 && (
                                    <span className="text-sm text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">— No change</span>
                                  )}
                                  {/* Mode badge */}
                                  {evaluation.evaluation_mode === 'coach' ? (
                                    <span className="text-xs font-medium bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full">✦ Coach Review</span>
                                  ) : (
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">⚖ Jury Evaluation</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {evaluation.evaluation_mode === 'coach'
                                    ? 'Scored against brief & materials · Claude Opus 4.6'
                                    : 'Scored on entry as written · Claude Opus 4.6'}
                                </p>
                              </div>
                              <p className="text-xs text-gray-400">
                                {new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-5">
                              {SCORE_DIMENSIONS.map(dim => {
                                const score = evaluation.scores[dim.key] ?? 0
                                const delta = deltas?.[dim.key]
                                return (
                                  <div key={dim.key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(score)}`}>
                                    <p className="text-xs text-gray-500 mb-1">{dim.label}</p>
                                    <div className="flex items-baseline gap-1.5">
                                      <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</p>
                                      {delta !== undefined && delta !== 0 && (
                                        <span className={`text-xs font-semibold tabular-nums ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          {delta > 0 ? `↑+${delta}` : `↓${delta}`}
                                        </span>
                                      )}
                                      {delta === 0 && (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              {/* Brief Alignment — coach mode only */}
                              {evaluation.scores.brief_alignment !== undefined && (() => {
                                const baScore = evaluation.scores.brief_alignment
                                const baDelta = deltas?.['brief_alignment']
                                return (
                                  <div className={`border-2 border-dashed rounded-lg px-3 py-2.5 ${scoreBg(baScore)}`}>
                                    <p className="text-xs text-gray-500 mb-1">Brief Alignment</p>
                                    <div className="flex items-baseline gap-1.5">
                                      <p className={`text-xl font-bold tabular-nums ${scoreColor(baScore)}`}>{baScore}</p>
                                      {baDelta !== undefined && baDelta !== 0 && (
                                        <span className={`text-xs font-semibold tabular-nums ${baDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          {baDelta > 0 ? `↑+${baDelta}` : `↓${baDelta}`}
                                        </span>
                                      )}
                                      {baDelta === 0 && (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>

                            {/* ── v3 output: mode-specific display ─────────────────────── */}
                            {evaluation.output ? (
                              <>
                                {evaluation.evaluation_mode === 'judge' ? (
                                  /* ── Judge mode: talks_up / kills_it / recommendations ── */
                                  (() => {
                                    const o = evaluation.output as JudgeOutput
                                    return (
                                      <>
                                        {/* What Jurors Will Talk Up */}
                                        {o.talks_up && o.talks_up.length > 0 && (
                                          <div className="mb-5">
                                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">What Jurors Will Talk Up</p>
                                            <div className="space-y-2.5">
                                              {o.talks_up.map((s, i) => (
                                                <div key={i} className="bg-green-50 border-l-4 border-green-500 rounded-r-lg px-4 py-3">
                                                  <p className="text-sm text-gray-800 leading-relaxed italic">&ldquo;{s}&rdquo;</p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Where Jurors Will Kill Your Entry */}
                                        {o.kills_it && o.kills_it.length > 0 && (
                                          <div className="mb-5">
                                            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Where Jurors Will Kill Your Entry</p>
                                            <div className="space-y-2.5">
                                              {o.kills_it.map((g, i) => (
                                                <div key={i} className="bg-red-50 border-l-4 border-red-400 rounded-r-lg px-4 py-3">
                                                  <p className="text-sm text-gray-800 leading-relaxed italic">&ldquo;{g}&rdquo;</p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* Recommendations */}
                                        {o.recommendations && (
                                          <div>
                                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Recommendations to Help Your Chances</p>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{o.recommendations}</p>
                                          </div>
                                        )}
                                      </>
                                    )
                                  })()
                                ) : (
                                  /* ── Coach mode: focus_point / priority_fixes / cuts ── */
                                  (() => {
                                    const o = evaluation.output as CoachOutput
                                    return (
                                      <>
                                        {/* Strongest Asset */}
                                        {o.focus_point && (
                                          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
                                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">✦ Your Entry&apos;s Strongest Asset</p>
                                            <p className="text-sm text-gray-800 leading-relaxed">{o.focus_point}</p>
                                          </div>
                                        )}

                                        {/* Priority Fixes */}
                                        {o.priority_fixes && o.priority_fixes.length > 0 && (
                                          <div className="mb-5">
                                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Priority Fixes — Biggest Impact First</p>
                                            <div className="space-y-3">
                                              {o.priority_fixes.map((pf, i) => (
                                                <div key={i} className="border border-gray-200 rounded-xl p-4">
                                                  <p className="text-sm font-semibold text-gray-900 mb-1.5">{i + 1}. {pf.fix}</p>
                                                  <p className="text-xs text-gray-600 mb-1"><span className="font-medium">Why: </span>{pf.why}</p>
                                                  <p className="text-xs text-green-700"><span className="font-medium">How: </span>{pf.action}</p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {/* What to Cut */}
                                        {o.cuts && o.cuts.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">What to Cut</p>
                                            <ul className="space-y-2.5">
                                              {o.cuts.map((c, i) => (
                                                <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                                                  <span className="text-red-500 flex-shrink-0 mt-0.5">✗</span>
                                                  <span>{c}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </>
                                    )
                                  })()
                                )}
                              </>
                            ) : (
                              /* ── Legacy display (v1/v2 evaluations — strengths/gaps/recommendations) ── */
                              <>
                                <div className="grid grid-cols-2 gap-5 mb-5">
                                  <div>
                                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Strengths</p>
                                    <ul className="space-y-2.5">
                                      {evaluation.strengths.map((s, i) => (
                                        <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                                          <span className="text-green-700 flex-shrink-0 mt-0.5">✓</span>
                                          <span>{s}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Gaps</p>
                                    <ul className="space-y-2.5">
                                      {evaluation.gaps.map((g, i) => (
                                        <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                                          <span className="text-red-600 flex-shrink-0 mt-0.5">✗</span>
                                          <span>{g}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Recommendations</p>
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{evaluation.recommendations}</p>
                                </div>
                              </>
                            )}

                            {/* Notable changes — shown when a changes_analysis is present (comparison re-evaluation) */}
                            {evaluation.changes_analysis && (
                              <div className="mt-5 pt-4 border-t border-gray-200">
                                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Notable Changes</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{evaluation.changes_analysis}</p>
                              </div>
                            )}

                            {/* Generate Improved Draft — prominent CTA anchored to this evaluation */}
                            <div className="mt-5 pt-4 border-t border-gray-200">
                              <button
                                onClick={() => generateDraft(dirId, evaluation.id)}
                                disabled={generatingDraft || evaluating}
                                className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                              >
                                {isGeneratingThis ? (
                                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Writing improved draft…</>
                                ) : (
                                  <>✦ Generate Improved Draft from this {evaluation.evaluation_mode === 'coach' ? 'Coach Review' : 'Jury Evaluation'}</>
                                )}
                              </button>
                              <p className="text-xs text-gray-400 text-center mt-2">
                                The new draft will directly address every gap and recommendation above. Previous drafts are kept for comparison.
                              </p>
                            </div>
                          </div>
                          </div>
                        )}

                        {/* Previous Evaluations History */}
                        {dirHistory.length > 0 && (
                          <div className="px-5 py-3 border-b border-gray-100 bg-white">
                            <button
                              onClick={() => setEvalHistoryOpen(prev => ({ ...prev, [dirId]: !prev[dirId] }))}
                              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <span className="text-gray-300">↕</span>
                              <span>{evalHistoryOpen[dirId] ? 'Hide' : 'See'} previous evaluations</span>
                              <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{dirHistory.length}</span>
                            </button>
                            {evalHistoryOpen[dirId] && (
                              <div className="mt-3 space-y-3">
                                {dirHistory.map((hist, hIdx) => {
                                  const hMode = hist.evaluation_mode === 'coach' ? 'coach' : 'judge'
                                  const hDate = new Date(hist.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
                                  const hJudgeOutput = hMode === 'judge' && hist.output ? hist.output as JudgeOutput : null
                                  const hCoachOutput = hMode === 'coach' && hist.output ? hist.output as CoachOutput : null
                                  return (
                                    <div key={hIdx} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-medium text-gray-500">
                                          {hMode === 'coach' ? '✦ Coach Review' : '⚖ Jury Evaluation'}
                                        </span>
                                        <span className="text-xs text-gray-300">·</span>
                                        <span className="text-xs text-gray-400">{hDate}</span>
                                        <span className="text-xs text-gray-300">·</span>
                                        <span className={`text-xs font-bold tabular-nums ${scoreColor(hist.overall_score)}`}>
                                          {hist.overall_score.toFixed(1)}/10
                                        </span>
                                      </div>
                                      {hJudgeOutput && (
                                        <div className="space-y-1.5">
                                          {hJudgeOutput.talks_up?.slice(0, 2).map((t, i) => (
                                            <p key={i} className="text-xs text-gray-600 italic border-l-2 border-green-300 pl-2">"{t}"</p>
                                          ))}
                                          {hJudgeOutput.kills_it?.slice(0, 2).map((k, i) => (
                                            <p key={i} className="text-xs text-gray-600 italic border-l-2 border-red-300 pl-2">"{k}"</p>
                                          ))}
                                        </div>
                                      )}
                                      {hCoachOutput && (
                                        <div className="space-y-1.5">
                                          {hCoachOutput.focus_point && (
                                            <p className="text-xs text-gray-600 border-l-2 border-green-300 pl-2">{hCoachOutput.focus_point}</p>
                                          )}
                                          {hCoachOutput.priority_fixes?.slice(0, 2).map((fix, i) => (
                                            <p key={i} className="text-xs text-gray-500 pl-2">→ {fix.fix}</p>
                                          ))}
                                        </div>
                                      )}
                                      {!hist.output && hist.strengths && (
                                        <p className="text-xs text-gray-500 line-clamp-2">{hist.strengths}</p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Evaluation Chat */}
                        {evaluation && (
                          <div className="px-5 py-4 border-b border-gray-200 bg-white">
                            <button
                              onClick={() => setEvalChatOpen(prev => ({ ...prev, [dirId]: !prev[dirId] }))}
                              className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-600 transition-colors"
                            >
                              <span>✦ Ask about this evaluation</span>
                              <span className="text-gray-400 text-xs">{evalChatOpen[dirId] ? '↑' : '↓'}</span>
                              {(evalChatHistory[dirId] || []).length > 0 && !evalChatOpen[dirId] && (
                                <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full leading-none ml-1">
                                  {Math.floor((evalChatHistory[dirId] || []).length / 2)} message{Math.floor((evalChatHistory[dirId] || []).length / 2) !== 1 ? 's' : ''}
                                </span>
                              )}
                            </button>

                            {evalChatOpen[dirId] && (
                              <div className="mt-4">
                                {/* Message thread */}
                                {(evalChatHistory[dirId] || []).length === 0 ? (
                                  <div className="mb-4">
                                    <p className="text-xs text-gray-400 mb-3">Ask me anything about your scores, what to improve, or how this compares to what wins here.</p>
                                    {/* Prompt starters */}
                                    <div className="flex flex-wrap gap-2">
                                      {[
                                        'Why did I score low on Insight?',
                                        'What would a winning entry do differently?',
                                        'How can I improve my Results section?',
                                        'What is the jury at this show looking for?',
                                      ].map(prompt => (
                                        <button
                                          key={prompt}
                                          onClick={() => {
                                            setEvalChatInput(prev => ({ ...prev, [dirId]: prompt }))
                                          }}
                                          className="text-xs text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          {prompt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
                                    {(evalChatHistory[dirId] || []).map((msg, i) => (
                                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                          msg.role === 'user'
                                            ? 'bg-green-800 text-white'
                                            : 'bg-gray-50 border border-gray-200 text-gray-700'
                                        }`}>
                                          {/* Render line breaks and preserve paragraph spacing */}
                                          <span className="whitespace-pre-wrap">{msg.content}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {evalChatting[dirId] && (
                                      <div className="flex justify-start">
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 flex items-center gap-1.5">
                                          <svg className="animate-spin h-3.5 w-3.5 text-green-700" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                          </svg>
                                          <span className="text-xs text-gray-400">Thinking…</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Input row */}
                                <div className="flex gap-2">
                                  <input
                                    value={evalChatInput[dirId] || ''}
                                    onChange={e => setEvalChatInput(prev => ({ ...prev, [dirId]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.shiftKey && !evalChatting[dirId]) {
                                        e.preventDefault()
                                        sendEvalChat(dirId)
                                      }
                                    }}
                                    placeholder="Ask about your scores, what to improve, or what wins here…"
                                    className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                                    disabled={evalChatting[dirId]}
                                  />
                                  <button
                                    onClick={() => sendEvalChat(dirId)}
                                    disabled={evalChatting[dirId] || !(evalChatInput[dirId] || '').trim()}
                                    className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
                                  >
                                    Send
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Entry fields */}
                        <div className="divide-y divide-gray-100">
                          {fields.map(field => {
                            const content = field.selected
                              ? (field[`version_${field.selected}` as keyof EntryDraft] as string) ?? field.version_a
                              : field.version_a
                            const wordCount = content ? countWords(content) : 0
                            const overLimit = !!(field.word_limit && wordCount > field.word_limit)
                            const isUploadedDoc = field.field_key === 'entry'
                            const isExpanded = expandedEntryFields[field.id] ?? false

                            if (isUploadedDoc) {
                              return (
                                <div key={field.id} className="px-5 py-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded Entry</p>
                                      <span className="text-xs text-gray-400">{wordCount.toLocaleString()} words</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <button onClick={() => content && navigator.clipboard.writeText(content)}
                                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Copy</button>
                                      <button
                                        onClick={() => setExpandedEntryFields(prev => ({ ...prev, [field.id]: !isExpanded }))}
                                        className="text-xs text-green-700 hover:text-green-600 transition-colors">
                                        {isExpanded ? 'Collapse ↑' : 'View full entry ↓'}
                                      </button>
                                    </div>
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-3 max-h-96 overflow-y-auto pr-1">
                                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
                                    </div>
                                  )}
                                </div>
                              )
                            }

                            const isRefining = refiningFieldId === field.id
                            const userHistory = (field.chat_history || []).filter(m => m.role === 'user')
                            return (
                              <div key={field.id} className="px-5 py-5">

                                <div className="flex items-start justify-between mb-3 gap-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{field.field_label}</p>
                                    {(field.version_b || field.version_c) && (
                                      <div className="flex items-center gap-1">
                                        {(['a', 'b', 'c'] as const).map(v => {
                                          const hasV = v === 'a' ? !!field.version_a : v === 'b' ? !!field.version_b : !!field.version_c
                                          if (!hasV) return null
                                          const isActive = (field.selected || 'a') === v
                                          return (
                                            <button key={v} onClick={() => switchVersion(field.id, v)}
                                              className={`text-xs px-2 py-0.5 rounded border font-medium uppercase transition-colors ${
                                                isActive
                                                  ? 'bg-green-800 border-green-700 text-white'
                                                  : 'bg-gray-100 border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                                              }`}>
                                              {v}
                                            </button>
                                          )
                                        })}
                                        {(field.selected || 'a') !== 'a' && (
                                          <span className="text-xs text-green-700 ml-0.5">refined</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    {field.word_limit && (
                                      <span className={`text-xs tabular-nums ${overLimit ? 'text-red-600' : 'text-gray-400'}`}>
                                        {wordCount} / {field.word_limit}w
                                      </span>
                                    )}
                                    <button onClick={() => content && navigator.clipboard.writeText(content)}
                                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                      Copy
                                    </button>
                                  </div>
                                </div>

                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">
                                  {content || <span className="italic text-gray-400">Not yet generated</span>}
                                </p>

                                {userHistory.length > 0 && (
                                  <div className="mb-3 space-y-1.5">
                                    {userHistory.map((msg, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                        <span className="text-gray-300">↺</span>
                                        <span className="italic">"{msg.content}"</span>
                                        {msg.version_created && (
                                          <span className="text-green-700 font-medium uppercase">→ {msg.version_created}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {refineErrors[field.id] && (
                                  <p className="text-xs text-red-600 mb-2">{refineErrors[field.id]}</p>
                                )}
                                <div className="flex gap-2">
                                  <input
                                    value={refineMessage[field.id] || ''}
                                    onChange={e => setRefineMessage(prev => ({ ...prev, [field.id]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        refineField(field, dirId)
                                      }
                                    }}
                                    placeholder={`Refine with AI — e.g. "make this punchier" or "cut to ${field.word_limit ? field.word_limit + ' words' : '100 words'}"`}
                                    disabled={isRefining}
                                    className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors disabled:opacity-50"
                                  />
                                  <button
                                    onClick={() => refineField(field, dirId)}
                                    disabled={isRefining || !refineMessage[field.id]?.trim()}
                                    className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
                                  >
                                    {isRefining ? (
                                      <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Refining…</>
                                    ) : 'Refine →'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Compact re-evaluate bar — always visible at bottom of draft area when an evaluation exists */}
                        {(hasJudge || hasCoach) && !needsReEval && (
                          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-xs text-gray-400">Re-evaluate this draft</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => evaluateEntry(dirId, 'judge', evalBoth.judge?.id)}
                                disabled={evaluating || generatingDraft}
                                className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {isEvaluatingThis && evaluatingMode[dirId] === 'judge' ? (
                                  <><svg className="animate-spin h-3 w-3 inline mr-1" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                                ) : hasJudge ? '⚖ Re-run Jury Eval' : '⚖ Jury Eval'}
                              </button>
                              <button
                                onClick={() => evaluateEntry(dirId, 'coach', evalBoth.coach?.id)}
                                disabled={evaluating || generatingDraft}
                                className="text-xs text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {isEvaluatingThis && evaluatingMode[dirId] === 'coach' ? (
                                  <><svg className="animate-spin h-3 w-3 inline mr-1" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Coaching…</>
                                ) : hasCoach ? '✦ Re-run Coach Review' : '✦ Coach Review'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Draft version history — collapsed by default */}
                        {historyGens.length > 0 && (
                          <div className="border-t border-gray-100">
                            <button
                              onClick={() => setExpandedDraftHistory(prev => ({ ...prev, [dirId]: !prev[dirId] }))}
                              className="w-full flex items-center justify-between px-5 py-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <span>{historyGens.length} previous draft{historyGens.length !== 1 ? 's' : ''} — click to compare</span>
                              <span>{expandedDraftHistory[dirId] ? '↑ Hide' : '↓ Show'}</span>
                            </button>
                            {expandedDraftHistory[dirId] && (
                              <div className="divide-y divide-gray-100 bg-gray-50">
                                {historyGens.map(gen => {
                                  const genFields = historyByGen[gen]
                                  const genDate = genFields[0]?.created_at
                                    ? new Date(genFields[0].created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : null
                                  return (
                                    <div key={gen} className="px-5 py-4">
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                        Draft v{gen}{genDate ? ` · ${genDate}` : ''}
                                      </p>
                                      <div className="space-y-3">
                                        {genFields.map(field => {
                                          const histContent = field.custom_text?.trim()
                                            || (field.selected ? (field[`version_${field.selected}` as keyof EntryDraft] as string) : null)
                                            || field.version_a || ''
                                          return (
                                            <div key={field.id}>
                                              <p className="text-xs font-medium text-gray-500 mb-1">{field.field_label}</p>
                                              <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{histContent}</p>
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

                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ── VIDEO SCRIPT ── */}
        {tab === 'script' && (
          <div className="max-w-3xl">

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
                ? 'Generate a 2-minute award case study film script from your uploaded materials or a completed entry draft. The script follows the Hook → Challenge → Idea → Execution → Results → Close structure used at Cannes, D&AD, and Effies.'
                : 'Upload your existing video script and get an optimised version with detailed reasoning on every change — written by a simulated 20-year award jury veteran.'}
            </p>

            {/* Source selector — generate mode only */}
            {scriptMode === 'generate' && (() => {
              const materialsWithText = (project.materials || []).filter(m => m.extracted_text)
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
                          <p className="text-xs text-gray-400">Uploaded material · {(m.extracted_text || '').trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</p>
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

              {/* Award Show dropdown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Award Show</label>
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
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
                  >
                    <option value="">No specific show</option>
                    {kbShows.map(show => (
                      <option key={show} value={show}>{show}</option>
                    ))}
                    <option value="__request__" className="text-gray-400">✦ Request a show…</option>
                  </select>
                </div>

                {/* Category dropdown */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Category</label>
                  {availableCategories.length > 0 ? (
                    <select
                      value={scriptCategory}
                      onChange={e => {
                        setScriptCategory(e.target.value)
                        setCategorySuggestions([])
                        setSuggestCategoryError('')
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
                    >
                      <option value="">No specific category</option>
                      <option value="suggest">✦ Suggest Best Fits (AI)</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : scriptShow ? (
                    // Show not in SHOW_CATEGORIES map — free-text input
                    <input
                      type="text"
                      value={customScriptCategory}
                      onChange={e => setCustomScriptCategory(e.target.value)}
                      placeholder="Type category…"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  ) : (
                    <select disabled className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed">
                      <option>Select a show first</option>
                    </select>
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
                        disabled={suggestingCategories || (!project.combined_text && !(project.materials || []).some(m => m.extracted_text))}
                        className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                      >
                        {suggestingCategories ? (
                          <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Analysing…</>
                        ) : 'Suggest Best Fit Categories'}
                      </button>
                      {!project.combined_text && !(project.materials || []).some(m => m.extracted_text) && (
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
            {scriptMode === 'generate' && !project.combined_text && !(project.materials || []).some(m => m.extracted_text) && (
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
                (scriptMode === 'generate' && !project.combined_text && !(project.materials || []).some(m => m.extracted_text)) ||
                (scriptMode === 'review' && !uploadedScriptText.trim()) ||
                scriptCategory === 'suggest'
              }
              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 mb-8"
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
                        {scriptMode === 'generate' ? 'Claude Sonnet 4.6' : 'Claude Opus 4.6'} · 2-minute case study film
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
                </div>

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
        )}

      </main>

      {/* ── QUICK EVALUATE MODAL ── */}
      {showQuickEvalModal && quickEvalMaterialIdx !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Evaluate Existing Entry</h2>
            <p className="text-xs text-gray-400 mb-5">
              Which award show and category is this entry targeting?
              <span className="block mt-1 text-gray-400 truncate">
                {project.materials[quickEvalMaterialIdx]?.name}
              </span>
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Award Show</label>
                <input
                  type="text"
                  value={quickEvalShow}
                  onChange={e => setQuickEvalShow(e.target.value)}
                  placeholder="e.g. Cannes Lions, Effies, WARC…"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                />
                {quickEvalShow.trim().length > 2 && !kbShows.some(s => s.toLowerCase() === quickEvalShow.trim().toLowerCase()) && (
                  <p className="text-xs text-amber-700 mt-1">
                    Not in our system yet.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setShowRequestName(quickEvalShow.trim())
                        setShowRequestUrl('')
                        setShowRequestMarket('')
                        setShowRequestKitUrl('')
                        setShowRequestDone(false)
                        setShowRequestNoKit(false)
                        setShowRequestModal(true)
                      }}
                      className="underline hover:no-underline"
                    >
                      Request it
                    </button>{' '}and we'll add it shortly.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Category</label>
                <input
                  type="text"
                  value={quickEvalCategory}
                  onChange={e => setQuickEvalCategory(e.target.value)}
                  placeholder="e.g. Grand Prix, Silver, Creative Effectiveness…"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                />
              </div>
            </div>

            {quickEvalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-red-600 text-xs">{quickEvalError}</p>
              </div>
            )}

            {quickEvaluating && (
              <div className="mb-4">
                <GeneratingBar
                  isGenerating={quickEvaluating}
                  estimatedDuration={50000}
                  statements={MATERIALS_EVAL_STATEMENTS}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={evaluateUploadedEntry}
                disabled={quickEvaluating}
                className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {quickEvaluating ? (
                  <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                ) : 'Evaluate Entry'}
              </button>
              <button
                onClick={() => { setShowQuickEvalModal(false); setQuickEvalError('') }}
                disabled={quickEvaluating}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Request a new show</h2>
              {!showRequestDone ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    <span className="font-medium text-gray-800">{showRequestName}</span> isn't in our system yet. Give us a few details and we'll add it shortly.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Show website</label>
                      <input
                        type="url"
                        value={showRequestUrl}
                        onChange={e => setShowRequestUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Primary market</label>
                      <input
                        type="text"
                        value={showRequestMarket}
                        onChange={e => setShowRequestMarket(e.target.value)}
                        placeholder="e.g. Global, APAC, Australia…"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Entry kit URL <span className="text-gray-400 font-normal">(optional but helpful)</span></label>
                      <input
                        type="url"
                        value={showRequestKitUrl}
                        onChange={e => setShowRequestKitUrl(e.target.value)}
                        placeholder="https://example.com/entry-kit"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={submitShowRequest}
                      disabled={showRequestSubmitting}
                      className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                    >
                      {showRequestSubmitting ? 'Sending…' : 'Send request'}
                    </button>
                    <button
                      onClick={() => { setShowRequestModal(false); setCustomShowInput('') }}
                      disabled={showRequestSubmitting}
                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="py-4 text-center">
                    <div className="text-3xl mb-3">✓</div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Request sent for <span className="text-green-800">{showRequestName}</span></p>
                    <p className="text-sm text-gray-500 mb-1">We'll add it to the system shortly.</p>
                    {showRequestNoKit && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        No entry kit provided — we'll track one down, but it may take a little longer.
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-3">
                      <span className="font-medium text-gray-700">{showRequestName}</span> has been added to your target shows in the meantime.
                    </p>
                  </div>
                  <div className="pb-2">
                    <button
                      onClick={() => setShowRequestModal(false)}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
