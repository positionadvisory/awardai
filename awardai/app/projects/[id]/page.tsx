'use client'
import { useEffect, useState, useRef, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useEngagement } from '@/lib/useEngagement'
import GeneratingBar from '@/components/GeneratingBar'
import ProjectProgressSpine, { SpineStep } from '@/components/ProjectProgressSpine'
import NextStepCard, { NextStepAction, NextStepOpportunity, NextStepDirectionRef } from '@/components/NextStepCard'
import DraftChangeSummary from '@/components/DraftChangeSummary'
import DraftFindings, { type DraftFinding, type HedgedFigure } from '@/components/DraftFindings'
import {
  VersionSelector, HistoricalViewBanner, ReadOnlyVersionFields, VersionDeltaChip,
  computeVersionDeltaState, type MinimalDraftField, type MinimalEvaluation,
} from '@/components/EntryRoomHistory'

// Workbench (S150): in-flight statements for the legacy per-field Refine box
// (the campaign / non-workbench path, !wbActive). Mirrors SectionChat's
// APPLY_STATEMENTS so the two refine surfaces read the same. No em-dashes.
const REFINE_STATEMENTS = [
  'Reading the current text.',
  'Weighing the rubric and the tracked gaps.',
  'Drafting the revision.',
  'Tightening the language.',
  'Checking every figure stays put.',
]

/* ── Avatar dropdown (top-right nav) ─────────────────────────────────────── */
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
import ShowsDrawer from '@/components/shows/ShowsDrawer'
import { MATERIALS_EVAL_STATEMENTS, JURY_EVAL_STATEMENTS, COACH_REVIEW_STATEMENTS } from '@/lib/generatingStatements'
import { appErrorFromResponse, formatError } from '@/lib/errorMessages'
import { normaliseKbShow, DEADLINES_2026 } from '@/lib/shows-data'
import { isAoyShow, AOY_SHOW_NAME, aoyResolveStored, aoyTrackById, buildAoyBestCategory, pillarForKey, normalizeAoyCategory, type AoyPillar } from '@/lib/aoy-taxonomy'
// Workbench P2 Chunk 1 (S138): source-agnostic section-workbench surface. Rendered
// read-only behind ?workbench=1 this phase; the write-path cutover is P2 Chunk 4.
import SectionWorkbench, { type SectionRevision } from '@/components/SectionWorkbench'
import EvalSummaryBar from '@/components/EvalSummaryBar'
import EvalBreakdown, {
  MeterBar, SCORE_DIMENSIONS, scoreColor, scoreBg,
  type EvaluationScores, type JudgeOutput, type CoachOutput, type EvaluationOutput,
} from '@/components/EvalBreakdown'
import { extractEntryText, safeFileName } from '@/lib/extract-entry-text'
// Workbench P4 (S147): the chatSlot mount point — Discuss/Apply on one thread.
import SectionChat, { type ChatTurn } from '@/components/SectionChat'
import { mapAoyEvaluation, type StoredEvalSection } from '@/lib/aoy-eval-map'
import { isRescoreStale, computeIndicativeTotal, type SectionRescore } from '@/lib/section-rescore'
import { parseDataRequests, mergeScannedItems, normalizeRequestText, type DataNeededItem } from '@/lib/data-needed'
// Show Customization Architecture Chunk 5 (S98): config-driven entry_form resolver.
// Only the canonical PURE helpers + type are imported (client can import lib; edge
// functions carry byte-identical copies). Resolution = longest show-level prefix of
// best_show (mirrors the config edge fns) then the category-exact row.
import { resolveEntryFormCategoryKey, pickEntryForm, isV2Spec, type EntryFormSpec, type EntryFieldValues } from '@/lib/entry-form'
import ConfigEntryCanvas, { type ConfigSectionRevision } from '@/components/ConfigEntryCanvas'
import AoyEntryPicker from '@/components/AoyEntryPicker'
import AgencyFactsValidator from '@/components/AgencyFactsValidator'
import PillarFactsValidator from '@/components/PillarFactsValidator'
import EndorsementsChecklist, { ENDORSEMENT_ITEMS, EndorsementItemKey } from '@/components/EndorsementsChecklist'
import JuryProfilePanel, { JuryCell, RegionalUplift } from '@/components/JuryProfilePanel'
import PressKitTab from '@/components/tabs/PressKitTab'
import VideoScriptTab from '@/components/tabs/VideoScriptTab'
import { ErrorBanner } from '@/components/ErrorBanner'
import { COLLAB_TYPE_LABELS, materialWordCount, buildAnalysisText, type CollabType } from '@/lib/project-page-shared'
import { trySegmentEntryGeneric } from '@/lib/segment-entry-generic-client'

// ── TonalBrief — structured production brief returned by generate-tonal-brief ─
export type ColorSwatch = { hex: string; name: string; role: string }

// ── Collaborator ──────────────────────────────────────────────────────────────
// CollabType + COLLAB_TYPE_LABELS moved to lib/project-page-shared.ts (build fix,
// refactor-r1r2-tabs-2026-07-13): page.tsx may only export default + the Next.js
// page-export allowlist, and COLLAB_TYPE_LABELS was a runtime value export.

export type Collaborator = {
  id: number
  collaborator_name: string
  collaborator_type: CollabType
  contact_name: string | null
  contact_email: string | null
  website_url: string | null
  is_lead_credit: boolean
  credit_order: number
}

// ── Org press profile (lightweight subset of agency_profiles for press kit) ──
export type OrgPressProfile = {
  org_type: string
  agency_name: string | null
  in_house_team_name: string | null
  tagline: string | null
  website_url: string | null
  pr_contact_name: string | null
  pr_contact_email: string | null
  pr_contact_phone: string | null
  linkedin_url: string | null
  x_handle: string | null
  instagram_handle: string | null
  logo_url: string | null
}
export type PressKitExtra = {
  quickSummary: string
  pressHook: string
  linkedinPost: string
  xPost: string
  instagramCaption: string
}

// ── Show Profile — jury intelligence from show_profiles table ─────────────────
type ShowProfile = {
  show_name: string
  judging_philosophy: string
  scoring_emphasis: string | null
  language_guidance: string | null
  common_mistakes: string | null
  jury_composition_notes: string | null
}

// ── Press Kit Draft — persisted AI copy with up to 3 versions ────────────────
// project_id + direction_id + id are all bigint in the DB (bigint PK pattern used across all tables)
export type PressKitDraftRow = {
  id: number
  project_id: number
  direction_id: number
  field_key: string       // 'quickSummary' | 'linkedinPost' | 'xPost' | 'instagramCaption' | 'pressHook-Local' | etc.
  field_label: string
  version_a: string | null  // newest AI generation
  version_b: string | null  // previous AI generation
  version_c: string | null  // oldest AI generation
  selected: string          // 'a', 'b', or 'c'
  custom_text: string | null
  press_target: string | null
  model_used: string | null
  updated_at: string
}

export type TonalBrief = {
  summary: string
  mood: string
  color_palette: ColorSwatch[]
  typography: string
  vo_style: string
  music_style: string
  brand_notes: string
}

import {
  CANONICAL_SHOWS, SHOW_CATEGORIES, SHOW_CATEGORY_ALIASES, categoriesForShow,
  categoryPlaceholderForShow,
  NO_CATEGORY_SHOWS, NO_CATEGORY_PLACEHOLDER, showHasNoCategoryConcept,
  showHasNoCategoryList, buildNextCandidates, sameShow, isSmartiesShow,
} from '@/lib/show-taxonomy'
import {
  type MaterialTextResult, materialTextErrorMessage, materialTextOrUndefined,
} from '@/lib/project-page-shared'

import ShowCombobox from '@/components/ShowCombobox'

// Session 54 — slim score band for engagement_events context (never the raw
// score: keep event context coarse). Thresholds match the UI score colors.
function scoreBand(score: number | null | undefined): 'high' | 'mid' | 'low' | null {
  if (score === null || score === undefined) return null
  const n = Number(score)
  if (Number.isNaN(n)) return null
  return n >= 8 ? 'high' : n >= 6 ? 'mid' : 'low'
}

// Geographic eligibility constraints for regionally-restricted award shows.
// requiredKeywords: at least one must appear in the brief for the campaign to be eligible.
// conflictKeywords: if these appear WITHOUT any requiredKeywords, flag a mismatch.
// Regional shows with geographic entry restrictions.
// ANY time one of these shows is targeted, the user MUST confirm eligibility before generating.
// No keyword detection — always prompt. Keyword detection was unreliable because global brand
// materials frequently mention multiple markets, causing false negatives.
const REGIONAL_SHOWS: Record<string, { market: string; rule: string }> = {
  'Australian Effies':    { market: 'Australia', rule: 'Open to campaigns that ran in the Australian market only.' },
  'AWARD Awards':         { market: 'Australia / New Zealand', rule: 'Open to work created by agencies based in Australia or New Zealand.' },
  'B&T Awards':           { market: 'Australia', rule: 'Open to campaigns and agencies operating in the Australian market.' },
  'Mumbrella Awards':     { market: 'Australia', rule: 'Open to campaigns that ran in the Australian market only.' },
  'Campaign Big Awards':  { market: 'United Kingdom', rule: 'Open to campaigns that ran in the UK market only.' },
  'Dubai Lynx':           { market: 'Middle East & North Africa', rule: 'Open to campaigns that ran in the MENA region only.' },
  'ADFEST':               { market: 'Asia Pacific + MENA', rule: 'Open to companies based in Asia Pacific (including Australia & NZ) and the Middle East (MENA). Works for regional clients made by companies based outside the eligible region are NOT eligible.' },
  'Spikes Asia':          { market: 'Asia Pacific', rule: 'Open to campaigns that ran in the Asia Pacific region only.' },
  'Campaign Asia Awards': { market: 'Asia Pacific', rule: 'Open to agencies and brands operating in the Asia Pacific region.' },
  'Effie Awards India':   { market: 'India', rule: 'Open to campaigns that ran in the Indian market only.' },
  'Effie Awards China':   { market: 'China', rule: 'Open to campaigns that ran in the Chinese market only.' },
  'MMA Smarties':         { market: 'Regional — check entry kit', rule: 'Regional chapters have specific market eligibility requirements.' },
  'Loeries':              { market: 'Africa & Middle East', rule: 'Open to work created FOR the Africa/MENA region (Sub-Saharan Africa, MENA, Türkiye, island territories) OR FROM regionally-based companies. Global campaigns merely airing in the region are NOT eligible.' },
  'PRCA UK Awards':       { market: 'United Kingdom', rule: 'Open to PR and communications work in the UK market. Consultancy categories require UK-based operations. Fee-income banding applies: Small ≤£2m, Medium £2.01–7.5m, Large >£7.5m.' },
  'PRCA APAC Awards':     { market: 'Asia Pacific', rule: 'Open to PR and communications agencies operating in the Asia Pacific region. Verify APAC-specific eligibility against official programme page.' },
  'SABRE Awards Asia-Pacific': { market: 'Asia Pacific', rule: 'Open to PR, communications, and related-discipline work for the Asia Pacific region. Industry Sector categories are determined by the CLIENT\'s sector, not the campaign\'s topic. Verify APAC geographic category eligibility (single-market vs APAC Multi-Market) against official entry rules.' },
  'African Cristal Festival': { market: 'Africa', rule: 'Open to work created for and disseminated on the African continent. Gulf/MENA eligibility unconfirmed — contact organiser.' },
}

function getRegionalShowWarnings(targetShows: string[]): { show: string; market: string; rule: string }[] {
  return targetShows
    .filter(show => REGIONAL_SHOWS[show])
    .map(show => ({ show, ...REGIONAL_SHOWS[show] }))
}

export type Material = {
  name: string
  // OPTIONAL BY DESIGN (5 Aug 2026). materials is JSONB on projects and a
  // pathless material is persistable, so `path: string` was a claim the
  // database could violate: not one call site was ever forced to check, and
  // three surfaces failed at runtime on hand-seeded chips. Typing it optional
  // is what makes the compiler a guard again -- every read below is now
  // explicitly guarded before the value reaches an RPC arg or a storage key.
  path?: string
  type: string
  size: number
  uploaded_at: string
  extracted_text?: string      // only present on materials uploaded THIS session — page load returns slim metadata (Session 52, P-03)
  chart_image_paths?: string[]
  has_text?: boolean           // server-computed (get_project_materials_meta) — extracted_text exists in DB
  text_words?: number          // server-computed word count of extracted_text
}

// Session 52 (P-03): page load no longer fetches extracted_text — materials
// arrive as slim metadata with has_text/text_words. Fresh uploads this session
// still carry extracted_text in memory. ALWAYS use these helpers instead of
// checking m.extracted_text directly for gating/badges/word counts.
const materialHasText = (m: Material): boolean => !!m.extracted_text || !!m.has_text
// materialWordCount moved to lib/project-page-shared.ts (build fix,
// refactor-r1r2-tabs-2026-07-13): page.tsx may only export default + the
// Next.js page-export allowlist, and it was a runtime value export.

type ScriptChange = {
  section: string
  original: string
  reason: string
}

export type ScriptAnalysis = {
  mode: 'review'
  original_script: string
  summary: string
  key_improvements: string[]
  changes: ScriptChange[]
}

export type CategorySuggestion = {
  category: string
  reasoning: string
}

export type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  combined_text: string | null
  target_shows: string[]
  materials: Material[]
  status: string
  script_text: string | null
  script_analysis: ScriptAnalysis | null
  tonal_brief: TonalBrief | null
  // AOY entry-type discriminator (S71) + validated agency-facts record (S73).
  entry_type: string | null
  agency_facts: Record<string, unknown> | null
  // AOY endorsements checklist (chunk 6): item_key -> boolean, hygiene-only.
  endorsements_checklist: Record<string, boolean> | null
}

export type Direction = {
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

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  version_created?: string
  // Workbench P4 (S147) — tag on ASSISTANT turns only. Mirrors edit-entry.ts's
  // ChatMessage type; keep both in sync (same parity-copy class as
  // SectionRevision above). Untagged = pre-P4 history = always an apply turn.
  mode?: 'discuss' | 'apply'
}

// AOY category-fit recommender result (recommend-aoy-category, S76). Weights are
// authoritative from the parsed rubric, set server-side, never the model.
type AoyRecommendation = {
  aoy: boolean
  pillar: string
  current_category_key: string | null
  recommendation: { top_stem: string; top_label: string; is_switch: boolean; headline: string }
  ranking: {
    stem: string
    label: string
    is_current: boolean
    fit: number
    evidence_sections: { name: string; weight: number }[]
    rationale: string
  }[]
  summary: string
  evidence_used: { facts: boolean; materials: boolean; draft: boolean }
}

// AOY entry-slate strategy (generate-aoy-strategy, S77). Directions-shaped
// recommendations the user accepts into a directions row. Weights authoritative
// from the parsed rubric, set server-side.
type AoyStrategyRec = {
  stem: string
  label: string
  best_category: string
  pillar: string
  fit: number
  evidence_sections: { name: string; weight: number }[]
  positioning: string
  rationale: string
}
type AoyStrategy = {
  aoy: boolean
  pillar: string
  track_id: string
  market_prefix: string | null
  show_name: string
  candidates_considered: number
  headline: string
  recommendations: AoyStrategyRec[]
  summary: string
  evidence_used: { facts: boolean; materials: boolean; facts_source: string | null }
}

// AOY per-section Coach (generate-aoy-coach, S77). Advisory only, never a score.
type AoyCoaching = {
  aoy: boolean
  pillar: string
  category_key: string
  draft_generation: number
  sections: {
    key: string; label: string; weight: number; rubric_weight: number | null
    weight_divergence: boolean; word_count: number; is_placeholder: boolean
    missing: string[]; suggestions: string[]
  }[]
  priorities: string[]
  overall: string
}

// Config per-section Coach (generate-entry-coach-config, S98 Chunk 4/5). Advisory
// only, session-only, no evaluations row. Generalizes the AOY + SMARTIES coaches:
// one shape for both weighted (weight non-null) and qualitative (weight null)
// config shows, matched to draft rows by section key. `framing_degraded` is set
// when the show's jury-framing fields are missing (Coach degrades gracefully where
// the jury refuses); the panel surfaces it so a generic coaching pass is visible.
type ConfigCoaching = {
  config: boolean
  scoring_mode: 'weighted' | 'qualitative'
  entry_subject: string
  show_name: string
  category_key: string | null
  draft_generation: number
  framing_degraded: boolean
  sections: {
    key: string; label: string; weight: number | null; word_count: number; is_placeholder: boolean
    missing: string[]; suggestions: string[]
  }[]
  priorities: string[]
  overall: string
}

// AOY market-context modifier (evaluate-aoy-market, S85, Phase 3). Option B: a
// bounded, source-cited adjustment ON TOP OF the calibrated raw jury score, never
// inside it. Both numbers are shown; every nonzero delta carries a sourced
// rationale. Advisory and additive, so it is its own state, not an evaluations row.
type AoyMarketFigure = { figure?: string; value?: string; scope?: string; url?: string }
type AoyMarketAdjustment = {
  evaluation_id: number
  category_key: string
  cap: number
  no_baseline: boolean
  market_context: {
    market: string; discipline: string; fallback_to_all: boolean
    window_start: string; window_end: string; baseline_text: string
    figures: AoyMarketFigure[]; sources: { name?: string; url?: string }[]
  } | null
  raw_overall: number
  adjusted_overall: number
  overall_delta: number
  sections: { key: string; label: string; weight: number; raw_score: number; delta: number; adjusted_score: number; rationale: string }[]
  note?: string
}

export type EntryDraft = {
  id: number
  direction_id: number
  field_key: string
  field_label: string
  word_limit: number | null
  section_weight?: number | null   // AOY only — % of the category score this section carries (S74)
  version_a: string | null
  version_b: string | null
  version_c: string | null
  selected: string | null
  custom_text: string | null
  field_values?: EntryFieldValues | null   // Entry Form v2 — structured sub-field values (v2.1)
  data_needed?: DataNeededItem[] | null    // Workbench P2 Chunk 3 — per-section data-needed checklist; Chunk 4 folded this into the get_project_entry_drafts RPC directly (the Chunk 3 supplemental select is retired)
  revisions?: Array<SectionRevision | ConfigSectionRevision> | null      // Workbench P2 Chunk 4 — linear version history. AOY rows hold SectionRevision { ts, source, text, instruction? }; config/typed rows (S151) hold ConfigSectionRevision (adds field_values). A row is only ever one kind. Returned by get_project_entry_drafts.
  chat_history: ChatMessage[] | null
  award_show: string | null
  category: string | null
  draft_generation: number       // which generation this draft belongs to (1 = first, 2 = first improvement, etc.)
  sort_order?: number | null
  created_at?: string
}

export type Evaluation = {
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
  // P3 (S146): directional per-section re-scores, keyed by section_key. Separate from
  // scores/output; NEVER the official score. Empty {} for rows predating the feature.
  section_rescores?: Record<string, SectionRescore> | null
}

export type Tab = 'brief' | 'materials' | 'entries' | 'script' | 'directions' | 'facts' | 'endorsements' | 'presskit'

// Always-openable show picker (S78 bug fix, replaces the datalist whose list was
// hidden until the field was cleared). Free text is still allowed (unknown shows
// route to the request flow). Chevron toggles the list; typing filters it;
// clicking outside closes it.
// buildAnalysisText moved to lib/project-page-shared.ts (build fix,
// refactor-r1r2-tabs-2026-07-13): page.tsx may only export default + the
// Next.js page-export allowlist, and it was a runtime value export.

export default function ProjectPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params?.id as string

  // Session 54 (Build 1) — engagement tracking. track() is fire-and-forget and
  // never awaited in UI paths; guidanceEnabled gates guidance copy ONLY
  // (tracking continues regardless of the toggle, per the v3 brief).
  const { track, trackSectionView, guidanceEnabled } = useEngagement(user?.id)

  // Build 2 (Session 55): nextstep_shown fires once per direction per browser
  // session — the card remounts on tab switches, so the component-level guard
  // alone would inflate the metric.
  const nextstepShownRef = useRef<Set<number>>(new Set())
  // Build 2 (Session 55, feedback round): Next Step deep links spotlight the
  // target direction card (ring + scroll). Auto-clears after 8s.
  const [spotlightDirectionId, setSpotlightDirectionId] = useState<number | null>(null)
  const spotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spotlightDirection = (directionId: number) => {
    setSpotlightDirectionId(directionId)
    if (spotlightTimerRef.current) clearTimeout(spotlightTimerRef.current)
    spotlightTimerRef.current = setTimeout(() => setSpotlightDirectionId(null), 8000)
    // Scroll after the Directions tab has rendered
    setTimeout(() => {
      document.getElementById(`direction-card-${directionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }

  const [project, setProject] = useState<Project | null>(null)
  const [directions, setDirections] = useState<Direction[]>([])
  // Arc v2 B2: persisted-angles count for the spine's Angles entry (peer-level
  // nav to /projects/[id]/angles, decision 4 of record). Head-only count; the
  // angles surface itself lives on its own route, never on this page.
  const [angleCount, setAngleCount] = useState(0)
  const [entries, setEntries] = useState<EntryDraft[]>([])
  const [evaluations, setEvaluations] = useState<Record<number, { judge?: Evaluation; coach?: Evaluation }>>({})
  // Session 57: third view 'nextsteps' = the Recommended Next Steps tab
  const [evalDisplayMode, setEvalDisplayMode] = useState<Record<number, 'judge' | 'coach' | 'nextsteps'>>({})
  const [evalHistory, setEvalHistory] = useState<Record<number, Evaluation[]>>({})
  const [evalHistoryOpen, setEvalHistoryOpen] = useState<Record<number, boolean>>({})
  const [tab, setTab] = useState<Tab>('brief')
  const [fetching, setFetching] = useState(true)

  // Project rename
  const [editingName, setEditingName] = useState(false)
  const [nameEditValue, setNameEditValue] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Brief
  const [briefEdit, setBriefEdit] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [savingBrief, setSavingBrief] = useState(false)
  const [briefMode, setBriefMode] = useState<'guided' | 'freeform'>('freeform')
  const [briefSections, setBriefSections] = useState({ idea: '', execution: '', results: '', intentions: '' })
  const [targetShows, setTargetShows] = useState<string[]>([])
  const [editingShows, setEditingShows] = useState(false)
  const [showsDrawerOpen, setShowsDrawerOpen] = useState(false)
  const [showsDrawerTab, setShowsDrawerTab] = useState<'calendar' | 'budget'>('calendar')
  const [savingShows, setSavingShows] = useState(false)
  const [editingShowsInline, setEditingShowsInline] = useState(false)
  const [showsChangedWarning, setShowsChangedWarning] = useState(false)
  const [kbShows, setKbShows] = useState<string[]>([...CANONICAL_SHOWS].sort((a, b) => a.localeCompare(b)))
  const [dynamicShowNames, setDynamicShowNames] = useState<Set<string>>(new Set())
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
  const [showRequestError, setShowRequestError] = useState('')

  // Materials
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  // Directions generation
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [geoWarnings, setGeoWarnings] = useState<{ show: string; market: string; rule: string }[]>([])
  const [showGeoWarningModal, setShowGeoWarningModal] = useState(false)
  const [smartDirectionsLoading, setSmartDirectionsLoading] = useState<Record<number, 'alternatives' | 'other_shows' | null>>({})
  const [smartDirectionsError, setSmartDirectionsError] = useState<Record<number, string>>({})
  // IDs of directions added in this session (for "New" badge and top-of-list placement)
  const [newDirectionIds, setNewDirectionIds] = useState<Set<number>>(new Set())

  // Draft focus items (Feature 4 — Fix-this chips)
  const [draftFocusItems, setDraftFocusItems] = useState<Record<number, string[]>>({})

  // Tonal brief + Script editor chat state moved into VideoScriptTab (R2).

  // Collaborators
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [addCollabOpen, setAddCollabOpen] = useState(false)
  const [savingCollab, setSavingCollab] = useState(false)
  const [collabError, setCollabError] = useState('')
  const [newCollab, setNewCollab] = useState<{
    collaborator_name: string
    collaborator_type: CollabType
    contact_name: string
    contact_email: string
    website_url: string
    is_lead_credit: boolean
  }>({
    collaborator_name: '', collaborator_type: 'creative_agency',
    contact_name: '', contact_email: '', website_url: '', is_lead_credit: false,
  })

  // Press Kit — orgPressProfile stays lifted (shared with PressKitTab as a
  // prop). Everything else moved into components/tabs/PressKitTab.tsx (R1);
  // pressKitStarted replaces the old spinePressKitStarted computation, now
  // fed by a callback prop since pressKitDrafts/pressKitOutputs live in the
  // child component.
  const [orgPressProfile, setOrgPressProfile] = useState<OrgPressProfile | null>(null)
  const [pressKitStarted, setPressKitStarted] = useState(false)

  // Brief editor chat (tonal-brief editor) state moved into VideoScriptTab (R2).
  const [scriptStarted, setScriptStarted] = useState(false)

  // Opener suggestions (generate-hooks)
  const [hooksLoading, setHooksLoading] = useState<Record<number, boolean>>({})
  const [hooksOpen, setHooksOpen] = useState<Record<number, boolean>>({})
  const [hooksOptions, setHooksOptions] = useState<Record<number, string[]>>({})
  const [hooksError, setHooksError] = useState<Record<number, string>>({})
  const [hooksCopied, setHooksCopied] = useState<Record<number, number | null>>({})

  // Draft generation
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [generateDraftError, setGenerateDraftError] = useState('')
  // Session 116 fix (546-class bug): the error banner for this error lives in the
  // Directions tab (legacy "Generate Draft" flow), but "Generate Improved Draft
  // from this Jury Evaluation" is a separate CTA rendered in the Entries tab
  // evaluation card. A failure there (rate limit / no facts / no rubric / AI
  // error / network) set generateDraftError correctly but nothing rendered it in
  // the Entries tab, so the button just spun and reverted with no visible error.
  // Track which direction the error belongs to so the Entries-tab card can show
  // its own banner without duplicating it on every evaluation card.
  const [generateDraftErrorDirId, setGenerateDraftErrorDirId] = useState<number | null>(null)
  // Findings render (23 Aug 2026, entry-room step one): what the fabrication
  // guard and the NOFACTS relaxation actually returned for the LAST generation
  // attempt. One attempt at a time by design; reset at the START of the next
  // run (S79 rule), never in finally. blocked=true carries the 422 findings[];
  // blocked=false carries the success notice + hedged figures.
  const [draftFindingsData, setDraftFindingsData] = useState<{
    dirId: number
    blocked: boolean
    findings: DraftFinding[]
    hedgedFigures: HedgedFigure[]
    notice: string | null
  } | null>(null)
  const [generatingForDirectionId, setGeneratingForDirectionId] = useState<number | null>(null)

  // Evaluation
  const [evaluating, setEvaluating] = useState(false)
  const [evaluateError, setEvaluateError] = useState('')
  const [evaluatingForDirectionId, setEvaluatingForDirectionId] = useState<number | null>(null)
  const [evaluatingMode, setEvaluatingMode] = useState<Record<number, 'judge' | 'coach'>>({})  // tracks which mode button is spinning
  const [scoreDeltas, setScoreDeltas] = useState<Record<number, Record<string, number>>>({})    // delta per directionId, set after re-evaluation

  // Evaluation chat — keyed by directionId
  const [evalChatOpen, setEvalChatOpen] = useState<Record<number, boolean>>({})
  // Eval panel collapse/expand per direction (S152). Absent => collapsed.
  const [evalPanelExpanded, setEvalPanelExpanded] = useState<Record<number, boolean>>({})
  const [evalChatInput, setEvalChatInput] = useState<Record<number, string>>({})
  const [evalChatting, setEvalChatting] = useState<Record<number, boolean>>({})
  const [evalChatHistory, setEvalChatHistory] = useState<Record<number, ChatMessage[]>>({})

  // Uploaded entry text expand/collapse in Entries tab
  const [expandedEntryFields, setExpandedEntryFields] = useState<Record<number, boolean>>({})
  // Draft version history expand/collapse — keyed by directionId
  const [expandedDraftHistory, setExpandedDraftHistory] = useState<Record<number, boolean>>({})

  // Entries tab — collapsible entry cards (S91). Each direction's entry is a
  // collapsible card so a project with several entries is scannable instead of
  // an endless scroll. focusedEntryDirId = the entry just generated/scored: it
  // renders FIRST and expanded; the rest collapse below it. entryCardExpanded
  // holds explicit user toggles that override the focused-card default.
  const [focusedEntryDirId, setFocusedEntryDirId] = useState<number | null>(null)
  const [entryCardExpanded, setEntryCardExpanded] = useState<Record<number, boolean>>({})
  // Entry Room Slice 1 (24 Aug 2026) — version selector state: which
  // generation each direction is VIEWING. null/undefined = current (maxGen).
  // Per-generation eval lookup, additive alongside `evaluations` (which stays
  // maxGen-only — everything that already reads `evaluations`/`evalBoth` is
  // untouched by this). Keyed direction_id -> draft_generation -> mode.
  const [viewingGen, setViewingGen] = useState<Record<number, number | null>>({})
  const [evaluationsByGen, setEvaluationsByGen] = useState<Record<number, Record<number, { judge?: Evaluation; coach?: Evaluation }>>>({})

  // Phase 2 — field refinement via edit-entry Edge Function
  const [refineMessage, setRefineMessage] = useState<Record<number, string>>({})
  const [refiningFieldId, setRefiningFieldId] = useState<number | null>(null)
  // Workbench (S150): keeps the shared GeneratingBar mounted for one field
  // through its completion animation, even after refiningFieldId resets to
  // null. Same pattern as SectionChat's barVisible. One refine runs at a time.
  const [refineBarFieldId, setRefineBarFieldId] = useState<number | null>(null)
  const [refineErrors, setRefineErrors] = useState<Record<number, string>>({})
  // S137 P1 — expand/collapse for assistant turns in the per-section refine thread
  const [expandedChatTurns, setExpandedChatTurns] = useState<Record<string, boolean>>({})
  // Workbench P4 (S147) — SectionWorkbench chatSlot state. Discuss and Apply
  // share one busy flag per field (brief: "while either is in flight, both
  // buttons disable"); busyMode is which one, purely for button copy.
  const [chatBusyField, setChatBusyField] = useState<{ id: number; mode: 'discuss' | 'apply' } | null>(null)
  const [chatErrors, setChatErrors] = useState<Record<number, string>>({})

  // Workbench P2 Chunk 1 (S138) — read-only preview of the new section-workbench
  // surface. S151: the AOY Workbench is now ON by default for every user (Ben's
  // call, 11 Jul 2026 — the P0-P4 arc is complete and Nicky is the only active
  // AOY editor, so we want her real feedback on the default experience).
  // `?workbench=0` still forces the legacy canvas as a fallback. Read via
  // window.location.search in an effect, never useSearchParams (that needs a
  // Suspense boundary or the Vercel build fails).
  const [workbenchPreview, setWorkbenchPreview] = useState(true)
  // S153 side-by-side eval/edit layout: ON by default; ?sxs=0 forces the old
  // single stack (edit surface below the eval blocks), mirroring ?workbench=0.
  const [sideBySidePreview, setSideBySidePreview] = useState(true)
  // S154 item 1: the eval rail defaults expanded on desktop (beside the edit
  // surface) but collapsed on mobile (stacked below it, preserving S152 land-on-edit).
  const [evalDefaultExpanded, setEvalDefaultExpanded] = useState(false)
  // S154 item 3: the fix-this chip panel is collapsed by default per direction.
  const [fixChipsOpen, setFixChipsOpen] = useState<Record<number, boolean>>({})
  // P3 (S146) — directional section re-scores held for the session, keyed by
  // directionId -> section_key. Merged over any section_rescores loaded from the
  // evaluation row (local wins, being the freshest). recheckingSection / rescoreError
  // are keyed by `${dirId}:${section_key}`.
  const [sectionRescores, setSectionRescores] = useState<Record<number, Record<string, SectionRescore>>>({})
  const [recheckingSection, setRecheckingSection] = useState<Record<string, boolean>>({})
  const [rescoreError, setRescoreError] = useState<Record<string, string>>({})
  useEffect(() => {
    if (typeof window === 'undefined') return
    // On by default; only an explicit ?workbench=0 opts back to the legacy canvas.
    setWorkbenchPreview(new URLSearchParams(window.location.search).get('workbench') !== '0')
    // On by default; only an explicit ?sxs=0 opts back to the old single stack.
    setSideBySidePreview(new URLSearchParams(window.location.search).get('sxs') !== '0')
    setEvalDefaultExpanded(window.matchMedia('(min-width: 1024px)').matches)
  }, [])

  // Workbench P2 Chunk 3 (S138 continued) — data-needed checklist write surface.
  // scanningData is keyed by entry_draft id so multiple sections can scan
  // independently. autoScannedFieldIds is a ref (not state): it tracks which
  // field ids have already had their once-on-first-render auto-scan fired,
  // so the effect below never re-scans a section just because entries updated
  // for an unrelated reason (e.g. a different section's toggle write).
  const [scanningData, setScanningData] = useState<Record<number, boolean>>({})
  const autoScannedFieldIds = useRef<Set<number>>(new Set())

  // Feature #4 — inline field editing
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null)
  const [fieldEditValue, setFieldEditValue] = useState('')
  const [savingFieldEdit, setSavingFieldEdit] = useState(false)

  // Phase 3 — Video Script state moved into VideoScriptTab (R2).
  // Directions tab: source selector (same pattern)
  const [dirSourceType, setDirSourceType] = useState<'all' | 'material' | 'entry'>('all')
  const [dirSourceMaterialIdx, setDirSourceMaterialIdx] = useState<number>(-1)
  const [dirSourceEntryDirectionId, setDirSourceEntryDirectionId] = useState<number>(-1)
  // Directions tab: sort key
  const [dirSortKey, setDirSortKey] = useState<'default' | 'category_fit'>('default')

  // Festival / jury intelligence — show_profiles rows keyed by directionId
  const [showProfiles, setShowProfiles] = useState<Record<number, ShowProfile | null>>({})
  const [showProfileOpen, setShowProfileOpen] = useState<Record<number, boolean>>({})
  // Jury Intelligence Layer — Phase 1 (jury_cells keyed by show name, panel open state by dirId)
  const [juryShowCells, setJuryShowCells] = useState<Record<string, JuryCell[]>>({})
  const [juryPanelOpen, setJuryPanelOpen] = useState<Record<number, boolean>>({})
  const [regionalUplift, setRegionalUplift] = useState<RegionalUplift[]>([])
  // kbCount + scriptAssetMode/scriptIncludeEval/scriptEvalDirectionId moved into VideoScriptTab (R2).

  // Quick evaluate from uploaded material
  const [orgId, setOrgId] = useState<number | null>(null)
  const [showQuickEvalModal, setShowQuickEvalModal] = useState(false)
  const [quickEvalMaterialIdx, setQuickEvalMaterialIdx] = useState<number | null>(null)
  const [quickEvalShow, setQuickEvalShow] = useState('')
  const [quickEvalCategory, setQuickEvalCategory] = useState('')
  const [quickEvaluating, setQuickEvaluating] = useState(false)
  // S110 follow-up (S109 546 fix): a state-based `disabled` prop lags one
  // render behind a click, so two fast clicks (or one double-click) can both
  // read the same stale closure's quickEvaluating===false and both pass
  // through before either setQuickEvaluating(true) flushes -- confirmed in
  // Supabase logs as two segment-aoy-entry invocations ~0.3s apart per click.
  // A ref is synchronous and closes that window; the state stays for the UI.
  const quickEvaluatingRef = useRef(false)
  // S81: two-phase progress for uploaded AOY entries (segment, then jury score).
  const [quickEvalPhase, setQuickEvalPhase] = useState<'segmenting' | 'scoring' | null>(null)
  // S82: after a Quick Eval, land on the direction that was just scored, not the
  // top of the entries tab. A project with more than one direction otherwise
  // renders the first (sort_order 0) direction first, so the user thinks their
  // freshly picked entry was ignored (the "PR shifted to Media" report).
  const [justScoredDirId, setJustScoredDirId] = useState<number | null>(null)
  const [quickEvalError, setQuickEvalError] = useState('')
  const [quickEvalDetecting, setQuickEvalDetecting] = useState(false)
  const [quickEvalDetectedFields, setQuickEvalDetectedFields] = useState<{ show: boolean; category: boolean; confidence?: string }>({ show: false, category: false })
  // Session 52 — "Suggest for me" on the category field (recommendation, not detection)
  const [quickEvalSuggesting, setQuickEvalSuggesting] = useState(false)
  const [quickEvalSuggestion, setQuickEvalSuggestion] = useState<{ rationale: string; confidence: string } | null>(null)

  // Session 72 — Campaign AOY controlled, market-scoped category picker.
  // AOY categories are track-prefixed and must normalize to a rubric stem, so the
  // free-text field is replaced by <AoyEntryPicker> (own cascade state) when the
  // chosen show is AOY. The picker writes a CANONICAL value into quickEvalCategory
  // (the same field the existing evaluate path stores on directions.best_category),
  // guaranteed by the parity test to normalize onto a show_profiles.category_pattern
  // key. A separate canonical value (dcAoyCategory) backs the directions panel's
  // "Add AOY entry" flow below.
  const [dcAoyCategory, setDcAoyCategory] = useState('')
  const [showAoyDirModal, setShowAoyDirModal] = useState(false)
  const [addingAoyDir, setAddingAoyDir] = useState(false)
  const [aoyDirError, setAoyDirError] = useState('')

  // Session 76 — AOY category-fit recommender (recommend-aoy-category, spec §5).
  // Per-direction ranking of which market-scoped category the entry fits best.
  const [recommending, setRecommending] = useState(false)
  const [recommendingForDirectionId, setRecommendingForDirectionId] = useState<number | null>(null)
  const [recommendError, setRecommendError] = useState('')
  const [aoyRecommendations, setAoyRecommendations] = useState<Record<number, AoyRecommendation>>({})

  // Session 77 — AOY entry-slate strategy (generate-aoy-strategy). Project-level,
  // return-then-accept. The seed is one picked category that encodes the market +
  // pillar; aoyResolveStored expands it to the market-scoped candidate set.
  const [aoyStrategy, setAoyStrategy] = useState<AoyStrategy | null>(null)
  const [generatingStrategy, setGeneratingStrategy] = useState(false)
  const [strategyError, setStrategyError] = useState('')
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [strategySeed, setStrategySeed] = useState('')
  const [acceptingStem, setAcceptingStem] = useState<string | null>(null)

  // Session 77 — AOY per-section Coach (generate-aoy-coach). Advisory, separate
  // from the calibrated jury; its own state, not an evaluations row.
  const [aoyCoaching, setAoyCoaching] = useState<Record<number, AoyCoaching>>({})
  const [coaching, setCoaching] = useState(false)
  const [coachingForDirectionId, setCoachingForDirectionId] = useState<number | null>(null)
  const [coachingError, setCoachingError] = useState('')

  // AOY flow redesign, chunk 7 (2026-07-04): which People/Brand pillars
  // have SAVED facts on this project (project_pillar_facts, per-project only,
  // no propagation -- see aoy-pillar-facts-2026-07-04.sql). Non-critical: a
  // failed fetch just means the facts step starts blank for that pillar, same
  // degrade-gracefully posture as the coach_feedback fetch above it.
  const [pillarFactsSaved, setPillarFactsSaved] = useState<Set<AoyPillar>>(new Set())

  // S98 Chunk 5 — config-driven show customization, client side.
  // entryForms: resolved entry_form spec per directionId (null = craft/none/AOY).
  // The config Coach reuses the shared coaching spinner state (coaching /
  // coachingForDirectionId / coachingError), same as AOY; only the results map is
  // config-specific. This REPLACES the dedicated SMARTIES coach state (S93): a
  // qualitative config show (SMARTIES) now coaches through generate-entry-coach-config.
  const [entryForms, setEntryForms] = useState<Record<number, EntryFormSpec | null>>({})
  const [configCoaching, setConfigCoaching] = useState<Record<number, ConfigCoaching>>({})

  // Session 93 — coach feedback export. Transient "Copied" confirmation per panel,
  // keyed by a string id (e.g. "smarties-fb-<dirId>" / "aoy-fb-<dirId>").
  const [feedbackCopied, setFeedbackCopied] = useState<Record<string, boolean>>({})

  // Session 85 — AOY market-context modifier (evaluate-aoy-market, Phase 3).
  // Keyed by directionId; carries the evaluation_id it was computed against so the
  // dual-score view only renders for the evaluation currently on screen.
  const [aoyMarketAdj, setAoyMarketAdj] = useState<Record<number, AoyMarketAdjustment>>({})
  const [marketAdjusting, setMarketAdjusting] = useState<number | null>(null)
  const [marketAdjustError, setMarketAdjustError] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!user || !projectId) return

    // Cancelled flag — prevents stale async callbacks from clobbering live state
    // if this effect fires a second time (e.g. after a token refresh re-sets user).
    let cancelled = false

    // kbCount fetch moved into VideoScriptTab (R2).

    supabase.from('campaigns').select('show_raw').not('show_raw', 'is', null)
      .then(({ data }) => {
        if (cancelled) return
        const extra: string[] = []
        if (data) {
          const kbNormalised = Array.from(
            new Set(
              data
                .map((d: { show_raw: string }) => normaliseKbShow(d.show_raw))
                .filter((s): s is string => s !== null && s.length > 0)
            )
          )
          for (const s of kbNormalised) {
            if (!CANONICAL_SHOWS.some(c => c.toLowerCase() === s.toLowerCase())) {
              extra.push(s)
            }
          }
        }
        // Merge canonical + KB shows, de-dupe, sort alphabetically
        const allShows = Array.from(new Set([...CANONICAL_SHOWS, ...extra]))
        setKbShows(allShows.sort((a, b) => a.localeCompare(b)))
      })

    // Fetch admin-added dynamic shows and merge into kbShows
    supabase
      .from('dynamic_shows')
      .select('show_name')
      .eq('status', 'active')
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return
        const names = data.map((d: { show_name: string }) => d.show_name).filter(Boolean)
        setDynamicShowNames(new Set(names))
        setKbShows(prev => {
          const merged = Array.from(new Set([...prev, ...names]))
          return merged.sort((a, b) => a.localeCompare(b))
        })
      })

    // Fetch collaborators independently (non-critical — does not block main data)
    supabase
      .from('project_collaborators')
      .select('id, collaborator_name, collaborator_type, contact_name, contact_email, website_url, is_lead_credit, credit_order')
      .eq('project_id', projectId)
      .order('credit_order')
      .then(({ data }) => { if (!cancelled && data) setCollaborators(data as Collaborator[]) })

    // Fetch org press profile for press kit generation (non-critical — degrades gracefully)
    supabase.rpc('get_my_org_id').then(({ data: oid }) => {
      if (!cancelled && oid) {
        supabase
          .from('agency_profiles')
          .select('org_type, agency_name, in_house_team_name, tagline, website_url, pr_contact_name, pr_contact_email, pr_contact_phone, linkedin_url, x_handle, instagram_handle, logo_url')
          .eq('org_id', oid)
          .maybeSingle()
          .then(({ data }) => { if (!cancelled && data) setOrgPressProfile(data as OrgPressProfile) })
      }
    })

    // press_kit_drafts fetch moved into PressKitTab (R1) — pressKitDrafts
    // state lives there now.

    // Fetch persisted AOY coach feedback for this project (Chunk 5, S106/S111
    // decision, 4 Jul). Dedicated coach_feedback table, never `evaluations`
    // (see the migration comment for the full reasoning). One row per
    // direction per draft_generation; hydrate straight into the existing
    // aoyCoaching state so the panel, staleness check, and Copy/Download
    // export all keep reading from the same place a live coach run writes to.
    // Non-critical: a failed fetch just means coaching starts blank, same as
    // before this chunk shipped.
    supabase
      .from('coach_feedback')
      .select('direction_id, pillar, category_key, draft_generation, sections, priorities, overall')
      .eq('project_id', projectId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('coach_feedback fetch failed', error); return }
        if (!data || data.length === 0) return
        const map: Record<number, AoyCoaching> = {}
        for (const row of data as Array<{
          direction_id: number; pillar: string | null; category_key: string | null
          draft_generation: number; sections: AoyCoaching['sections']; priorities: string[] | null
          overall: string | null
        }>) {
          map[row.direction_id] = {
            aoy: true,
            pillar: row.pillar ?? '',
            category_key: row.category_key ?? '',
            draft_generation: row.draft_generation,
            sections: Array.isArray(row.sections) ? row.sections : [],
            priorities: row.priorities ?? [],
            overall: row.overall ?? '',
          }
        }
        setAoyCoaching(prev => ({ ...map, ...prev }))
      })

    // Fetch which pillars have SAVED facts for this project (AOY chunk 7).
    // Slim: only the pillar column, never the facts jsonb blob itself here --
    // the validator re-fetches nothing, it just starts blank and the user
    // extracts/edits/saves fresh, same UX as Agency facts today. This read is
    // ONLY used to mark the Verify Facts spine step done for a people/brand
    // project (spineFactsDone below); project_pillar_facts has zero client
    // write path, read-only via its org-scoped SELECT grant.
    supabase
      .from('project_pillar_facts')
      .select('pillar')
      .eq('project_id', projectId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('project_pillar_facts fetch failed', error); return }
        if (!data) return
        setPillarFactsSaved(new Set(data.map((r: { pillar: string }) => r.pillar as AoyPillar)))
      })

    // Arc v2 B2: does this project have persisted angles (spine entry state).
    // Head-only count, zero row payload (Session 52 payload-diet compliant).
    supabase
      .from('angles')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .then(({ count, error }) => {
        if (cancelled) return
        if (error) { console.error('angles count fetch failed', error); return }
        setAngleCount(count ?? 0)
      })

    // Session 52 (P-03) payload diet:
    //  - projects: explicit columns, NO materials JSONB (extracted_text alone
    //    can be 250KB) — slim materials metadata comes from the
    //    get_project_materials_meta RPC instead (has_text/text_words per item)
    //  - entry_drafts: get_project_entry_drafts RPC — current generation full,
    //    older generations slimmed server-side to one resolved content each
    //    (version_b/c/selected/custom_text/chat_history/revisions/data_needed NULL)
    //  - evaluations: explicit columns, NO eval_chat_history — chat for the
    //    active judge eval per direction is backfilled by a targeted query below
    Promise.all([
      supabase.from('projects')
        .select('id, campaign_name, client_name, combined_text, target_shows, status, script_text, script_analysis, tonal_brief, entry_type, agency_facts, endorsements_checklist')
        .eq('id', projectId).single(),
      supabase.from('directions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      // RPC preserves the old ordering: sort_order ASC, id ASC (deterministic across generations).
      // Workbench P2 Chunk 4: revisions + data_needed are now returned directly
      // by the RPC (folded in server-side), so the Chunk 3 supplemental
      // data_needed select + client-side merge below are retired.
      supabase.rpc('get_project_entry_drafts', { p_project_id: projectId }),
      supabase.from('evaluations')
        .select('id, entry_draft_id, overall_score, scores, strengths, gaps, recommendations, output, model_used, evaluation_mode, changes_analysis, created_at, section_rescores')
        .eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.rpc('get_project_materials_meta', { p_project_id: projectId }),
    ]).then(([{ data: proj }, { data: dirs }, { data: drafts }, { data: evals }, { data: matsMeta, error: matsErr }]) => {
      if (cancelled) return
      if (matsErr) console.error('materials meta fetch failed', matsErr)
      if (proj) {
        setProject({ ...proj, materials: ((matsMeta as Material[] | null) ?? []) })
        setBriefText(proj.combined_text || '')
        setTargetShows(proj.target_shows || [])
        // script_text/script_analysis/tonal_brief hydration moved into VideoScriptTab (R2) — it syncs from the project prop itself.
      }
      if (dirs) setDirections(dirs)

      const draftsList = (drafts || []) as EntryDraft[]
      if (drafts !== null) setEntries(draftsList)

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

        // Entry Room Slice 1 (24 Aug 2026) — re-key by generation, additive.
        // Same first-seen-by-created_at-DESC-wins rule as evalMap above, just
        // never collapsed to only maxGen. Feeds the version selector's
        // per-version eval lookup (VersionDeltaChip) without touching evalMap/
        // historyMap or anything that already reads them.
        const byGen: Record<number, Record<number, { judge?: Evaluation; coach?: Evaluation }>> = {}
        for (const ev of evals) {
          const info = draftInfo[ev.entry_draft_id]
          if (!info) continue
          const { direction_id, draft_generation } = info
          const mode: 'judge' | 'coach' = ev.evaluation_mode === 'coach' ? 'coach' : 'judge'
          if (!byGen[direction_id]) byGen[direction_id] = {}
          if (!byGen[direction_id][draft_generation]) byGen[direction_id][draft_generation] = {}
          if (!byGen[direction_id][draft_generation][mode]) byGen[direction_id][draft_generation][mode] = ev
        }
        setEvaluationsByGen(byGen)

        // Session 52 (P-03): eval_chat_history is no longer in the bulk fetch —
        // backfill it only for the ACTIVE judge eval of each direction (the only
        // place the page ever reads it). Fire-and-forget; chat panels are
        // collapsed by default so a late arrival is invisible.
        const judgeEvalToDir: Record<number, number> = {}
        for (const [dirId, slot] of Object.entries(evalMap)) {
          if (slot.judge?.id !== undefined) judgeEvalToDir[slot.judge.id] = Number(dirId)
        }
        const activeJudgeIds = Object.keys(judgeEvalToDir).map(Number)
        if (activeJudgeIds.length > 0) {
          supabase.from('evaluations')
            .select('id, eval_chat_history')
            .in('id', activeJudgeIds)
            .then(({ data: chats, error: chatErr }) => {
              if (cancelled) return
              if (chatErr) { console.error('eval chat backfill failed', chatErr); return }
              if (!chats) return
              const chatMap: Record<number, ChatMessage[]> = {}
              for (const row of chats as Array<{ id: number; eval_chat_history?: ChatMessage[] }>) {
                const dirId = judgeEvalToDir[row.id]
                if (dirId !== undefined && Array.isArray(row.eval_chat_history) && row.eval_chat_history.length > 0) {
                  chatMap[dirId] = row.eval_chat_history
                }
              }
              if (Object.keys(chatMap).length > 0) setEvalChatHistory(chatMap)
            })
        }
      }

      setFetching(false)
    })

    supabase.rpc('get_my_org_id').then(({ data }) => { if (!cancelled && data) setOrgId(data) })

    return () => { cancelled = true }
  }, [user?.id, projectId])

  // Session 54 — section_view engagement event per workspace tab.
  // The hook debounces to once per tab per browser session; gated on the
  // initial fetch so the default 'brief' tab is not logged during loading.
  useEffect(() => {
    if (!user || fetching) return
    trackSectionView(tab, { project_id: Number(projectId) })
  }, [tab, fetching, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-restore effect moved into PressKitTab (R1).

  // Fetch show_profiles rows for any directions not yet loaded.
  // Keyed by directionId so each card has instant access without a secondary lookup.
  // Query pattern mirrors the one used in evaluate-entry + generate-draft edge functions:
  //   category-specific row (non-null category_pattern) preferred over show-level default (null),
  //   achieved via nullsFirst: false ascending sort + limit 1.
  useEffect(() => {
    const unloaded = directions.filter(d => d.best_show && !(d.id in showProfiles))
    if (unloaded.length === 0) return
    Promise.all(
      unloaded.map(async d => {
        const firstWord = d.best_category?.split(/\s+/)[0] ?? ''
        const orFilter = firstWord
          ? `category_pattern.is.null,category_pattern.ilike.%${firstWord}%`
          : 'category_pattern.is.null'
        const { data } = await supabase
          .from('show_profiles')
          .select('show_name, judging_philosophy, scoring_emphasis, language_guidance, common_mistakes, jury_composition_notes')
          .eq('show_name', d.best_show!)
          .or(orFilter)
          .order('category_pattern', { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        return { dirId: d.id, profile: (data as ShowProfile | null) ?? null }
      })
    ).then(results => {
      setShowProfiles(prev => {
        const next = { ...prev }
        for (const { dirId, profile } of results) next[dirId] = profile
        return next
      })
    })
  }, [directions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── S98 Chunk 5 — resolve show_profiles.entry_form per direction ───────────
  // Mirrors the config edge functions' resolution EXACTLY: the longest show-level
  // (category_pattern NULL) show_name that best_show STARTS WITH is canonical, then
  // the category-exact row wins over the show-level row (pickEntryForm). AOY returns
  // null here on purpose: AOY keeps its dedicated render/routing in this chunk
  // (isAoyShow precedence), so its seeded entry_form stays dormant client-side.
  const resolveEntryFormFor = async (show?: string | null, category?: string | null): Promise<EntryFormSpec | null> => {
    const best = (show ?? '').trim()
    if (!best || isAoyShow(best)) return null
    const { data: showRows } = await supabase
      .from('show_profiles')
      .select('show_name, entry_form')
      .is('category_pattern', null)
    const bestLower = best.toLowerCase()
    const canonical = (showRows ?? [])
      .filter((r: { show_name?: string | null }) => typeof r.show_name === 'string' && bestLower.startsWith(r.show_name.trim().toLowerCase()))
      .sort((a: { show_name?: string | null }, b: { show_name?: string | null }) => (b.show_name?.length ?? 0) - (a.show_name?.length ?? 0))[0]
    if (!canonical?.show_name) return null
    const showLevelForm = ((canonical as { entry_form?: EntryFormSpec | null }).entry_form ?? null)
    const catKey = resolveEntryFormCategoryKey(canonical.show_name, category ?? '')
    let catForm: EntryFormSpec | null = null
    if (catKey) {
      const { data } = await supabase
        .from('show_profiles')
        .select('entry_form')
        .eq('show_name', canonical.show_name)
        .eq('category_pattern', catKey)
        .limit(1)
        .maybeSingle()
      catForm = ((data as { entry_form?: EntryFormSpec | null } | null)?.entry_form ?? null)
    }
    return pickEntryForm(
      catForm ? { category_pattern: catKey, entry_form: catForm } : null,
      { category_pattern: null, entry_form: showLevelForm },
    )
  }

  useEffect(() => {
    const unresolved = directions.filter(d => d.best_show && !(d.id in entryForms))
    if (unresolved.length === 0) return
    Promise.all(unresolved.map(async d => ({ dirId: d.id, form: await resolveEntryFormFor(d.best_show, d.best_category) })))
      .then(results => setEntryForms(prev => {
        const next = { ...prev }
        for (const { dirId, form } of results) next[dirId] = form
        return next
      }))
  }, [directions]) // eslint-disable-line react-hooks/exhaustive-deps

  // The one branch point for the config path (spec §8 Chunk 5): a non-AOY direction
  // whose entry_form resolves to a config-scored mode. null => keep the existing
  // dedicated/generic path (AOY, craft, specialist, unseeded).
  const configModeFor = (dirId: number, show?: string | null): 'weighted' | 'qualitative' | null => {
    if (isAoyShow(show ?? '')) return null
    const ef = entryForms[dirId]
    if (ef && (ef.scoring_mode === 'weighted' || ef.scoring_mode === 'qualitative')) return ef.scoring_mode
    return null
  }

  // Jury Intelligence Layer — fetch jury_cells for shows in current directions
  useEffect(() => {
    const shows = Array.from(new Set(directions.map(d => d.best_show).filter(Boolean))) as string[]
    const unloaded = shows.filter(s => !(s in juryShowCells))
    if (unloaded.length === 0) return
    supabase
      .from('jury_cells')
      .select('id, show_name, year, category, n_jurors, n_repeat_jurors, top_region, top_region_share, region_breakdown, president_region, president_country, president_is_repeat, philosophy_cluster, winner_regions, winner_countries, n_grand_prix, n_gold')
      .in('show_name', unloaded)
      .then(({ data }) => {
        if (!data) return
        setJuryShowCells(prev => {
          const next = { ...prev }
          for (const show of unloaded) {
            next[show] = (data as JuryCell[]).filter(c => c.show_name === show)
          }
          return next
        })
      })
  }, [directions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jury Intelligence Layer — fetch global regional uplift stats (once)
  useEffect(() => {
    if (regionalUplift.length > 0) return
    supabase
      .from('jury_regional_uplift')
      .select('region, cells_as_top_juror, cells_with_region_in_winners, pct_when_top_juror, baseline_pct, uplift_points')
      .then(({ data }) => {
        if (data) setRegionalUplift(data as RegionalUplift[])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Concatenate guided brief sections into a single string for storage
  const briefFromSections = (s: typeof briefSections) => [
    s.idea.trim()       && `Campaign idea & insight:\n${s.idea.trim()}`,
    s.execution.trim()  && `Execution:\n${s.execution.trim()}`,
    s.results.trim()    && `Results & impact:\n${s.results.trim()}`,
    s.intentions.trim() && `Entry intentions:\n${s.intentions.trim()}`,
  ].filter(Boolean).join('\n\n')

  const saveBrief = async () => {
    if (!project) return
    setSavingBrief(true)
    const textToSave = briefMode === 'guided'
      ? briefFromSections(briefSections)
      : briefText.trim()
    await supabase
      .from('projects')
      .update({ combined_text: textToSave, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, combined_text: textToSave } : p)
    setBriefEdit(false)
    setSavingBrief(false)
  }

  // Feature 4 — toggle a focus item chip on/off for a direction
  const toggleFocusItem = (dirId: number, item: string) => {
    setDraftFocusItems(prev => {
      const current = prev[dirId] || []
      return {
        ...prev,
        [dirId]: current.includes(item) ? current.filter(i => i !== item) : [...current, item],
      }
    })
  }

  // Feature 6 — generate tonal / creative direction brief
  // scriptText: freshly generated script text (passed from generateScript so we don't wait for DB write)
  // ── Collaborator CRUD ─────────────────────────────────────────────────────

  const handleAddCollaborator = async () => {
    if (!project || !newCollab.collaborator_name.trim()) return
    setSavingCollab(true)
    setCollabError('')
    // Get org_id from project
    const nextOrder = collaborators.length
    const { data, error } = await supabase
      .from('project_collaborators')
      .insert({
        project_id:        project.id,
        org_id:            orgId,
        collaborator_name: newCollab.collaborator_name.trim(),
        collaborator_type: newCollab.collaborator_type,
        contact_name:      newCollab.contact_name.trim() || null,
        contact_email:     newCollab.contact_email.trim() || null,
        website_url:       newCollab.website_url.trim() || null,
        is_lead_credit:    newCollab.is_lead_credit,
        credit_order:      nextOrder,
      })
      .select()
      .single()
    if (error) { setCollabError(error.message); setSavingCollab(false); return }
    if (data) setCollaborators(prev => [...prev, data as Collaborator])
    setNewCollab({ collaborator_name: '', collaborator_type: 'creative_agency', contact_name: '', contact_email: '', website_url: '', is_lead_credit: false })
    setAddCollabOpen(false)
    setSavingCollab(false)
  }

  const handleRemoveCollaborator = async (id: number) => {
    await supabase.from('project_collaborators').delete().eq('id', id)
    setCollaborators(prev => prev.filter(c => c.id !== id))
  }

  // ── Press Kit helpers ─────────────────────────────────────────────────────

  // Resolve the best content for a single entry draft field
  const resolveFieldContent = (d: EntryDraft): string => {
    if (d.custom_text?.trim()) return d.custom_text.trim()
    if (d.selected === 'b' && d.version_b?.trim()) return d.version_b.trim()
    if (d.selected === 'c' && d.version_c?.trim()) return d.version_c.trim()
    return d.version_a?.trim() || ''
  }

  // Get current-generation fields for a direction, ordered by sort_order
  const getCurrentDraftFields = (dirId: number): EntryDraft[] => {
    const dirEntries = entries.filter(e => e.direction_id === dirId && e.field_key !== 'entry')
    if (dirEntries.length === 0) return []
    const maxGen = Math.max(...dirEntries.map(e => e.draft_generation ?? 0))
    return dirEntries
      .filter(e => (e.draft_generation ?? 0) === maxGen)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  // Copy a plain text string to clipboard with keyed confirmation
  const copyTextWithConfirm = async (key: string, text: string, setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setter(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setter(prev => ({ ...prev, [key]: false })), 2500)
  }

  const saveShows = async () => {
    if (!project) return
    setSavingShows(true)
    await supabase
      .from('projects')
      .update({ target_shows: targetShows, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject(p => p ? { ...p, target_shows: targetShows } : p)
    if (directions.length > 0) setShowsChangedWarning(true)
    setEditingShows(false)
    setEditingShowsInline(false)
    setSavingShows(false)
  }

  const toggleShow = (show: string) => {
    setTargetShows(prev =>
      prev.includes(show) ? prev.filter(s => s !== show) : [...prev, show]
    )
  }

  // AOY chunk 6: endorsements checklist toggle. Hygiene-only state, never
  // touches scoring. DM-16: check the returned row before trusting the local
  // optimistic state — a silent RLS no-op must not look saved when it isn't.
  const [savingEndorsement, setSavingEndorsement] = useState(false)
  const toggleEndorsementItem = async (key: EndorsementItemKey) => {
    if (!project) return
    const current: Record<string, boolean> = project.endorsements_checklist || {}
    const next = { ...current, [key]: !current[key] }
    setSavingEndorsement(true)
    const { data, error } = await supabase
      .from('projects')
      .update({ endorsements_checklist: next, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select('endorsements_checklist')
      .single()
    if (!error && data) {
      setProject(p => p ? { ...p, endorsements_checklist: data.endorsements_checklist as Record<string, boolean> } : p)
    } else {
      console.error('endorsements checklist save failed', error)
    }
    setSavingEndorsement(false)
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
    setShowRequestError('')
    try {
      const accessToken = await getToken()
      if (!accessToken) {
        setShowRequestError('Session expired — please refresh the page and try again.')
        return
      }
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
      } else {
        setShowRequestError('Something went wrong sending the request. Please try again.')
      }
    } catch (e) {
      console.error('Show request submit error:', e)
      setShowRequestError('Something went wrong sending the request. Please try again.')
    } finally {
      setShowRequestSubmitting(false)
    }
  }

  const handleRenameProject = async () => {
    const trimmed = nameEditValue.trim()
    if (!trimmed || !project || trimmed === project.campaign_name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ campaign_name: trimmed })
        .eq('id', project.id)
      if (!error) {
        setProject(p => p ? { ...p, campaign_name: trimmed } : p)
        setEditingName(false)
      }
    } finally {
      setSavingName(false)
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
      'Generated by Shortlist · shortlist.app',
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

  // Download current draft fields as a plain-text file
  const downloadDraft = (d: Direction) => {
    const fields = getCurrentDraftFields(d.id)
    if (fields.length === 0) return
    const lines = [
      'AWARD ENTRY DRAFT',
      '================================',
      `Project:   ${project?.campaign_name || ''}`,
      `Client:    ${project?.client_name || '—'}`,
      `Show:      ${d.best_show || '—'}`,
      `Category:  ${d.best_category || '—'}`,
      `Angle:     ${d.name || '—'}`,
      `Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      '================================',
      '',
    ]
    for (const field of fields) {
      const content = resolveFieldContent(field)
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length
      lines.push(`${field.field_label.toUpperCase()}${field.word_limit ? ` (limit: ${field.word_limit} words)` : ''} — ${wordCount} words`)
      lines.push('---')
      lines.push(content)
      lines.push('')
    }
    lines.push('---')
    lines.push('Generated by Shortlist · shortlist.app')
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = (d.name || 'draft').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    a.download = `draft-${safeName}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Coach feedback export (S93) ────────────────────────────────────────────
  // Bundles the advisory coach commentary (SMARTIES or AOY) with the latest jury
  // evaluation into ONE clean plain-text block an awards champion can paste into an
  // email or a messaging app, or download as .txt. Plain text only, no markdown
  // artifacts. The coach part is whatever is in session state (coach is session-
  // only, by decision); the jury part is read from the persisted evaluation if one
  // exists. Either part may be absent; the block degrades gracefully.
  type CoachFeedbackInput = {
    kind: 'SMARTIES' | 'AOY'
    category: string | null
    overall: string
    priorities: string[]
    sections: { label: string; weight?: number | null; missing: string[]; suggestions: string[] }[]
  }
  const buildFeedbackText = (d: Direction, jury: Evaluation | undefined, coach: CoachFeedbackInput): string => {
    const lines: string[] = [
      'AWARD ENTRY FEEDBACK',
      '================================',
      `Project:   ${project?.campaign_name || ''}`,
      `Client:    ${project?.client_name || '—'}`,
      `Show:      ${d.best_show || '—'}`,
      `Category:  ${coach.category || d.best_category || '—'}`,
      `Exported:  ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      `${coach.kind} COACH REVIEW (advisory, not a score)`,
      '================================',
    ]
    if (coach.overall) { lines.push(coach.overall, '') }
    if (coach.priorities.length) {
      lines.push('HIGHEST-LEVERAGE FIXES:')
      coach.priorities.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`))
      lines.push('')
    }
    coach.sections.forEach(sec => {
      const weightTag = typeof sec.weight === 'number' ? ` (${sec.weight}% of score)` : ''
      lines.push(`${sec.label.toUpperCase()}${weightTag}`)
      lines.push('--------------------------------')
      if (sec.missing.length) {
        lines.push('Missing:')
        sec.missing.forEach(m => lines.push(`  - ${m}`))
      }
      if (sec.suggestions.length) {
        lines.push('Suggestions:')
        sec.suggestions.forEach(s => lines.push(`  - ${s}`))
      }
      if (!sec.missing.length && !sec.suggestions.length) lines.push('  (no notes)')
      lines.push('')
    })

    if (jury) {
      lines.push('', 'JURY EVALUATION', '================================')
      lines.push(`Overall score: ${jury.overall_score.toFixed(1)} / 10`, '')
      const juryOut = jury.output as unknown as { sections?: { label?: string; score?: number }[] } | null
      if (Array.isArray(juryOut?.sections) && juryOut!.sections.length) {
        lines.push('SECTION SCORES:')
        juryOut!.sections.forEach(s => lines.push(`  ${String(s.label ?? '').padEnd(28)} ${s.score ?? 0}/10`))
        lines.push('')
      } else {
        lines.push('DIMENSION SCORES:')
        SCORE_DIMENSIONS.forEach(dim => lines.push(`  ${dim.label.padEnd(20)} ${jury.scores[dim.key] ?? 0}/10`))
        lines.push('')
      }
      if (jury.strengths?.length) {
        lines.push('STRENGTHS:')
        jury.strengths.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
        lines.push('')
      }
      if (jury.gaps?.length) {
        lines.push('GAPS:')
        jury.gaps.forEach((g, i) => lines.push(`  ${i + 1}. ${g}`))
        lines.push('')
      }
      if (jury.recommendations) { lines.push('VERDICT / RECOMMENDATIONS:', jury.recommendations, '') }
    }

    lines.push('---', 'Generated by Shortlist · shortlist.app')
    return lines.join('\n')
  }
  const downloadCoachFeedback = (d: Direction, jury: Evaluation | undefined, coach: CoachFeedbackInput) => {
    const blob = new Blob([buildFeedbackText(d, jury, coach)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = (d.name || 'feedback').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    a.download = `feedback-${safeName}.txt`
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

    // S110 follow-up (S109 546 fix): Supabase Storage rejects object keys
    // containing certain characters, square brackets among them. A compressor-
    // added suffix like '[32]-compressed.pdf' made the raw filename fail
    // upload with "Invalid key", silently ('No files uploaded yet') -- looked
    // like a broken uploader. Sanitize only the STORAGE KEY's filename portion;
    // the display name above (Material.name) keeps the original file.name.
    const path = `${project.id}/${Date.now()}-${safeFileName(file.name)}`
    const { error: uploadErr } = await supabase.storage.from('project-materials').upload(path, file)
    if (uploadErr) {
      setUploadError(uploadErr.message)
      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
      return
    }

    // S160 refactor: extraction goes through the shared lib/extract-entry-text.ts
    // (the S158 module /start already uses), so the two copies cannot drift.
    // The lib is storage-agnostic and returns rendered chart-page blobs;
    // uploading them stays here (the storage key needs this page's project id).
    const { text: extractedText, chartBlobs } = await extractEntryText(file, setUploadProgress)
    const chartImagePaths: string[] = []
    for (const cb of chartBlobs) {
      const chartPath = `${project.id}/charts/${Date.now()}-page-${cb.pageNum}.jpg`
      const { error: chartErr } = await supabase.storage
        .from('project-materials').upload(chartPath, cb.blob, { contentType: 'image/jpeg' })
      if (!chartErr) chartImagePaths.push(chartPath)
    }

    setUploadProgress('Saving…')
    // Session 52 (P-03): the DB write goes through the atomic append RPC.
    // NEVER reinstate the old read-modify-write of the whole materials array —
    // in-memory materials are now SLIM (no extracted_text), so writing the
    // array back would destroy extracted_text for every material in the project.
    const newMaterial: Material = {
      name: file.name, path, type: ext || '', size: file.size,
      uploaded_at: new Date().toISOString(),
      ...(extractedText ? { extracted_text: extractedText } : {}),
      ...(chartImagePaths.length > 0 ? { chart_image_paths: chartImagePaths } : {}),
    }
    const { error: saveErr } = await supabase.rpc('append_project_material', {
      p_project_id: project.id,
      p_material: newMaterial,
    })
    if (saveErr) {
      setUploadError('The file uploaded but could not be saved to the project — please try again.')
    } else {
      // Local copy keeps full extracted_text (this session) plus the derived
      // slim fields so all helpers behave consistently after upload.
      if (extractedText) materialTextCache.current[path] = extractedText
      const localMaterial: Material = {
        ...newMaterial,
        has_text: !!extractedText,
        text_words: extractedText.trim().split(/\s+/).filter(Boolean).length,
      }
      setProject(p => p ? { ...p, materials: [...(p.materials || []), localMaterial] } : p)
    }
    setUploading(false)
    setUploadProgress('')
    e.target.value = ''
  }

  const deleteFile = async (index: number) => {
    if (!project) return
    const material = project.materials[index]
    if (!material) return
    setUploadError('')

    // CALL-SITE GUARD (5 Aug 2026). material.path can be absent on a
    // hand-seeded material, and an undefined argument to supabase.rpc() is
    // dropped by JSON.stringify -- PostgREST then resolves a signature that
    // does not exist and 404s the FUNCTION (PGRST202), which reads as a lost
    // grant. It would also make the storage key literally [undefined].
    const path = material.path
    if (!path) {
      setUploadError('This file is missing its storage reference, so it cannot be removed automatically. Re-upload it and remove the copy.')
      return
    }

    await supabase.storage.from('project-materials').remove([path])
    if (material.chart_image_paths?.length) {
      await supabase.storage.from('project-materials').remove(material.chart_image_paths)
    }
    // Session 52 (P-03): removal by PATH via RPC — see upload note; the old
    // filtered-array write-back must never come back. Local state only updates
    // on success so the in-memory list never desyncs from the DB.
    const { error: removeErr } = await supabase.rpc('remove_project_material', {
      p_project_id: project.id,
      p_path: path,
    })
    if (removeErr) {
      // Until 5 Aug 2026 this branch did not exist and Remove was a silent
      // no-op: the RPC was LANGUAGE sql RETURNS void, so it could not report
      // that it had matched nothing, and the UI simply did not update. The
      // migration harden_project_material_rpcs_path_assertions makes it RAISE
      // on a no-match, so an error here is real and must be shown.
      console.error('remove_project_material failed', removeErr)
      setUploadError('Could not remove this file. Please refresh the page and try again.')
      return
    }
    delete materialTextCache.current[path]
    setProject(p => p ? { ...p, materials: (p.materials || []).filter((_, i) => i !== index) } : p)
  }

  const getToken = async (): Promise<string | null> => {
    // getSession() auto-refreshes if token is expired — don't call refreshSession()
    // directly, as it always fires TOKEN_REFRESHED which re-triggers the data useEffect.
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return session.access_token
    window.location.href = '/login'
    return null
  }

  // Session 52 (P-03): extracted_text is no longer loaded with the page.
  // Fetch a single material's text on demand, cached by storage path (path is
  // unique and stable — index addressing would silently return the WRONG
  // material's text if another tab deleted a material). Fresh uploads this
  // session still carry extracted_text in memory and skip the round trip.
  const materialTextCache = useRef<Record<string, string>>({})
  const fetchMaterialText = async (material: Material | undefined): Promise<MaterialTextResult> => {
    if (!material) return { ok: false, reason: 'no_material' }
    if (material.extracted_text) return { ok: true, text: material.extracted_text }
    if (!material.has_text) return { ok: false, reason: 'no_text' }
    // CALL-SITE GUARD: see deleteFile. Without this the undefined p_path is
    // dropped from the JSON body and the 404 lands on the function name.
    const path = material.path
    if (!path) return { ok: false, reason: 'missing_path' }
    const cached = materialTextCache.current[path]
    if (cached !== undefined) return cached ? { ok: true, text: cached } : { ok: false, reason: 'no_text' }
    const { data, error } = await supabase.rpc('get_project_material_text', {
      p_project_id: projectId,
      p_path: path,
    })
    // Never collapse this into '' again: the caller could not tell a failed
    // call from an empty document, and the copy it produced was false.
    if (error) { console.error('material text fetch failed', error); return { ok: false, reason: 'fetch_failed' } }
    const text = (data as string | null) ?? ''
    materialTextCache.current[path] = text
    return text ? { ok: true, text } : { ok: false, reason: 'no_text' }
  }

  const generateDirections = async (skipChecks = false) => {
    if (!project) return

    // ── Pre-check 1: geographic eligibility ───────────────────────────────────
    // Always prompt for any regionally-restricted show — no keyword detection,
    // which was unreliable (global brand materials mention multiple markets).
    if (!skipChecks) {
      const warnings = getRegionalShowWarnings(targetShows)
      if (warnings.length > 0) {
        setGeoWarnings(warnings)
        setShowGeoWarningModal(true)
        return
      }
    }

    setGenerating(true)
    setGenerateError('')
    try {
      const accessToken = await getToken()
      if (!accessToken) return

      // Resolve context_override from source selector (same pattern as generateScript)
      // Session 52 (P-03): material text fetched on demand. The filtered-list
      // index (dirSourceMaterialIdx) matches the selector render, which filters
      // with the same materialHasText predicate.
      let dirContextOverride: string | undefined
      if (dirSourceType === 'material') {
        const mats = (project.materials || []).filter(materialHasText)
        // Best-effort override: an unreadable source silently means "no
        // override" here, which is correct -- nothing is claimed to the user.
        dirContextOverride = materialTextOrUndefined(await fetchMaterialText(mats[dirSourceMaterialIdx]))
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
      if (!res.ok || data.error) {
        setGenerateError(formatError(appErrorFromResponse(data, res.status, 'DIR')))
        return
      }
      const newDirs: Direction[] = data.directions || []
      setDirections(prev => [...newDirs, ...prev])
      setNewDirectionIds(prev => new Set(Array.from(prev).concat(newDirs.map(d => d.id))))
      if (newDirs.length > 0) track('directions_generated', { project_id: Number(projectId), count: newDirs.length })
    } catch (err) {
      setGenerateError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'DIR-NET' }))
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
      // Prepend new smart directions to top of list and switch to Directions tab
      if (data.directions?.length) {
        const smartNewDirs: Direction[] = data.directions
        setDirections(prev => [...smartNewDirs, ...prev])
        setNewDirectionIds(prev => new Set(Array.from(prev).concat(smartNewDirs.map(d => d.id))))
        track('directions_generated', { project_id: Number(projectId), count: smartNewDirs.length, suggest_mode: mode })
        // Session 57 (Ben): land on Directions sorted by Category Fit so the
        // alternatives read in a logical order, not insertion order
        setDirSortKey('category_fit')
        setTab('directions')
      }
    } catch (err) {
      setSmartDirectionsError(prev => ({ ...prev, [directionId]: formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'DIR-NET' }) }))
    } finally {
      setSmartDirectionsLoading(prev => { const n = { ...prev }; delete n[directionId]; return n })
    }
  }

  // Session 72 — manually add a Campaign AOY direction from the controlled picker.
  // The directions panel otherwise only AI-generates directions (free-text
  // categories that would not normalize). This inserts a placement with a CANONICAL
  // best_category so the deployed exact-key rubric lookup fires; the user then
  // generates a draft from it like any other direction.
  const addAoyDirection = async () => {
    if (!project || !user || !dcAoyCategory.trim()) return
    setAddingAoyDir(true); setAoyDirError('')
    try {
      let currentOrgId = orgId
      if (!currentOrgId) {
        const { data } = await supabase.rpc('get_my_org_id')
        currentOrgId = data
        if (currentOrgId) setOrgId(currentOrgId)
      }
      const showName = AOY_SHOW_NAME
      const category = dcAoyCategory.trim()
      const { data: existingDirs } = await supabase
        .from('directions').select('id')
        .eq('project_id', project.id)
        .eq('best_show', showName)
        .eq('best_category', category)
        .limit(1)
      if (existingDirs && existingDirs.length > 0) {
        setAoyDirError('That entry already exists in this project.')
        setAddingAoyDir(false)
        return
      }
      const { data: newDir, error: dirErr } = await supabase
        .from('directions')
        .insert({
          project_id: project.id,
          org_id: currentOrgId,
          created_by: user.id,
          name: `${showName}: ${category}`,
          best_show: showName,
          best_category: category,
          angle: 'Campaign AOY entry (market-scoped)',
          sort_order: directions.length,
        })
        .select()
        .single()
      if (dirErr || !newDir) {
        setAoyDirError(dirErr?.message || 'Failed to create the entry.')
        setAddingAoyDir(false)
        return
      }
      const dir = newDir as Direction
      setDirections(prev => [dir, ...prev])
      setNewDirectionIds(prev => new Set(Array.from(prev).concat([dir.id])))
      track('directions_generated', { project_id: Number(projectId), count: 1, source: 'aoy_manual' })
      setDirSortKey('default')
      setShowAoyDirModal(false)
      setDcAoyCategory('')
    } catch (err) {
      setAoyDirError('Something went wrong creating the entry. Please try again.')
    } finally {
      setAddingAoyDir(false)
    }
  }

  const generateHooks = async (directionId: number) => {
    setHooksLoading(prev => ({ ...prev, [directionId]: true }))
    setHooksError(prev => ({ ...prev, [directionId]: '' }))
    setHooksOpen(prev => ({ ...prev, [directionId]: true }))
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-hooks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ direction_id: directionId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setHooksError(prev => ({ ...prev, [directionId]: formatError(appErrorFromResponse(data, res.status, 'HOOKS')) }))
        return
      }
      setHooksOptions(prev => ({ ...prev, [directionId]: data.hooks || [] }))
    } catch (err) {
      setHooksError(prev => ({ ...prev, [directionId]: formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'HOOKS-NET' }) }))
    } finally {
      setHooksLoading(prev => ({ ...prev, [directionId]: false }))
    }
  }

  const generateDraft = async (directionId: number, evaluationId?: number) => {
    if (!project) return
    setGeneratingDraft(true)
    setGenerateDraftError('')
    setGenerateDraftErrorDirId(null)
    setDraftFindingsData(null)
    setGeneratingForDirectionId(directionId)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      // AOY directions route to the dedicated weighted-section drafter (S74).
      // Same body + response shape ({ entry_drafts, draft_generation }); the
      // campaign path (generate-draft) is untouched.
      // SMARTIES directions route to the dedicated four-section drafter (S92);
      // the campaign and AOY paths are untouched.
      // Session 99 fix: a non-AOY/non-SMARTIES config show (Women to Watch, a
      // Clio Creators weighted medium) was resolving evaluate-entry-config +
      // segment-entry-config for scoring/upload (Chunk 5), but "Generate Draft"
      // was NEVER wired to generate-entry-draft (Chunk 2) — every config show
      // fell through to the generic drafter, which invents its own field
      // structure and writes no section_weight, so the config jury then 404s
      // with ENTRYEVAL-NODRAFT ("no weighted sections"). configModeFor mirrors
      // the same check already used for judge/coach routing just below.
      const draftShow = directions.find(d => d.id === directionId)?.best_show ?? ''
      const isAoyDir = isAoyShow(draftShow)
      const isSmartiesDir = isSmartiesShow(draftShow)
      const draftConfigMode = configModeFor(directionId, draftShow)
      const draftFnName = isAoyDir
        ? 'generate-aoy-draft'
        : isSmartiesDir
          ? 'generate-smarties-draft'
          : draftConfigMode
            ? 'generate-entry-draft'
            : 'generate-draft'
      const body: Record<string, unknown> = { project_id: project.id, direction_id: directionId }
      if (evaluationId) body.evaluation_id = evaluationId
      const focusItems = draftFocusItems[directionId] || []
      if (focusItems.length > 0) body.focus_items = focusItems
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${draftFnName}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setGenerateDraftError(formatError(appErrorFromResponse(data, res.status, 'DRAFT')))
        setGenerateDraftErrorDirId(directionId)
        // Findings render (23 Aug 2026): a 422 from any drafter carries the
        // guard's findings[] and the hedged-figures list; show them instead of
        // leaving the user with only the generic banner. Defensive coercion:
        // older deploys or other error codes carry neither.
        const blockedFindings: DraftFinding[] = Array.isArray(data.findings)
          ? (data.findings as unknown[]).filter((f): f is DraftFinding => Boolean(f && typeof (f as DraftFinding).issue === 'string')).map(f => ({ section: String(f.section ?? ''), issue: String(f.issue), detail: String(f.detail ?? '') }))
          : []
        const blockedHedged: HedgedFigure[] = Array.isArray(data.hedged_figures)
          ? (data.hedged_figures as unknown[]).filter((h): h is HedgedFigure => Boolean(h && typeof (h as HedgedFigure).val === 'string')).map(h => ({ val: String(h.val), caveat: String(h.caveat ?? '') }))
          : []
        if (blockedFindings.length > 0) {
          setDraftFindingsData({ dirId: directionId, blocked: true, findings: blockedFindings, hedgedFigures: blockedHedged, notice: null })
        }
        return
      }
      // Findings render (23 Aug 2026): the success payload carries the hedged
      // figures the guard licensed (use them, keep the caveat) and, since the
      // NOFACTS relaxation, a notice when the draft was built without validated
      // agency facts. Show both beside the new draft.
      {
        const okHedged: HedgedFigure[] = Array.isArray(data.hedged_figures)
          ? (data.hedged_figures as unknown[]).filter((h): h is HedgedFigure => Boolean(h && typeof (h as HedgedFigure).val === 'string')).map(h => ({ val: String(h.val), caveat: String(h.caveat ?? '') }))
          : []
        const okNotice = typeof data.notice === 'string' && data.notice ? data.notice : null
        if (okHedged.length > 0 || okNotice) {
          setDraftFindingsData({ dirId: directionId, blocked: false, findings: [], hedgedFigures: okHedged, notice: okNotice })
        }
      }
      if (data.entry_drafts?.length) {
        // Append new generation — old drafts remain in state for history display
        setEntries(prev => [...prev, ...data.entry_drafts])
        // Note: evaluations are NOT cleared — they belong to their specific generation rows
        track('draft_generated', { project_id: Number(projectId), direction_id: directionId, generation: data.entry_drafts[0]?.draft_generation ?? null })
      }
      // The newly drafted entry becomes the focused card: first in order,
      // expanded, scrolled to and flashed (justScoredDirId effect). S91 — fixes
      // a new draft landing far below older entries.
      setFocusedEntryDirId(directionId)
      setEntryCardExpanded(prev => ({ ...prev, [directionId]: true }))
      setJustScoredDirId(directionId)
      setTab('entries')
    } catch (err) {
      setGenerateDraftError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'DRAFT-NET' }))
      setGenerateDraftErrorDirId(directionId)
    } finally { setGeneratingDraft(false); setGeneratingForDirectionId(null) }
  }

  // B3 angles bridge (19 Aug 2026): /projects/[id]?draftDirection=<id> fires the
  // SAME generateDraft flow above (per-entry-type routing untouched) once the
  // direction's entry_form has resolved — configModeFor needs entryForms[dirId],
  // or a config show would silently fall to the generic drafter (the S99 class).
  // Ref-guarded one-shot; the param is cleared so a refresh cannot regenerate.
  const bridgeDraftFiredRef = useRef(false)
  useEffect(() => {
    const dirId = Number(new URLSearchParams(window.location.search).get('draftDirection') || 'NaN')
    if (bridgeDraftFiredRef.current || !Number.isFinite(dirId) || !project || !(dirId in entryForms) || !directions.some(d => d.id === dirId)) return
    bridgeDraftFiredRef.current = true
    window.history.replaceState(null, '', window.location.pathname)
    setTab('directions')
    generateDraft(dirId)
  }, [project, directions, entryForms]) // eslint-disable-line react-hooks/exhaustive-deps

  // B2.1 spine parity (19 Aug 2026): /projects/[id]?tab=<key> lets the
  // angles route's spine (its own route, B2) send the user back to a named
  // section on THIS page, same one-shot/ref-guarded/history-cleared pattern
  // as the draftDirection effect just above. The angles page pre-resolves
  // the spine step key to one of these Tab values itself (its own copy of
  // the AOY_STEP_TO_TAB mapping below, since it cannot reach this page's
  // module-local state) — this effect only validates and applies.
  const tabParamFiredRef = useRef(false)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    const validTabs: Tab[] = ['brief', 'materials', 'entries', 'script', 'directions', 'facts', 'endorsements', 'presskit']
    if (tabParamFiredRef.current || !t || !(validTabs as string[]).includes(t)) return
    tabParamFiredRef.current = true
    window.history.replaceState(null, '', window.location.pathname)
    setTab(t as Tab)
  }, [])

  // Session 76 — AOY category-fit recommender. Resolves the direction's stored
  // best_category to its market-scoped candidate set (lib/aoy-taxonomy.ts owns the
  // scoping, so South Asia / Asia-Pacific Network can never appear), then asks
  // recommend-aoy-category which category the entry's evidence fits strongest. One
  // ranking call; no evaluations row is written (advisory, not a scored entry).
  const recommendAoyCategory = async (directionId: number) => {
    if (!project) return
    const d = directions.find(x => x.id === directionId)
    if (!d) return
    const resolved = aoyResolveStored(d.best_category ?? '')
    if (!resolved || resolved.candidates.length < 2) {
      setRecommendingForDirectionId(directionId)
      setRecommendError(formatError({ message: 'Pick a market-scoped AOY category with at least two comparable categories before checking fit.', retryable: false, code: 'RECCAT-NOCANDIDATES' }))
      return
    }
    setRecommending(true)
    setRecommendError('')
    setRecommendingForDirectionId(directionId)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const candidates = resolved.candidates.map(o => ({ stem_key: o.stemKey, label: o.label }))
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/recommend-aoy-category`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId, candidates }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setRecommendError(formatError(appErrorFromResponse(data, res.status, 'RECCAT')))
        return
      }
      if (data.recommendation) {
        setAoyRecommendations(prev => ({ ...prev, [directionId]: data.recommendation as AoyRecommendation }))
      }
    } catch (err) {
      setRecommendError(formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'RECCAT-NET' }))
    } finally {
      setRecommending(false)
      setRecommendingForDirectionId(null)
    }
  }

  // Session 77 — AOY entry-slate strategy (generate-aoy-strategy). The user picks
  // ONE seed category in the market + pillar they want a plan for; aoyResolveStored
  // expands it to the full market-scoped candidate set (so South Asia / APAC Network
  // can never appear). Returns recommendations the user accepts into directions.
  const generateAoyStrategy = async () => {
    if (!project || !strategySeed.trim()) return
    const resolved = aoyResolveStored(strategySeed.trim())
    if (!resolved || resolved.candidates.length < 2) {
      setStrategyError(formatError({ message: 'Pick a market-scoped category so the planner can build a slate of at least two comparable categories.', retryable: false, code: 'STRAT-NOCANDIDATES' }))
      return
    }
    const track = aoyTrackById(resolved.trackId)
    // Market-tier agency categories need a market. Recover it from the seed (a
    // market-tier pick carries a market prefix; a regional pick does not).
    const seed = strategySeed.trim()
    const marketPrefix = track?.markets.find(m => seed.toLowerCase().startsWith(m.prefix.toLowerCase() + ' '))?.prefix ?? null
    const candidates = resolved.candidates.map(o => {
      const bc = buildAoyBestCategory({ trackId: resolved.trackId, option: o, marketPrefix: o.requiresMarket ? marketPrefix : null })
      if (!bc) return null
      const scope = o.requiresMarket ? (marketPrefix ?? '') : (track?.label ?? '')
      return { stem_key: o.stemKey, label: `${scope} ${o.label}`.trim(), best_category: bc }
    }).filter((c): c is { stem_key: string; label: string; best_category: string } => !!c)
    if (candidates.length < 2) {
      setStrategyError(formatError({ message: 'This selection does not produce enough market-scoped categories to compare. For agency disciplines, pick a specific market (not just the region), or choose a different pillar.', retryable: false, code: 'STRAT-NOCANDIDATES' }))
      return
    }
    setGeneratingStrategy(true)
    setStrategyError('')
    setAoyStrategy(null)
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-aoy-strategy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, track_id: resolved.trackId, market_prefix: marketPrefix, pillar: resolved.pillar, candidates }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setStrategyError(formatError(appErrorFromResponse(data, res.status, 'STRAT')))
        return
      }
      if (data.strategy) {
        setAoyStrategy(data.strategy as AoyStrategy)
        setShowStrategyModal(false)
      }
    } catch (err) {
      setStrategyError(formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'STRAT-NET' }))
    } finally {
      setGeneratingStrategy(false)
    }
  }

  // Accept a strategy recommendation into a directions row (one writer of
  // directions: the same canonical-category insert as Add AOY entry). The
  // positioning angle seeds the direction's angle.
  const acceptStrategyRecommendation = async (rec: AoyStrategyRec) => {
    if (!project || !user) return
    setAcceptingStem(rec.stem)
    setStrategyError('')
    try {
      let currentOrgId = orgId
      if (!currentOrgId) {
        const { data } = await supabase.rpc('get_my_org_id')
        currentOrgId = data
        if (currentOrgId) setOrgId(currentOrgId)
      }
      const showName = AOY_SHOW_NAME
      const category = rec.best_category
      const { data: existingDirs } = await supabase
        .from('directions').select('id')
        .eq('project_id', project.id)
        .eq('best_show', showName)
        .eq('best_category', category)
        .limit(1)
      if (existingDirs && existingDirs.length > 0) {
        setStrategyError(formatError({ message: 'That entry already exists in this project.', retryable: false, code: 'STRAT-DUP' }))
        return
      }
      const angle = (rec.positioning || 'Campaign AOY entry (market-scoped)').slice(0, 280)
      const { data: newDir, error: dirErr } = await supabase
        .from('directions')
        .insert({
          project_id: project.id,
          org_id: currentOrgId,
          created_by: user.id,
          name: `${showName}: ${category}`,
          best_show: showName,
          best_category: category,
          angle,
          sort_order: directions.length,
        })
        .select()
        .single()
      if (dirErr || !newDir) {
        setStrategyError(formatError({ message: dirErr?.message || 'Failed to create the entry.', retryable: true, code: 'STRAT-DB' }))
        return
      }
      const dir = newDir as Direction
      setDirections(prev => [dir, ...prev])
      setNewDirectionIds(prev => new Set(Array.from(prev).concat([dir.id])))
      track('directions_generated', { project_id: Number(projectId), count: 1, source: 'aoy_strategy' })
      setDirSortKey('default')
    } catch (err) {
      setStrategyError(formatError({ message: 'Something went wrong creating the entry. Please try again.', retryable: true, code: 'STRAT-DB' }))
    } finally {
      setAcceptingStem(null)
    }
  }

  // Session 77 — AOY per-section Coach (generate-aoy-coach). Advisory guidance on a
  // drafted AOY entry; never a score, so it does not touch the calibrated scorers.
  const coachAoyEntry = async (directionId: number) => {
    if (!project) return
    setCoaching(true)
    setCoachingError('')
    setCoachingForDirectionId(directionId)
    setEvaluatingMode(prev => ({ ...prev, [directionId]: 'coach' }))
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-aoy-coach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setCoachingError(formatError(appErrorFromResponse(data, res.status, 'COACH')))
        return
      }
      if (data.coaching) {
        setAoyCoaching(prev => ({ ...prev, [directionId]: data.coaching as AoyCoaching }))
        // S160b: the result renders under the eval rail's Coach Review tab —
        // switch to it and expand the rail so the fresh advice is visible.
        setEvalDisplayMode(prev => ({ ...prev, [directionId]: 'coach' }))
        setEvalPanelExpanded(prev => ({ ...prev, [directionId]: true }))
      }
    } catch (err) {
      setCoachingError(formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'COACH-NET' }))
    } finally {
      setCoaching(false)
      // Do NOT null coachingForDirectionId here. The coaching error banner is gated
      // on `coachingForDirectionId === dirId`, so nulling it on completion hid every
      // error (spin -> green -> nothing). The `coaching` flag already governs the
      // spinner, so this association is only read when there is an error to show; it
      // is reset to the new direction at the start of the next coach run.
      setEvaluatingMode(prev => { const next = { ...prev }; delete next[directionId]; return next })
    }
  }

  // S98 Chunk 5 — config per-section Coach (generate-entry-coach-config). Advisory
  // guidance on a drafted config-path entry (weighted or qualitative); never a
  // score, so it does not touch the calibrated scorers. Generalizes coachAoyEntry /
  // coachSmartiesEntry into one handler. Same S79 banner lesson: coachingForDirectionId
  // is NOT nulled in finally (the error banner is gated on it); it is reset to the
  // new direction at the start of the next coach run.
  const coachConfigEntry = async (directionId: number) => {
    if (!project) return
    setCoaching(true)
    setCoachingError('')
    setCoachingForDirectionId(directionId)
    setEvaluatingMode(prev => ({ ...prev, [directionId]: 'coach' }))
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-entry-coach-config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setCoachingError(formatError(appErrorFromResponse(data, res.status, 'ENTRYCOACH')))
        return
      }
      if (data.coaching) {
        setConfigCoaching(prev => ({ ...prev, [directionId]: data.coaching as ConfigCoaching }))
        // S160b: same reveal as the AOY coach above.
        setEvalDisplayMode(prev => ({ ...prev, [directionId]: 'coach' }))
        setEvalPanelExpanded(prev => ({ ...prev, [directionId]: true }))
      }
    } catch (err) {
      setCoachingError(formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'ENTRYCOACH-NET' }))
    } finally {
      setCoaching(false)
      // Do NOT null coachingForDirectionId here (same reason as coachAoyEntry: the
      // error banner is gated on it). The `coaching` flag governs the spinner.
      setEvaluatingMode(prev => { const next = { ...prev }; delete next[directionId]; return next })
    }
  }

  // Session 85 — AOY market-context modifier (evaluate-aoy-market). Reads the
  // persisted raw jury evaluation, resolves the sourced baseline, and returns a
  // bounded per-section delta. Never touches the calibrated score; both numbers
  // are shown. Advisory, so it does not write an evaluations row.
  const applyAoyMarket = async (directionId: number, evaluationId: number) => {
    if (!project) return
    setMarketAdjusting(directionId)
    setMarketAdjustError(prev => { const next = { ...prev }; delete next[directionId]; return next })
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-aoy-market`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: directionId, evaluation_id: evaluationId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setMarketAdjustError(prev => ({ ...prev, [directionId]: formatError(appErrorFromResponse(data, res.status, 'AOYMKT')) }))
        return
      }
      if (data.market_adjustment) {
        setAoyMarketAdj(prev => ({ ...prev, [directionId]: data.market_adjustment as AoyMarketAdjustment }))
      }
    } catch (err) {
      setMarketAdjustError(prev => ({ ...prev, [directionId]: formatError({ message: 'Network error. Check your connection and try again.', retryable: true, code: 'AOYMKT-NET' }) }))
    } finally {
      setMarketAdjusting(null)
    }
  }

  const evaluateEntry = async (directionId: number, mode: 'judge' | 'coach' = 'judge', previousEvaluationId?: number) => {
    if (!project) return
    setEvaluating(true)
    setEvaluateError('')
    setEvaluatingForDirectionId(directionId)
    setEvaluatingMode(prev => ({ ...prev, [directionId]: mode }))
    // AOY entries score through the weight-aware jury (evaluate-aoy-entry, S75),
    // mirroring the generateDraft routing. The campaign judge path below is
    // byte-untouched. AOY scoring is judge-only for now (Coach per-section is P5);
    // a Coach click on an AOY entry is short-circuited with a clear message
    // rather than silently returning a Jury score.
    const evalShow = directions.find(d => d.id === directionId)?.best_show ?? ''
    const isAoyDir = isAoyShow(evalShow)
    const isSmartiesDir = isSmartiesShow(evalShow)
    // S98 Chunk 5: a non-AOY weighted/qualitative config show routes to the config
    // jury/coach. null => keep the existing dedicated/generic path.
    const configMode = configModeFor(directionId, evalShow)
    if (isAoyDir && mode === 'coach') {
      // AOY Coach is its OWN advisory function (generate-aoy-coach, S77), not a mode
      // of the calibrated scorer. Hand off; reset the shared jury spinner state so
      // coachAoyEntry owns the coaching spinner.
      setEvaluating(false)
      setEvaluatingForDirectionId(null)
      await coachAoyEntry(directionId)
      return
    }
    // Config Coach (generate-entry-coach-config, S98). Advisory, not a mode of the
    // calibrated scorer. Hand off the same way AOY does; the config coach owns the
    // coaching spinner. Replaces the dedicated SMARTIES coach hand-off (S93): a
    // SMARTIES direction with a resolved qualitative entry_form coaches here.
    if (configMode && mode === 'coach') {
      setEvaluating(false)
      setEvaluatingForDirectionId(null)
      await coachConfigEntry(directionId)
      return
    }
    // Judge routing: AOY -> weight-aware jury (S75); a non-AOY config show -> the
    // config jury (evaluate-entry-config, S98); SMARTIES falls back to its dedicated
    // jury only if entry_form did not resolve; campaign path untouched.
    const evalFnName = isAoyDir
      ? 'evaluate-aoy-entry'
      : configMode
        ? 'evaluate-entry-config'
        : (isSmartiesDir && mode === 'judge')
          ? 'evaluate-smarties-entry'
          : 'evaluate-entry'
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const body: Record<string, unknown> = { project_id: project.id, direction_id: directionId, mode }
      if (previousEvaluationId) body.previous_evaluation_id = previousEvaluationId
      // Build 2 (Session 55): judge mode gets the next-opportunity candidate
      // list (Next Step card). Coach mode is out of scope (resolved decision #5).
      // Feedback round: existing directions also go up so the model never
      // re-suggests a placement the project already has. AOY scoring does not use
      // these campaign-specific placement candidates.
      if (mode === 'judge' && !isAoyDir && !isSmartiesDir && !configMode) {
        const bodyDir = directions.find(d => d.id === directionId)
        body.next_candidates = buildNextCandidates(bodyDir?.best_show ?? '')
        body.existing_directions = directions
          .filter(dd => dd.angle !== 'Uploaded entry — direct evaluation' && dd.best_show)
          .slice(0, 30)
          .map(dd => ({ show: dd.best_show, category: dd.best_category ?? '' }))
      }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${evalFnName}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setEvaluateError(formatError(appErrorFromResponse(data, res.status, 'EVAL')))
        return
      }
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
        const evalDir = directions.find(d => d.id === directionId)
        track('eval_completed', {
          project_id: Number(projectId),
          direction_id: directionId,
          mode: evalMode,
          score_band: scoreBand(newEval.overall_score),
          show: evalDir?.best_show ?? null,
        })
      }
    } catch (err) {
      setEvaluateError(formatError({ message: 'Network error — check your connection and try again.', retryable: true, code: 'EVAL-NET' }))
    } finally {
      setEvaluating(false)
      setEvaluatingForDirectionId(null)
      setEvaluatingMode(prev => { const next = { ...prev }; delete next[directionId]; return next })
    }
  }

  // Opens the Quick Evaluate modal. Uses a two-pass approach:
  // Pass 1 (instant, client-side): scan extracted_text for any known show name.
  // Pass 2 (background, AI): call detect-entry-context for category detection.
  const openQuickEvalModal = async (materialIdx: number) => {
    const material = project?.materials?.[materialIdx]
    // Default the show from the PROJECT context, not document detection (S78 fix):
    // an AOY project defaults to the AOY show; otherwise the first target show.
    // Detection only fills the show when there is NO project default and never
    // silently overrides it (an uploaded entry often names other shows it won).
    // S149 audit fix: this was a two-signal check (entry_type + direction.best_show)
    // that dropped the target_shows signal, so it under-detected AOY the same way
    // the S148 gates did. A project that only names an AOY show in target_shows
    // (no direction yet, Verify Facts not run) read as campaign and defaulted the
    // Quick Eval show wrong. Now the full three-signal projectIsAoy check,
    // recomputed locally from hook state: this handler is declared above
    // projectIsAoy's const (~L5206), so referencing it directly would risk the
    // same TDZ hazard the S148 effects avoid. Local recompute is the safe pattern.
    const isAoyProject =
      (project?.target_shows ?? []).some(isAoyShow) ||
      project?.entry_type === 'aoy' ||
      (directions ?? []).some(d => isAoyShow(d?.best_show ?? ''))
    const projectShow = isAoyProject ? AOY_SHOW_NAME : (project?.target_shows?.[0] || '')
    setQuickEvalMaterialIdx(materialIdx)
    setQuickEvalShow(projectShow)
    setQuickEvalCategory('')
    setQuickEvalError('')
    setQuickEvalDetectedFields({ show: false, category: false, confidence: undefined })
    setQuickEvalSuggestion(null)
    setShowQuickEvalModal(true)

    if (!material || !materialHasText(material)) return
    // Session 52 (P-03): text is fetched on demand (cached by path). The
    // detecting spinner covers the fetch — pass 1 is no longer instant on
    // first open, but the modal itself still opens immediately.
    setQuickEvalDetecting(true)
    const textRes = await fetchMaterialText(material)
    if (!textRes.ok) { setQuickEvalDetecting(false); return }
    const text = textRes.text
    const lowerText = text.toLowerCase()

    // ── PASS 1: instant client-side show name scan ──────────────────────────
    // First try exact canonical match, then fall back to keyword matching so that
    // variants like "Effies APAC", "SPIKES", "Cannes" all resolve to a known show.
    const SHOW_KEYWORD_MAP: Array<[string, string]> = [
      ['cannes', 'Cannes Lions'],
      ['d&ad', 'D&AD'],
      ['spikes asia', 'Spikes Asia'],
      ['spikes', 'Spikes Asia'],
      ['clio', 'Clio Awards'],
      ['one show', 'One Show'],
      ['effie', 'Effie APAC'],
      ['warc', 'WARC Awards'],
      ['dubai lynx', 'Dubai Lynx'],
      ['eurobest', 'Eurobest'],
      ['new york festivals', 'New York Festivals Advertising Awards'],
      ['london international', 'London International Awards'],
      ['campaign big', 'Campaign Big Awards'],
      ['webby', 'Webby Awards'],
      ['shorty', 'Shorty Awards'],
      ['adma', 'ADMA Awards'],
      ['mumbrella', 'Mumbrella Awards'],
      ['adfest', 'ADFEST'],
      ['loeries', 'Loeries'],
      ['loerie', 'Loeries'],
      ['prca apac', 'PRCA APAC Awards'],
      ['prca', 'PRCA UK Awards'],
      ['icco', 'ICCO Global Awards'],
      ['sabre apac', 'SABRE Awards Asia-Pacific'],
      ['sabre asia', 'SABRE Awards Asia-Pacific'],
      ['global sabre', 'Global SABRE Awards'],
      ['sabre', 'SABRE Awards Asia-Pacific'],
      ['gerety', 'Gerety Awards'],
      ['andy awards', 'ANDY Awards'],
      ['caples', 'Caples Awards'],
      ['epica', 'Epica Awards'],
    ]
    const clientShow =
      kbShows.find(s => lowerText.includes(s.toLowerCase())) ??
      (SHOW_KEYWORD_MAP.find(([kw]) => lowerText.includes(kw))?.[1] ?? null)
    if (clientShow && !projectShow) {
      setQuickEvalShow(clientShow)
      setQuickEvalDetectedFields({ show: true, category: false, confidence: 'medium' })
    }

    // ── PASS 2: background AI detection for category ────────────────────────
    try {
      setQuickEvalDetecting(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detect-entry-context`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ text }),
        }
      )
      if (!res.ok) {
        console.warn('detect-entry-context returned', res.status)
        return
      }
      const detected = await res.json()
      console.log('detect-entry-context result:', detected)

      const detectedFields: { show: boolean; category: boolean; confidence?: string } = {
        show: !!clientShow && !projectShow,  // a project default is not a "detection"
        category: false,
        confidence: detected.confidence ?? 'low',
      }

      // Only fill show from detection when there is no project default AND the
      // client-side scan found nothing. The project context wins (S78).
      if (detected.show && !clientShow && !projectShow) {
        setQuickEvalShow(detected.show)
        detectedFields.show = true
      }
      // Campaign AOY: categories are controlled + market-scoped — never accept a
      // free-text category from detection. The picker (rendered when the show is
      // AOY) drives selection; clear any stale category so it cannot proceed
      // unresolved. (detect-entry-context returns category null + aoy:true here.)
      if (detected.aoy || isAoyShow(detected.show ?? quickEvalShow)) {
        setQuickEvalCategory('')
      } else if (detected.category) {
        // Always use AI for category — harder to detect client-side
        setQuickEvalCategory(detected.category)
        detectedFields.category = true
      }

      if (detectedFields.show || detectedFields.category) {
        setQuickEvalDetectedFields(detectedFields as { show: boolean; category: boolean; confidence: string })
      }

    } catch (err) {
      console.warn('detect-entry-context error:', err)
    } finally {
      setQuickEvalDetecting(false)
    }
  }

  // Session 52 — "Suggest for me": recommends the best-fit CATEGORY for the
  // chosen show based on the entry content. Distinct from detection (which
  // reads what the document says it targets) — this answers "what should it
  // target?" for users who don't know. Fills the field only; the user still
  // confirms by clicking Evaluate Entry, because category drives the score.
  const suggestQuickEvalCategory = async () => {
    if (!project || quickEvalMaterialIdx === null) return
    const show = quickEvalShow.trim()
    if (!show) {
      setQuickEvalError('Choose an award show first — the right category depends on the show.')
      return
    }
    setQuickEvalSuggesting(true)
    setQuickEvalError('')
    try {
      const textRes = await fetchMaterialText(project.materials[quickEvalMaterialIdx])
      if (!textRes.ok) {
        // Was a blanket 'please refresh the page', which is false for the
        // failure that actually fires (a missing storage path). Say the true
        // thing per reason.
        setQuickEvalError(materialTextErrorMessage(textRes.reason))
        return
      }
      const text = textRes.text
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detect-entry-context`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            text,
            mode: 'suggest_category',
            show,
            candidate_categories: categoriesForShow(show),
          }),
        }
      )
      if (!res.ok) {
        setQuickEvalError('Suggestion unavailable right now — you can still type a category.')
        return
      }
      const data = await res.json()
      if (data.category) {
        setQuickEvalCategory(data.category)
        setQuickEvalSuggestion({ rationale: data.rationale || '', confidence: data.confidence || 'low' })
        setQuickEvalDetectedFields(prev => ({ ...prev, category: false }))
      } else {
        setQuickEvalError('No clear category match for this entry — please pick from the list or type your own.')
      }
    } catch {
      setQuickEvalError('Suggestion failed — you can still type a category.')
    } finally {
      setQuickEvalSuggesting(false)
    }
  }

  // S82: scroll the just-scored direction into view and flash a ring on it once
  // the entries tab has rendered, then clear the flag. Depends on `entries` so it
  // re-runs after the post-eval refresh actually paints the card.
  useEffect(() => {
    if (tab !== 'entries' || justScoredDirId == null) return
    const el = document.getElementById(`aoy-dir-${justScoredDirId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const t = setTimeout(() => setJustScoredDirId(null), 2600)
    return () => clearTimeout(t)
  }, [tab, justScoredDirId, entries])

  // AOY score-first landing (S106 chunk 2): an AOY project opens on Materials,
  // not Brief. AOY has no brief, and landing there was the lost-time feedback.
  // Fires once after the project loads; campaign projects are never redirected.
  // projectIsAoy is computed in render (after the loading guard), so the AOY
  // signal is recomputed here from loaded state.
  const aoyLandingRedirectedRef = useRef(false)
  useEffect(() => {
    if (aoyLandingRedirectedRef.current || fetching || !project) return
    aoyLandingRedirectedRef.current = true
    const isAoy = (project.target_shows ?? []).some(isAoyShow)
      || project.entry_type === 'aoy'
      || directions.some(d => isAoyShow(d.best_show))
    if (isAoy && tab === 'brief') setTab('materials')
  }, [fetching, project, directions, tab])

  const evaluateUploadedEntry = async () => {
    if (quickEvaluatingRef.current) return
    if (!project || quickEvalMaterialIdx === null || !user) return
    const material = project.materials[quickEvalMaterialIdx]
    if (!material || !materialHasText(material)) return
    // Category optional for shows with no seeded category list (SABRE etc.): their
    // entry_form resolves at show level, so category never affects scoring.
    const categoryOptional = showHasNoCategoryList(quickEvalShow) || showHasNoCategoryConcept(quickEvalShow)
    if (!quickEvalShow.trim()) {
      setQuickEvalError('Please enter an award show.')
      return
    }
    if (!categoryOptional && !quickEvalCategory.trim()) {
      setQuickEvalError('Please enter a category.')
      return
    }

    quickEvaluatingRef.current = true
    setQuickEvaluating(true)
    setQuickEvalError('')

    try {
      // Session 52 (P-03): on-demand text fetch (cache hit — modal open already fetched it)
      const entryTextRes = await fetchMaterialText(material)
      if (!entryTextRes.ok) {
        setQuickEvalError(materialTextErrorMessage(entryTextRes.reason))
        return
      }
      const entryText = entryTextRes.text

      // CALL-SITE GUARD (5 Aug 2026). Both segmentation paths below send
      // material_path to an edge function, and an undefined value is silently
      // omitted from the JSON body. Deliberately NOT a blanket early return:
      // the two branches differ in how much they need it (see each below).
      const materialPath = material.path

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
            name: quickEvalCategory.trim() ? `${quickEvalShow.trim()} — ${quickEvalCategory.trim()}` : quickEvalShow.trim(),
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

      const quickIsAoy = isAoyShow(quickEvalShow.trim())
      const quickIsSmarties = isSmartiesShow(quickEvalShow.trim())
      // S98 Chunk 5: a non-AOY weighted/qualitative config show segments + scores
      // through the config path. Config segmentation writes the Chunk-2 placeholder
      // format that only evaluate-entry-config clamps, so config segmentation MUST
      // pair with the config jury. SMARTIES falls back to its dedicated pair only
      // if entry_form does not resolve.
      const quickForm = quickIsAoy ? null : await resolveEntryFormFor(quickEvalShow.trim(), quickEvalCategory.trim())
      const quickConfigMode = quickForm && (quickForm.scoring_mode === 'weighted' || quickForm.scoring_mode === 'qualitative') ? quickForm.scoring_mode : null

      if (quickIsAoy || quickConfigMode || quickIsSmarties) {
        setQuickEvalPhase('segmenting')
        // Uploaded AOY/config/SMARTIES entry (S78 AOY, S95 SMARTIES, S98 config):
        // these shows score section by section, so a single blob cannot be judged.
        // Map the uploaded document onto the sections server-side (segment-aoy-entry,
        // segment-entry-config, or segment-smarties-entry, all extractive, no
        // fabrication); each writes one entry_drafts row per section. The matching
        // jury then scores those rows. No single 'entry' blob row on this path.
        // Hard requirement on THIS branch: these shows score section by
        // section, so if the document cannot be mapped there is nothing for the
        // jury to read. Fail with a true message rather than send an undefined
        // material_path and let the edge fn return something confusing.
        if (!materialPath) {
          setQuickEvalError('This file is missing its storage reference, so it cannot be mapped to the entry form. Re-upload the file and try again.')
          return
        }
        const segFnName = quickIsAoy ? 'segment-aoy-entry' : quickConfigMode ? 'segment-entry-config' : 'segment-smarties-entry'
        const segRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${segFnName}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ project_id: project.id, direction_id: dir.id, material_path: materialPath }),
          }
        )
        const segData = await segRes.json()
        if (!segRes.ok || segData.error) {
          await supabase.from('directions').delete().eq('id', dir.id)
          setQuickEvalError(segData.error || `Could not map the uploaded entry to the ${quickIsAoy ? 'rubric' : quickConfigMode ? 'entry form' : 'SMARTIES form'} (status ${segRes.status}).`)
          return
        }
        // Refresh entries so the canvas shows the segmented sections.
        const { data: refreshedDrafts } = await supabase.rpc('get_project_entry_drafts', { p_project_id: project.id })
        if (refreshedDrafts) setEntries(refreshedDrafts)
      } else {
        const { data: draft, error: draftErr } = await supabase
          .from('entry_drafts')
          .insert({
            project_id: project.id,
            direction_id: dir.id,
            org_id: currentOrgId,
            created_by: user.id,
            field_key: 'entry',
            field_label: 'Entry',
            version_a: entryText.slice(0, 50000),
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

        // Upload Segmentation P2 (22 Jul 2026): creative-track shows (no AOY /
        // config / SMARTIES routing above) have no structured entry_form, so
        // the blob draft just written renders as one wall-of-text row. Try to
        // segment it into clean sections via the shared segment-entry-generic
        // helper (S162 lesson: ONE function, not a local reimplementation).
        // Best-effort: {segmented:false} or any failure leaves the blob draft
        // exactly as inserted above, and the eval call below is unaffected
        // either way (evaluate-entry assembles whichever rows exist).
        // Best-effort by design, so a missing path SKIPS segmentation rather
        // than blocking the evaluation: the blob draft above is already written
        // and evaluate-entry scores whichever rows exist. Guarding here (rather
        // than at the top of the function) is what keeps a cosmetic defect from
        // becoming a scoring outage.
        const segGenericResult = materialPath
          ? await trySegmentEntryGeneric({
              supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
              anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              accessToken,
              projectId: project.id,
              directionId: dir.id,
              materialPath,
            })
          : { segmented: false }
        if (segGenericResult.segmented) {
          const { data: refreshedDrafts } = await supabase.rpc('get_project_entry_drafts', { p_project_id: project.id })
          if (refreshedDrafts) setEntries(refreshedDrafts)
        }
      }

      // AOY entries score through the weight-aware jury (evaluate-aoy-entry, S75)
      // on the weighted-section rows segment-aoy-entry just wrote. SMARTIES
      // entries score through the qualitative jury (evaluate-smarties-entry, S92)
      // on the fixed-section rows segment-smarties-entry just wrote (S95).
      const quickEvalFnName = quickIsAoy ? 'evaluate-aoy-entry' : quickConfigMode ? 'evaluate-entry-config' : quickIsSmarties ? 'evaluate-smarties-entry' : 'evaluate-entry'
      const quickBody: Record<string, unknown> = { project_id: project.id, direction_id: dir.id }
      if (!quickIsAoy && !quickIsSmarties && !quickConfigMode) {
        // Build 2 (Session 55): quick eval runs judge mode — send candidates
        // so the Next Step card renders (quick eval users need it most),
        // plus existing directions so suggestions never duplicate them.
        // AOY and SMARTIES juries do not accept these params (neither produces
        // next-step suggestions).
        quickBody.next_candidates = buildNextCandidates(quickEvalShow.trim())
        quickBody.existing_directions = directions
          .filter(dd => dd.angle !== 'Uploaded entry — direct evaluation' && dd.best_show)
          .slice(0, 30)
          .map(dd => ({ show: dd.best_show, category: dd.best_category ?? '' }))
      }
      setQuickEvalPhase('scoring')
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${quickEvalFnName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(quickBody),
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
        // Session 54 — quick eval fires BOTH events: quick_eval_used marks the
        // loop pattern (brief_first nudge, Build 3); eval_completed keeps
        // evaluation counting uniform for the Phase 2 wrap.
        track('quick_eval_used', { project_id: Number(projectId), direction_id: dir.id, show: quickEvalShow.trim() })
        track('eval_completed', {
          project_id: Number(projectId),
          direction_id: dir.id,
          mode: evalMode,
          score_band: scoreBand(newEval.overall_score),
          show: quickEvalShow.trim(),
        })
      }

      setShowQuickEvalModal(false)
      setQuickEvalShow('')
      setQuickEvalCategory('')
      setQuickEvalDetecting(false)
      setQuickEvalDetectedFields({ show: false, category: false, confidence: undefined })
      setQuickEvalSuggestion(null)
      setQuickEvalMaterialIdx(null)
      setJustScoredDirId(dir.id)
      setFocusedEntryDirId(dir.id)
      setEntryCardExpanded(prev => ({ ...prev, [dir.id]: true }))
      setTab('entries')

    } catch (err) {
      setQuickEvalError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      quickEvaluatingRef.current = false
      setQuickEvaluating(false)
      setQuickEvalPhase(null)
    }
  }

  const switchVersion = async (fieldId: number, version: 'a' | 'b' | 'c') => {
    await supabase.from('entry_drafts').update({ selected: version }).eq('id', fieldId)
    setEntries(prev => prev.map(e => e.id === fieldId ? { ...e, selected: version } : e))
  }

  // Feature #4 — save inline field edit to entry_drafts.custom_text
  const saveFieldEdit = async (fieldId: number, clear = false) => {
    setSavingFieldEdit(true)
    const trimmed = clear ? null : fieldEditValue.trim() || null
    const { error } = await supabase
      .from('entry_drafts')
      .update({ custom_text: trimmed, updated_at: new Date().toISOString() })
      .eq('id', fieldId)
    if (!error) {
      setEntries(prev => prev.map(e => e.id === fieldId ? { ...e, custom_text: trimmed } : e))
      setEditingFieldId(null)
      setFieldEditValue('')
    }
    setSavingFieldEdit(false)
  }

  // Entry Form v2 (Chunk v2.2): persist one section's structured sub-field
  // values PLUS the composed section text. The composed text goes to custom_text
  // (the row the jury reads, unchanged path); field_values holds the typed data.
  // Hardened against the RLS silent-no-op class (DM-16): checks returned rows,
  // because this is customer entry data where a silent zero-row write matters.
  const saveSectionFields = async (
    rowId: number,
    fieldValues: EntryFieldValues,
    composedText: string
  ): Promise<string | void> => {
    const custom = composedText.trim() || null
    // S151: snapshot this save into linear history. Typed-canvas revision keeps
    // field_values so Restore brings the inputs back, not just the composed text.
    const existingRow = entries.find(e => e.id === rowId)
    const prevRevisions = (existingRow?.revisions ?? []) as ConfigSectionRevision[]
    const nextRevisions: ConfigSectionRevision[] = [
      ...prevRevisions,
      { ts: new Date().toISOString(), source: 'manual', text: composedText.trim(), field_values: fieldValues },
    ]
    const { data, error } = await supabase
      .from('entry_drafts')
      .update({ field_values: fieldValues, custom_text: custom, revisions: nextRevisions, updated_at: new Date().toISOString() })
      .eq('id', rowId)
      .select('id')
    if (error || !data || data.length === 0) {
      return 'Could not save this section. Please try again.'
    }
    setEntries(prev => prev.map(e => e.id === rowId ? { ...e, field_values: fieldValues, custom_text: custom, revisions: nextRevisions } : e))
  }

  // S151: restore a typed-canvas revision. Writes its field_values + composed
  // text back and appends a 'restore' entry (never deletes history). Returns the
  // restored values so ConfigEntryCanvas re-seeds its own boxes for that section
  // (its row-signature re-seed would not fire, field_values presence unchanged).
  const restoreConfigRevision = async (
    rowId: number,
    revisionIndex: number
  ): Promise<{ fieldValues: EntryFieldValues; composedText: string } | null> => {
    const row = entries.find(e => e.id === rowId)
    const revs = (row?.revisions ?? []) as ConfigSectionRevision[]
    const rev = revs[revisionIndex]
    if (!rev) return null
    const restoredValues: EntryFieldValues = rev.field_values ?? {}
    const restoredText: string = rev.text ?? ''
    const custom = restoredText.trim() || null
    const nextRevisions: ConfigSectionRevision[] = [
      ...revs,
      { ts: new Date().toISOString(), source: 'restore', text: restoredText, field_values: restoredValues },
    ]
    const { data, error } = await supabase
      .from('entry_drafts')
      .update({ field_values: restoredValues, custom_text: custom, revisions: nextRevisions, updated_at: new Date().toISOString() })
      .eq('id', rowId)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('config revision restore failed or matched zero rows', error)
      return null
    }
    setEntries(prev => prev.map(e => e.id === rowId ? { ...e, field_values: restoredValues, custom_text: custom, revisions: nextRevisions } : e))
    return { fieldValues: restoredValues, composedText: restoredText }
  }

  // Workbench P2 Chunk 4 (S143) — linear-history write path, AOY-only.
  //
  // Manual save (SectionWorkbench's onSaveText) and restore both go through
  // this one client-side write. Refine-apply's revision entry is appended
  // SERVER-SIDE inside edit-entry.ts (the edge fn branches on entry_type and
  // returns the full updated row for AOY; refineField below already applies
  // whatever it returns via setEntries, so no separate client call is needed
  // for the refine path).
  //
  // DM-16: checks returned rows before mutating local state (same shape as
  // persistDataNeeded below). Never writes version_a/b/c/selected -- AOY
  // display precedence is custom_text > version_a only (brief). Campaign
  // entries never call this function (only SectionWorkbench, which only
  // renders for workbenchPreview && entry_type === 'aoy', wires onSaveText/
  // onRestore to it), so the old version-shift model for campaign entries is
  // untouched by construction, not just by convention.
  const appendRevision = async (
    field: EntryDraft,
    text: string,
    source: SectionRevision['source'],
    instruction?: string
  ): Promise<boolean> => {
    const trimmed = text.trim()
    const revision: SectionRevision = {
      ts: new Date().toISOString(),
      source,
      text: trimmed,
      ...(instruction ? { instruction } : {}),
    }
    const nextRevisions = [...(field.revisions ?? []), revision]
    const { data, error } = await supabase
      .from('entry_drafts')
      .update({ custom_text: trimmed || null, revisions: nextRevisions, updated_at: new Date().toISOString() })
      .eq('id', field.id)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('revision write failed or matched zero rows', error)
      return false
    }
    setEntries(prev => prev.map(e => e.id === field.id ? { ...e, custom_text: trimmed || null, revisions: nextRevisions } : e))
    return true
  }

  // Restore = write that revision's text back to custom_text + append a
  // 'restore' revision. Never deletes history (brief) -- the restored-from
  // entry stays in the array, so the timeline shows exactly what happened.
  const restoreRevision = async (field: EntryDraft, revisionIndex: number): Promise<boolean> => {
    const rev = (field.revisions ?? [])[revisionIndex]
    if (!rev) return false
    return appendRevision(field, rev.text, 'restore')
  }

  // Workbench P3 (S146) — section-level DIRECTIONAL re-score. Calls the new
  // evaluate-aoy-section edge fn (Opus, byte-copies the frozen scorer's prompt) to
  // re-check ONE section's current text. The result NEVER overwrites the official
  // evaluation; it is held in sectionRescores (and persisted server-side in
  // evaluations.section_rescores) and always shown as directional. Requires an
  // existing judge evaluation (evaluationId); the caller only wires this when one
  // exists. Same fetch shape as evaluateEntry.
  const recheckSection = async (dirId: number, evaluationId: number | undefined, field: EntryDraft) => {
    if (!project || !evaluationId) return
    const stateKey = `${dirId}:${field.field_key}`
    setRecheckingSection(prev => ({ ...prev, [stateKey]: true }))
    setRescoreError(prev => { const next = { ...prev }; delete next[stateKey]; return next })
    try {
      const accessToken = await getToken()
      if (!accessToken) return
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-aoy-section`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ project_id: project.id, direction_id: dirId, evaluation_id: evaluationId, section_key: field.field_key }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setRescoreError(prev => ({ ...prev, [stateKey]: formatError(appErrorFromResponse(data, res.status, 'AOYSECTION')) }))
        return
      }
      if (typeof data.score === 'number') {
        const rescore: SectionRescore = {
          score: data.score,
          rationale: typeof data.rationale === 'string' ? data.rationale : '',
          at: typeof data.at === 'string' ? data.at : new Date().toISOString(),
          text_hash: typeof data.text_hash === 'string' ? data.text_hash : '',
        }
        setSectionRescores(prev => ({
          ...prev,
          [dirId]: { ...(prev[dirId] ?? {}), [field.field_key]: rescore },
        }))
      }
    } catch {
      setRescoreError(prev => ({ ...prev, [stateKey]: 'Network error. Please try again.' }))
    } finally {
      setRecheckingSection(prev => ({ ...prev, [stateKey]: false }))
    }
  }

  // Workbench P2 Chunk 3 (S138 continued) — data-needed writes.
  //
  // All four handlers below share one persistence primitive so the DM-16
  // check (never trust a silent zero-row write) lives in exactly one place.
  // Checking an item off, adding one, scanning, or tracking a gap never
  // triggers or blocks on an eval -- that decoupling from evaluation cadence
  // is the whole point of the checklist (brief, Chunk 3).
  const persistDataNeeded = async (fieldId: number, next: DataNeededItem[]): Promise<boolean> => {
    const { data, error } = await supabase
      .from('entry_drafts')
      .update({ data_needed: next, updated_at: new Date().toISOString() })
      .eq('id', fieldId)
      .select('id')
    if (error || !data || data.length === 0) {
      console.error('data_needed write failed or matched zero rows', error)
      return false
    }
    setEntries(prev => prev.map(e => e.id === fieldId ? { ...e, data_needed: next } : e))
    return true
  }

  const makeDataNeededId = (): string =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `dn-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // "Scan for data requests": runs the pure parser over the section's current
  // text and merges (never silently deletes a user-checked item; a re-scan
  // only appends genuinely new asks, diffed by normalized text -- see
  // mergeScannedItems in lib/data-needed.ts). Only writes to the DB when the
  // merge actually changed something, so re-scanning a section with nothing
  // new never fires a write.
  const scanSectionData = async (field: EntryDraft) => {
    setScanningData(prev => ({ ...prev, [field.id]: true }))
    try {
      const text = resolveFieldContent(field)
      const parsed = parseDataRequests(text)
      const existing = field.data_needed ?? []
      const merged = mergeScannedItems(existing, parsed, makeDataNeededId)
      if (merged !== existing) {
        await persistDataNeeded(field.id, merged)
      }
    } finally {
      setScanningData(prev => ({ ...prev, [field.id]: false }))
    }
  }

  const addDataNeededItem = async (field: EntryDraft, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const existing = field.data_needed ?? []
    const item: DataNeededItem = { id: makeDataNeededId(), text: trimmed, owner: null, done: false, source: 'manual' }
    await persistDataNeeded(field.id, [...existing, item])
  }

  const toggleDataNeededItem = async (field: EntryDraft, id: string, done: boolean) => {
    const existing = field.data_needed ?? []
    const next = existing.map(i => i.id === id ? { ...i, done } : i)
    await persistDataNeeded(field.id, next)
  }

  // "Track this" on a jury gap: promotes an entry-level gap string into a
  // section-tied, ownable checklist item (source: 'jury'). Dedupes against
  // whatever is already tracked by normalized text so re-tracking the same
  // gap (or a re-render re-firing the click) is a no-op, matching the parser
  // scan's own de-dup discipline.
  const trackGapAsDataNeeded = async (field: EntryDraft, gapText: string) => {
    const existing = field.data_needed ?? []
    const key = normalizeRequestText(gapText)
    if (existing.some(i => normalizeRequestText(i.text) === key)) return
    const item: DataNeededItem = { id: makeDataNeededId(), text: gapText, owner: null, done: false, source: 'jury' }
    await persistDataNeeded(field.id, [...existing, item])
  }

  // Auto-scan once per section with no tracked items yet (brief: "once on
  // first workbench render for a section with no items"). Gated on the
  // workbench flag + AOY so this never fires for the legacy canvas. Guarded
  // by the autoScannedFieldIds ref (not state) so re-renders triggered by
  // scanning one section, or by an unrelated toggle write updating `entries`,
  // never re-trigger a scan for a field already covered this session.
  //
  // S148 fix: this used to gate on the raw project?.entry_type column, which
  // under-detects AOY the same way wbActive did (entry_type is only ever set
  // by the separate "Verify Facts" step). This effect is declared BEFORE the
  // component's early-return guards and before projectIsAoy is const'd
  // further down the render (~L5188), so it cannot reference projectIsAoy
  // directly — a render that returns early before that line would leave this
  // closure's projectIsAoy binding in the temporal dead zone, throwing if
  // React ever invoked it. Recomputing the same OR-of-three-signals check
  // locally from hook state (project, directions) avoids that hazard, same
  // as the AOY-landing-redirect effect above (~L4319).
  useEffect(() => {
    if (!workbenchPreview || !project) return
    const isAoyForScan =
      (project.target_shows ?? []).some(isAoyShow) ||
      project.entry_type === 'aoy' ||
      directions.some(d => isAoyShow(d.best_show))
    if (!isAoyForScan) return
    const candidates = entries.filter(e =>
      e.field_key !== 'entry' &&
      (e.data_needed?.length ?? 0) === 0 &&
      !autoScannedFieldIds.current.has(e.id)
    )
    for (const field of candidates) {
      autoScannedFieldIds.current.add(field.id)
      void scanSectionData(field)
    }
    // entries is intentionally not deep-compared: the ref guard above makes
    // extra effect firings a cheap no-op rather than a correctness issue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbenchPreview, project, directions, entries])

  const refineField = async (field: EntryDraft, dirId: number) => {
    const msg = refineMessage[field.id]?.trim()
    if (!msg || !project) return

    setRefiningFieldId(field.id)
    setRefineBarFieldId(field.id)
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

  // Workbench P4 (S147) — SectionWorkbench chatSlot: Discuss (writes nothing,
  // conversational) and Apply (the existing refine, now routed through the
  // same edit-entry call with mode:'apply'). One thread per section: both
  // modes read/write field.chat_history, never version_a/b/c/custom_text for
  // discuss. The busy/error state here is separate from refineField's (that
  // function still serves the legacy non-workbench per-field chat below,
  // gated !wbActive so the two write surfaces never render for the same
  // field at once).
  const sendSectionChat = async (
    field: EntryDraft,
    dirId: number,
    message: string,
    mode: 'discuss' | 'apply'
  ) => {
    if (!project) return
    setChatBusyField({ id: field.id, mode })
    setChatErrors(prev => { const next = { ...prev }; delete next[field.id]; return next })
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
            message,
            mode,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setChatErrors(prev => ({ ...prev, [field.id]: formatError(appErrorFromResponse(data, res.status, 'EDIT')) }))
        return
      }
      if (mode === 'apply' && data.updated_draft) {
        setEntries(prev => prev.map(e => e.id === field.id ? data.updated_draft : e))
      } else if (mode === 'discuss' && Array.isArray(data.chat_history)) {
        setEntries(prev => prev.map(e => e.id === field.id ? { ...e, chat_history: data.chat_history } : e))
      }
    } catch (err) {
      setChatErrors(prev => ({ ...prev, [field.id]: err instanceof Error ? err.message : 'Network error.' }))
    } finally {
      setChatBusyField(null)
    }
  }

  // Send a message to the evaluation chat for a given direction
  const sendEvalChat = async (dirId: number) => {
    // Session 57: 'nextsteps' is a view, not a mode — chat targets judge then
    const viewSel = evalDisplayMode[dirId] ?? 'judge'
    const activeMode: 'judge' | 'coach' = viewSel === 'coach' ? 'coach' : 'judge'
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

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  const formatBytes = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  // availableCategories moved into VideoScriptTab (R2).

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

  // ── AOY vs Campaign: ONE project-level decision, made up front ─────────────
  // A project is an AOY entry if it TARGETS Campaign Asia Agency of the Year
  // (chosen at creation / Edit shows), or has already been flagged AOY
  // (entry_type, set by /api/agency-facts), or already holds an AOY direction.
  // Everything that is AOY-only AT THE PROJECT LEVEL — the Add AOY entry / Plan
  // AOY entries buttons, the agency-facts validator — gates on this, so a pure
  // campaign project shows the plain campaign interface and never the AOY tools
  // (they were rendering unconditionally and crowding campaign projects, S91).
  // Per-direction AOY controls stay gated on isAoyShow(d.best_show) so a MIXED
  // project still shows the right buttons on each card.
  const projectIsAoy =
    (project.target_shows ?? []).some(isAoyShow) ||
    project.entry_type === 'aoy' ||
    directions.some(d => isAoyShow(d.best_show))

  // AOY flow redesign, chunk 7 (2026-07-04): which AOY pillars this project's
  // directions actually touch. A project can be mixed (e.g. one Agency
  // direction + one People direction), so this is a SET, not a single value.
  // Agency stays on the existing AgencyFactsValidator/projects.agency_facts
  // path untouched; People/Brand render PillarFactsValidator instead. When no
  // AOY direction exists yet (fresh project, Materials not done), default to
  // showing Agency -- the common case and the pre-chunk-7 behavior, so a
  // project with no pillar decided yet is not silently blank.
  const projectAoyPillars: Set<AoyPillar> = new Set(
    directions
      .filter(d => isAoyShow(d.best_show))
      .map(d => pillarForKey(normalizeAoyCategory(d.best_category)))
  )
  const showAgencyFacts = projectAoyPillars.size === 0 || projectAoyPillars.has('agency')
  const showPeopleFacts = projectAoyPillars.has('people')
  const showBrandFacts = projectAoyPillars.has('brand')

  // Session 55: the TABS const + tab strip were REMOVED — the spine and the
  // strip read as near-duplicate rows (Ben). The Progress Spine is now the
  // workspace's ONLY navigation row (it always was fully clickable; draft and
  // evaluated steps route to the Entries tab). Do not reintroduce a second
  // tab row; if a named "Entries" destination is ever needed again, rename a
  // spine step instead.

  // ── Session 54 (Build 1) — Project Progress Spine ──────────────────────────
  // Derived ENTIRELY from data the page already loads under the Session 52
  // payload diet (slim project, materials meta, drafts RPC, slim evaluations,
  // mount-time press_kit_drafts fetch). Zero new queries — keep it that way.
  const spineMaxDraftGen = entries.length > 0
    ? Math.max(...entries.map(e => e.draft_generation ?? 1))
    : 0
  const spineJudgeScores: number[] = []
  for (const slot of Object.values(evaluations)) {
    const s = slot.judge?.overall_score
    if (s !== undefined && s !== null && !Number.isNaN(Number(s))) spineJudgeScores.push(Number(s))
  }
  const spineHasEval = Object.keys(evaluations).length > 0
  const spineBestJudge = spineJudgeScores.length > 0 ? Math.max(...spineJudgeScores) : null
  const spinePressKitStarted = pressKitStarted
  const spineScriptDone = scriptStarted || !!project.script_text

  // AOY spine (S106 redesign, chunk 1): score-first, mode-aware, gated on
  // projectIsAoy. The campaign spine below is byte-unchanged. AOY has no Brief
  // step: its inputs are agency facts, not a campaign brief, and starting an
  // AOY user on Brief was the source of the lost-time feedback. Order:
  // Materials, Jury Read, Verify Facts, Directions, Refine, Video Script,
  // Press Kit. Endorsements (target step 6) arrives with its checklist in
  // chunk 6. Two steps share one view (the S54/S55 draft+evaluated to Entries
  // precedent): Jury Read and Refine route to Entries. Verify Facts has its
  // own view since chunk 3 (AgencyFactsValidator moved out of the Directions
  // tab into the 'facts' tab below; never gates the Jury Read score). The
  // score-first landing (default tab) and category-before-read are chunk 2.
  const spineHasJudge = Object.values(evaluations).some(s => !!s.judge)
  const spineHasCoach = Object.values(evaluations).some(s => !!s.coach)
  // Chunk 7: facts-done now accounts for People/Brand too, so the spine step
  // does not stay perpetually undone on a project with no Agency direction.
  // Non-blocking either way (spec's own rule, unchanged): this only marks the
  // step, it never gates Jury Read.
  // S149 audit: the `entry_type === 'aoy'` here is DELIBERATELY the raw column,
  // NOT projectIsAoy. This marks the "Verify Facts" spine step done; both
  // agency_facts and entry_type='aoy' are written together by /api/agency-facts
  // (the Verify Facts route), so the column correctly means "did that step run."
  // Widening this to the three-signal check would show the step done on every
  // AOY project before the user ever validated facts. Leave as-is.
  const spineFactsDone =
    !!project.agency_facts || project.entry_type === 'aoy' ||
    (showPeopleFacts && pillarFactsSaved.has('people')) ||
    (showBrandFacts && pillarFactsSaved.has('brand'))
  // AOY chunk 6: endorsements is a hygiene checklist, never a scoring input.
  // Done when every fixed item (EndorsementsChecklist) is checked.
  const spineEndorsementsChecklist: Record<string, boolean> = project.endorsements_checklist || {}
  const spineEndorsementsDone = ENDORSEMENT_ITEMS.every(i => !!spineEndorsementsChecklist[i.key])
  // Materials step is done when a draft is uploaded AND a category is set
  // (an AOY direction carries best_category), per the score-first flow (spec 4).
  const spineAoyCategorySet = directions.some(d => (d.best_category ?? '').trim() !== '')

  // AOY step key -> existing Tab view. Shared keys map to themselves.
  const AOY_STEP_TO_TAB: Record<string, Tab> = {
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
    { key: 'materials', label: 'Materials', done: (project.materials?.length ?? 0) > 0 && spineAoyCategorySet,
      summary: project.materials?.length ? String(project.materials.length) : undefined },
    { key: 'jury', label: 'Jury', done: spineHasJudge,
      summary: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    { key: 'facts', label: 'Facts', done: spineFactsDone },
    { key: 'directions', label: 'Categories', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    // Arc v2 B2 (decision 4): Angles sits peer-level beside the recommender so
    // a user can enter either first. It is a ROUTE, not a tab (see
    // handleSpineStepClick); the spine WRAPS on mobile by design, so this
    // entry cannot reproduce the draft-tab-row overflow.
    { key: 'angles', label: 'Angles', done: angleCount > 0,
      summary: angleCount > 0 ? String(angleCount) : undefined },
    { key: 'refine', label: 'Refine', done: spineHasCoach },
    { key: 'endorsements', label: 'Endorsements', done: spineEndorsementsDone },
    { key: 'script', label: 'Script', done: spineScriptDone },
    { key: 'presskit', label: 'Press Kit', done: spinePressKitStarted },
  ]

  const campaignSpineSteps: SpineStep[] = [
    { key: 'brief', label: 'Brief', done: !!((project.combined_text || briefText || '').trim()) },
    { key: 'materials', label: 'Materials', done: (project.materials?.length ?? 0) > 0,
      summary: project.materials?.length ? String(project.materials.length) : undefined },
    { key: 'directions', label: 'Categories', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    // Arc v2 B2 (decision 4): peer-level Angles entry — a route, not a tab.
    { key: 'angles', label: 'Angles', done: angleCount > 0,
      summary: angleCount > 0 ? String(angleCount) : undefined },
    // B2.2 (19 Aug 2026, Ben): Draft and Evaluated merged into one chip.
    // Both keys navigated to the same 'entries' tab already (see
    // handleSpineStepClick below), so nothing is lost as navigation or as
    // status. Done-state stays "a draft exists"; the score badge is
    // additive and uses the exact same guard the old Evaluated step's
    // summary used (spineBestJudge !== null), so it appears only once a
    // judge-mode evaluation exists.
    { key: 'draft', label: 'Draft', done: entries.length > 0,
      summary: spineMaxDraftGen > 0 ? `Gen ${spineMaxDraftGen}` : undefined,
      summary2: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    // Session 57 (Ben): Press Kit is the LAST step — the script crystalises
    // the story first; the press kit announces the finished entry.
    { key: 'script', label: 'Script', done: spineScriptDone },
    { key: 'presskit', label: 'Press Kit', done: spinePressKitStarted },
  ]

  const spineSteps: SpineStep[] = projectIsAoy ? aoySpineSteps : campaignSpineSteps

  // Which spine step highlights for the current tab. AOY shares views across
  // steps (Jury Read + Refine -> Entries; Verify Facts + Directions ->
  // Directions), so the primary step per tab wins; a tab with no AOY step
  // (e.g. the default 'brief', retired for AOY and redirected in chunk 2)
  // falls back to Materials, the AOY entry point.
  const spineActiveKey = projectIsAoy
    ? (tab === 'entries' ? 'jury'
        : tab === 'directions' ? 'directions'
        : (tab === 'materials' || tab === 'facts' || tab === 'endorsements' || tab === 'script' || tab === 'presskit') ? tab
        : 'materials')
    : (tab === 'entries' ? 'draft' : tab)

  const handleSpineStepClick = (step: SpineStep) => {
    // Arc v2 B2: Angles lives on its own route (/projects/[id]/angles), never
    // as a tab on this page.
    if (step.key === 'angles') {
      track('spine_step_clicked', { project_id: Number(projectId), step: step.key, was_empty: !step.done })
      router.push(`/projects/${projectId}/angles`)
      return
    }
    const target: Tab = projectIsAoy
      ? (AOY_STEP_TO_TAB[step.key] ?? 'materials')
      : (step.key === 'draft' ? 'entries' : (step.key as Tab))
    track('spine_step_clicked', { project_id: Number(projectId), step: step.key, was_empty: !step.done })
    setTab(target)
  }

  // effectiveCategoryLabel moved into VideoScriptTab (R2) — computed locally there from its own scriptCategory/customScriptCategory state.

  // Shows strip — target shows reference bar shown at the top of Directions, Entries, and Video Script tabs
  const showsStrip = (
    <div className="mb-5 pb-4 border-b border-gray-200">
      {!editingShowsInline ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 flex-shrink-0">Targeting:</span>
          {targetShows.length > 0
            ? targetShows.map(show => (
                <span key={show} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">{show}</span>
              ))
            : <span className="text-xs text-gray-400 italic">No shows set yet</span>
          }
          <button
            onClick={() => setEditingShowsInline(true)}
            className="text-xs text-gray-400 hover:text-green-700 transition-colors ml-auto flex-shrink-0">
            Edit shows
          </button>
        </div>
      ) : (
        <div>
          {/* Selected shows as removable chips */}
          {targetShows.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {targetShows.map(show => (
                <button key={show} onClick={() => toggleShow(show)}
                  className="flex items-center gap-1.5 text-xs bg-green-100 text-green-800 border border-green-300 px-3 py-1.5 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors">
                  {show} <span>×</span>
                </button>
              ))}
            </div>
          )}
          {/* Show picker */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <p className="text-xs text-gray-400 mb-3">Select from the list:</p>
            <div className="flex flex-wrap gap-2">
              {kbShows.map(show => {
                const selected = targetShows.includes(show)
                const isDynamic = dynamicShowNames.has(show)
                return (
                  <button key={show} onClick={() => toggleShow(show)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-gray-100 text-gray-500 border-gray-300 hover:border-green-600 hover:text-green-700'
                    }`}>
                    {show}{isDynamic && <span className="ml-1 text-green-600" title="Recently added">✦</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveShows} disabled={savingShows}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
              {savingShows ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditingShowsInline(false); setTargetShows(project.target_shows || []) }}
              className="text-gray-500 hover:text-gray-900 text-sm px-4 py-2 transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 overflow-x-hidden">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white py-3 sm:py-4">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">

          {/* ── Mobile layout: two rows ─────────────────────────────────────── */}
          <div className="sm:hidden">
            {/* Row 1: back link + status badge */}
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
            {/* Row 2: project name */}
            <div className="min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={nameEditValue}
                    onChange={e => setNameEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameProject()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    onBlur={handleRenameProject}
                    disabled={savingName}
                    className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent min-w-0 w-full disabled:opacity-50"
                  />
                  {savingName && (
                    <svg className="animate-spin h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setNameEditValue(project.campaign_name); setEditingName(true) }}
                  className="group flex items-center gap-1.5 text-left min-w-0 w-full"
                  title="Click to rename"
                >
                  <h1 className="sl-serif text-gray-900 leading-tight truncate" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{project.campaign_name}</h1>
                  <span className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 text-xs">✎</span>
                </button>
              )}
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
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={nameEditValue}
                      onChange={e => setNameEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameProject()
                        if (e.key === 'Escape') setEditingName(false)
                      }}
                      onBlur={handleRenameProject}
                      disabled={savingName}
                      className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent min-w-0 w-64 disabled:opacity-50"
                    />
                    {savingName && (
                      <svg className="animate-spin h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameEditValue(project.campaign_name); setEditingName(true) }}
                    className="group flex items-center gap-1.5 text-left min-w-0"
                    title="Click to rename"
                  >
                    <h1 className="sl-serif text-gray-900 leading-tight truncate" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{project.campaign_name}</h1>
                    <span className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 text-xs">✎</span>
                  </button>
                )}
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

      {/* Session 54 — Project Progress Spine: workflow state, always on
          (navigation, not guidance — does NOT respect the guidance toggle).
          Session 55: the spine is now the workspace's ONLY navigation row —
          the old tab strip was removed as a near-duplicate (Ben). */}
      <ProjectProgressSpine steps={spineSteps} activeKey={spineActiveKey} onStepClick={handleSpineStepClick} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ── BRIEF ── */}
        {tab === 'brief' && (
          <>
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
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mb-5">
                    <button
                      onClick={() => setBriefMode('guided')}
                      className={`px-4 py-2 text-sm font-medium rounded transition-colors ${briefMode === 'guided' ? 'bg-green-800 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                      ✦ Guided
                    </button>
                    <button
                      onClick={() => setBriefMode('freeform')}
                      className={`px-4 py-2 text-sm font-medium rounded transition-colors ${briefMode === 'freeform' ? 'bg-green-800 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                      Freeform
                    </button>
                  </div>

                  {briefMode === 'guided' ? (
                    <div className="space-y-4">
                      {([
                        { key: 'idea',       label: 'The idea & insight',       placeholder: 'What was the core campaign idea? What human insight or tension did it tap into?' },
                        { key: 'execution',  label: 'How it was executed',      placeholder: 'How was the idea brought to life? What channels, formats, or activations were used?' },
                        { key: 'results',    label: 'Results & impact',         placeholder: 'What were the measurable outcomes? Include key metrics — reach, sales, engagement, awards, etc.' },
                        { key: 'intentions', label: 'Why you\'re entering',     placeholder: 'Which aspects are strongest? What should the AI focus on when evaluating and writing your entries?' },
                      ] as const).map(({ key, label, placeholder }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
                          <textarea
                            value={briefSections[key]}
                            onChange={e => setBriefSections(s => ({ ...s, [key]: e.target.value }))}
                            rows={3}
                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none text-sm leading-relaxed"
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <textarea value={briefText} onChange={e => setBriefText(e.target.value)} rows={10}
                      className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none text-sm leading-relaxed"
                      placeholder={`Campaign: [Name of campaign]\nClient: [Client name]\nWhat it was: [Short description of what the campaign did]\nResults: [Key metrics — reach, sales, engagement, etc.]\nWhy you're entering: [Which aspects do you think are strongest? What do you want the AI to focus on when evaluating and drafting?]`} />
                  )}

                  <div className="flex gap-3 mt-3">
                    <button onClick={saveBrief} disabled={savingBrief}
                      className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
                      {savingBrief ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setBriefEdit(false); setBriefText(project.combined_text || ''); setBriefSections({ idea: '', execution: '', results: '', intentions: '' }) }}
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
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <button
                    onClick={() => { setShowsDrawerTab('calendar'); setShowsDrawerOpen(true) }}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >📅 Calendar</button>
                  <button
                    onClick={() => { setShowsDrawerTab('budget'); setShowsDrawerOpen(true) }}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >💰 Budget</button>
                  {!editingShows && (
                    <button onClick={() => setEditingShows(true)} className="text-xs text-green-700 hover:text-green-600 transition-colors">Edit</button>
                  )}
                </div>
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
                        const isDynamic = dynamicShowNames.has(show)
                        return (
                          <button key={show} onClick={() => toggleShow(show)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : 'bg-gray-100 text-gray-500 border-gray-300 hover:border-green-600 hover:text-green-700'
                            }`}>
                            {show}{isDynamic && <span className="ml-1 text-green-600" title="Recently added">✦</span>}
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
                      className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
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

            {/* Shows changed warning */}
            {showsChangedWarning && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4">
                <span className="text-amber-500 text-base mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm text-amber-800 font-medium">Target shows updated</p>
                  <p className="text-xs text-amber-700 mt-0.5">Your existing directions still reference the previous shows. Go to the Directions tab and regenerate to align them with your new selection.</p>
                </div>
                <button onClick={() => setShowsChangedWarning(false)} className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0">×</button>
              </div>
            )}

          </div>

          {/* ── Credits & Collaborators ─────────────────────────────────────── */}
          <div className="max-w-2xl mt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Credits &amp; Collaborators</h2>
                <p className="text-xs text-gray-400 mt-0.5">All parties credited on this entry — agency partners, production companies, brand team, etc. Used in press kit and entry credit generation.</p>
              </div>
              {!addCollabOpen && (
                <button
                  onClick={() => { setAddCollabOpen(true); setCollabError('') }}
                  className="text-xs text-green-700 hover:text-green-600 transition-colors flex-shrink-0 ml-4"
                >
                  + Add
                </button>
              )}
            </div>

            {/* Existing collaborators */}
            {collaborators.length > 0 && (
              <div className="space-y-2 mb-4">
                {collaborators.map(c => (
                  <div key={c.id} className="flex items-start justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5">
                        {COLLAB_TYPE_LABELS[c.collaborator_type]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {c.collaborator_name}
                          {c.is_lead_credit && <span className="ml-2 text-xs text-green-700 font-normal">Lead credit</span>}
                        </p>
                        {(c.contact_name || c.contact_email) && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {[c.contact_name, c.contact_email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCollaborator(c.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add collaborator form */}
            {addCollabOpen && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Organisation name *</label>
                    <input
                      type="text"
                      value={newCollab.collaborator_name}
                      onChange={e => setNewCollab(n => ({ ...n, collaborator_name: e.target.value }))}
                      placeholder="e.g. Ogilvy Bangkok, MJZ, Edelman"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select
                      value={newCollab.collaborator_type}
                      onChange={e => setNewCollab(n => ({ ...n, collaborator_type: e.target.value as CollabType }))}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors appearance-none"
                    >
                      {(Object.entries(COLLAB_TYPE_LABELS) as [CollabType, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Contact name</label>
                    <input
                      type="text"
                      value={newCollab.contact_name}
                      onChange={e => setNewCollab(n => ({ ...n, contact_name: e.target.value }))}
                      placeholder="Jane Smith"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Contact email</label>
                    <input
                      type="email"
                      value={newCollab.contact_email}
                      onChange={e => setNewCollab(n => ({ ...n, contact_email: e.target.value }))}
                      placeholder="jane@agency.com"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Website (optional)</label>
                    <input
                      type="url"
                      value={newCollab.website_url}
                      onChange={e => setNewCollab(n => ({ ...n, website_url: e.target.value }))}
                      placeholder="https://www.agency.com"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="lead-credit"
                      checked={newCollab.is_lead_credit}
                      onChange={e => setNewCollab(n => ({ ...n, is_lead_credit: e.target.checked }))}
                      className="w-4 h-4 accent-green-700"
                    />
                    <label htmlFor="lead-credit" className="text-xs text-gray-600 cursor-pointer">
                      Lead credit (first in entry credits list)
                    </label>
                  </div>
                </div>
                {collabError && <p className="text-xs text-red-600">{collabError}</p>}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleAddCollaborator}
                    disabled={savingCollab || !newCollab.collaborator_name.trim()}
                    className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
                  >
                    {savingCollab ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setAddCollabOpen(false); setCollabError('') }}
                    className="text-gray-500 hover:text-gray-900 text-sm px-4 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {collaborators.length === 0 && !addCollabOpen && (
              <p className="text-xs text-gray-400">No collaborators added. Use this to track all co-credited parties for entry submissions and press kit generation.</p>
            )}
          </div>
          </>
        )}

        {/* ── MATERIALS ── */}
        {tab === 'materials' && (
          <div className="max-w-2xl">
            <p className="text-sm text-gray-500 mb-5">
              {projectIsAoy
                ? 'Upload your draft entry: a case study, results deck, or agency write-up. Pick your category, then get a jury read on it. Agency facts are pulled from the draft in the background.'
                : 'Upload supporting files — case studies, results decks, campaign documents. Text and chart data will be extracted and used when generating entry drafts.'}
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
                          {materialHasText(m) ? <span className="text-xs text-green-700">✓ text extracted</span> : m.type === 'pdf' ? <span className="text-xs text-gray-400">image-only PDF</span> : null}
                          {m.chart_image_paths && m.chart_image_paths.length > 0 && (
                            <span className="text-xs text-green-700">+ {m.chart_image_paths.length} chart{m.chart_image_paths.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {materialHasText(m) && (
                          <button
                            onClick={() => openQuickEvalModal(i)}
                            className="bg-green-800 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
                          >
                            {projectIsAoy ? 'Get jury read' : 'Evaluate as Entry'}
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

        {/* ── VERIFY FACTS ── */}
        {tab === 'facts' && (
          <div>
            {/* AOY chunk 3 (S107 cont.): Verify Facts is its own non-blocking
                step, moved out of the Directions tab. It never gates the Jury
                Read score (evaluateUploadedEntry never reads agency_facts) —
                it gates regeneration (generate-aoy-draft) and, from chunk 4,
                Directions. */}
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-700">Verify Facts</h2>
              <p className="text-gray-400 text-xs mt-0.5">Sanity-check the figures extracted from your entry. Confirming them sharpens Directions and any redraft — it does not affect the jury score you already have.</p>
            </div>
            {/* AOY chunk 7 (2026-07-04): render one validator per pillar the
                project's directions actually touch (a mixed project can show
                more than one). Agency keeps its existing org-propagated path
                untouched; People/Brand are per-project only, saved via the
                new /api/pillar-facts route -- see projectAoyPillars above. */}
            {projectIsAoy && showAgencyFacts && (
              <AgencyFactsValidator
                projectId={project.id}
                getToken={getToken}
                onPropagated={() => setProject(p => (p ? { ...p, entry_type: 'aoy' } : p))}
              />
            )}
            {projectIsAoy && showPeopleFacts && (
              <div className={showAgencyFacts ? 'mt-4' : ''}>
                <PillarFactsValidator
                  projectId={project.id}
                  pillar="people"
                  getToken={getToken}
                  onSaved={() => setPillarFactsSaved(prev => new Set(Array.from(prev)).add('people'))}
                />
              </div>
            )}
            {projectIsAoy && showBrandFacts && (
              <div className={(showAgencyFacts || showPeopleFacts) ? 'mt-4' : ''}>
                <PillarFactsValidator
                  projectId={project.id}
                  pillar="brand"
                  getToken={getToken}
                  onSaved={() => setPillarFactsSaved(prev => new Set(Array.from(prev)).add('brand'))}
                />
              </div>
            )}
          </div>
        )}

        {/* ── ENDORSEMENTS ── */}
        {tab === 'endorsements' && (
          <div>
            {/* AOY chunk 6 (2026-07-04): CEO/CFO sign-off readiness. Hygiene
                callout only -- never lowers the score. The AOY seed's
                endorsement gate row stays weight:null and excluded from the
                budget meter (S74); this step is presentation of readiness,
                not a scoring change. */}
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-700">Endorsements</h2>
              <p className="text-gray-400 text-xs mt-0.5">Sign-off readiness for submission. This never changes your jury score.</p>
            </div>
            {projectIsAoy && (
              <EndorsementsChecklist
                checklist={project.endorsements_checklist || {}}
                onToggle={toggleEndorsementItem}
                saving={savingEndorsement}
              />
            )}
          </div>
        )}

        {/* ── DIRECTIONS ── */}
        {tab === 'directions' && (
          <div>
            {showsStrip}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-700">Category Recommender <span className="font-normal text-gray-400">(formerly Directions)</span></h2>
                <p className="text-gray-400 text-xs mt-0.5">{projectIsAoy
                  ? 'Category-fit recommendations and market-scoped positioning, sharpest once your facts are confirmed.'
                  : 'AI-recommended show and category combinations. Generate a draft from any direction, then evaluate it.'}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* AOY-only project tools — shown ONLY for an AOY project (see
                    projectIsAoy). A campaign project gets the plain interface. */}
                {projectIsAoy && (
                  <>
                    {/* Session 72 — manual controlled entry for Campaign AOY (market-scoped) */}
                    <button onClick={() => { setDcAoyCategory(''); setAoyDirError(''); setShowAoyDirModal(true) }}
                      className="border border-green-700 text-green-800 hover:bg-green-50 text-sm font-medium px-4 py-2 rounded transition-colors">
                      Add AOY entry
                    </button>
                    {/* Session 77 — AOY entry-slate strategy (where should we enter).
                        AOY chunk 4 (S107 cont.): this is Directions' Next-Step-card
                        analog, so once facts are confirmed it becomes the primary
                        (solid) action instead of the AI-generate button; before
                        that it stays secondary and the nudge below points at
                        Verify Facts. Non-blocking either way — the recommender
                        runs on whatever evidence exists (spec §3/§8). */}
                    <button onClick={() => { setStrategySeed(''); setStrategyError(''); setShowStrategyModal(true) }}
                      className={spineFactsDone
                        ? "bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
                        : "border border-green-700 text-green-800 hover:bg-green-50 text-sm font-medium px-4 py-2 rounded transition-colors"}>
                      Plan AOY entries
                    </button>
                  </>
                )}
                <button onClick={() => generateDirections()} disabled={generating || (!project.combined_text && !(project.materials || []).some(materialHasText))}
                  title={(!project.combined_text && !(project.materials || []).some(materialHasText)) ? 'Add a brief or upload materials first' : ''}
                  className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors flex items-center gap-2">
                  {generating ? (
                    <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generating…</>
                  ) : directions.length > 0 ? 'Generate More Directions' : 'Generate Directions'}
                </button>
              </div>
            </div>

            {/* AOY chunk 4 (S107 cont.): non-blocking nudge toward Verify Facts.
                Directions still fully works without it (facts are a later
                confirmation, never a gate, spec §8) — this only sequences the
                UX so Plan AOY entries / Best-fit category read as sharper once
                real numbers back them. */}
            {projectIsAoy && !spineFactsDone && (
              <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-800">Category recommendations use whatever evidence exists. Verify your facts first for sharper picks.</p>
                <button onClick={() => setTab('facts')} className="text-xs font-medium text-amber-800 hover:text-amber-900 underline flex-shrink-0">Verify Facts</button>
              </div>
            )}

            {/* Session 72 — Add AOY entry modal: controlled, market-scoped picker. */}
            {showAoyDirModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!addingAoyDir) setShowAoyDirModal(false) }}>
                <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Add a Campaign AOY entry</h3>
                  <p className="text-xs text-gray-500 mb-4">Campaign Asia-Pacific Agency of the Year. Pick the market-scoped category; a direction is created that you can draft and evaluate.</p>

                  <AoyEntryPicker key={showAoyDirModal ? 'aoy-dir-open' : 'aoy-dir-closed'} onChange={setDcAoyCategory} />

                  {aoyDirError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <p className="text-red-600 text-xs">{aoyDirError}</p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button onClick={addAoyDirection} disabled={addingAoyDir || !dcAoyCategory.trim()}
                      className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors">
                      {addingAoyDir ? 'Adding…' : 'Add entry'}
                    </button>
                    <button onClick={() => { if (!addingAoyDir) { setShowAoyDirModal(false); setAoyDirError('') } }} disabled={addingAoyDir}
                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Session 77 — Plan AOY entries modal: pick one seed category (market +
                pillar); the planner expands it to the market-scoped slate. */}
            {showStrategyModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!generatingStrategy) setShowStrategyModal(false) }}>
                <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Plan your AOY entries</h3>
                  <p className="text-xs text-gray-500 mb-4">Pick your market and one category in the pillar you want to plan. The planner ranks every category you could enter in that market against your agency facts and recommends where to enter, with a positioning angle. Agency categories by default; pick a People or Brand category to plan those instead.</p>

                  <AoyEntryPicker key={showStrategyModal ? 'aoy-strat-open' : 'aoy-strat-closed'} onChange={setStrategySeed} />

                  {strategyError && (
                    <div className="mt-3"><ErrorBanner error={strategyError} /></div>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button onClick={generateAoyStrategy} disabled={generatingStrategy || !strategySeed.trim()}
                      className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors">
                      {generatingStrategy ? 'Planning…' : 'Plan entries'}
                    </button>
                    <button onClick={() => { if (!generatingStrategy) { setShowStrategyModal(false); setStrategyError('') } }} disabled={generatingStrategy}
                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Session 77 — AOY entry-plan result (generate-aoy-strategy). Project-
                level; each recommendation accepts into a directions row. */}
            {strategyError && !showStrategyModal && !aoyStrategy && (
              <div className="mb-4"><ErrorBanner error={strategyError} /></div>
            )}
            {aoyStrategy && (() => {
              const s = aoyStrategy
              return (
                <div className="mb-5 bg-white border border-green-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">AOY entry plan</span>
                      <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{s.pillar} pillar</span>
                      {s.evidence_used?.facts_source === 'org' && <span className="text-xs text-gray-400">using org facts</span>}
                    </div>
                    <button onClick={() => setAoyStrategy(null)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Dismiss</button>
                  </div>
                  {s.headline && <p className="text-sm text-gray-800 font-medium">{s.headline}</p>}
                  {s.summary && <p className="text-xs text-gray-500 mt-1">{s.summary}</p>}
                  <p className="text-xs text-gray-400 mt-1">Ranked {s.recommendations.length} of {s.candidates_considered} categories you could enter.</p>
                  {strategyError && <div className="mt-2"><ErrorBanner error={strategyError} /></div>}
                  <div className="mt-3 space-y-2">
                    {s.recommendations.map((r, i) => {
                      const exists = directions.some(d => isAoyShow(d.best_show) && (d.best_category ?? '') === r.best_category)
                      return (
                        <div key={r.stem} className={`border rounded-lg px-3 py-2.5 ${i === 0 ? 'border-green-300 bg-green-50/40' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium text-gray-800 flex-1 min-w-0">
                              {r.label}
                              {i === 0 && <span className="ml-1.5 text-xs font-semibold bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full align-middle">Top pick</span>}
                            </p>
                            <p className="text-sm font-bold tabular-nums text-gray-700 flex-shrink-0">{r.fit}<span className="text-xs text-gray-400">/10</span></p>
                          </div>
                          <div className="mt-1.5"><MeterBar fraction={(r.fit || 0) / 10} color={i === 0 ? '#166534' : '#16a34a'} /></div>
                          {r.positioning && <p className="text-xs text-gray-700 mt-1.5 leading-relaxed">{r.positioning}</p>}
                          {r.rationale && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.rationale}</p>}
                          {r.evidence_sections.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.evidence_sections.map((x, xi) => (
                                <span key={xi} className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full tabular-nums">{x.name} {x.weight}%</span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2">
                            {exists ? (
                              <span className="text-xs text-gray-400">Already added</span>
                            ) : (
                              <button onClick={() => acceptStrategyRecommendation(r)} disabled={acceptingStem === r.stem}
                                className="text-xs font-medium text-green-700 hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                {acceptingStem === r.stem ? 'Adding…' : '+ Add as entry'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {generating && (
              <div className="mt-3 mb-4">
                <GeneratingBar isGenerating={generating} estimatedDuration={50000} />
              </div>
            )}

            {/* Directions source selector — only when materials or entries exist */}
            {(() => {
              const mats = (project.materials || []).filter(materialHasText)
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
                    {mats.map((m: Material, i: number) => (
                      <label key={i} className="flex items-start gap-3 cursor-pointer">
                        <input type="radio" name="dirSource"
                          checked={dirSourceType === 'material' && dirSourceMaterialIdx === i}
                          onChange={() => { setDirSourceType('material'); setDirSourceMaterialIdx(i) }}
                          className="mt-0.5 accent-green-700" />
                        <div>
                          <p className="text-sm text-gray-900">{m.name}</p>
                          <p className="text-xs text-gray-400">{materialWordCount(m).toLocaleString()} words</p>
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

            {generateError && <ErrorBanner error={generateError} />}
            {generateDraftError && <ErrorBanner error={generateDraftError} />}
            {generateDraftError && draftFindingsData?.blocked && (
              <DraftFindings blocked findings={draftFindingsData.findings} hedgedFigures={draftFindingsData.hedgedFigures} />
            )}

            {!project.combined_text && !(project.materials || []).some(materialHasText) && directions.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-amber-700 text-sm">Add a campaign brief on the Brief tab, or upload campaign materials, before generating directions.</p>
              </div>
            )}

            {directions.length === 0 && !generating ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-lg">
                {/* Session 54 — guidance-flavored empty state (v3 brief §10).
                    Respects the toggle: guidance off = plain empty state. */}
                {guidanceEnabled && (
                  <p className="text-gray-700 text-sm mb-2">
                    Start here, not with the draft. Directions maps which shows are worth entering and where the strongest angle is before you spend a word.
                  </p>
                )}
                <p className="text-gray-400 text-sm">
                  {(project.combined_text || (project.materials || []).some(materialHasText))
                    ? 'Click Generate Directions to get started.'
                    : 'Add a brief or upload materials first, then generate directions.'}
                </p>
              </div>
            ) : (
              <>
                {/* Sort controls — only shown when there are directions */}
                {directions.length > 1 && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-gray-400 flex-shrink-0">Sort by:</span>
                    {(['default', 'category_fit'] as const).map(key => (
                      <button
                        key={key}
                        onClick={() => setDirSortKey(key)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          dirSortKey === key
                            ? 'bg-green-800 border-green-700 text-white'
                            : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {key === 'default' ? 'Default' : 'Category Fit ↓'}
                      </button>
                    ))}
                  </div>
                )}
              <div className="grid grid-cols-1 gap-4">
                {[...directions].sort((a, b) => {
                  if (dirSortKey === 'category_fit') {
                    return (b.win_likelihood ?? 0) - (a.win_likelihood ?? 0)
                  }
                  return 0
                }).map((d, idx, arr) => {
                  const hasEntries = entries.some(e => e.direction_id === d.id)
                  const dirEvalBoth = evaluations[d.id] ?? {}
                  const dirBestEval = dirEvalBoth.judge ?? dirEvalBoth.coach ?? null
                  const hasEval = !!dirBestEval
                  const isGeneratingThis = generatingForDirectionId === d.id
                  const isNew = newDirectionIds.has(d.id)
                  // Draft generation info — used for the "Draft · Gen N" badge
                  const dirDraftEntries = entries.filter(e => e.direction_id === d.id && e.field_key !== 'entry')
                  const hasDraft = dirDraftEntries.length > 0
                  const dirMaxGen = hasDraft ? Math.max(...dirDraftEntries.map(e => e.draft_generation ?? 1)) : 0
                  // Show a divider when transitioning from new → existing directions.
                  // Session 57: only under default sort — under fit/chance/roi sorts
                  // new and old directions interleave and the divider misleads.
                  const prevIsNew = idx > 0 ? newDirectionIds.has(arr[idx - 1].id) : isNew
                  const showDivider = dirSortKey === 'default' && !isNew && prevIsNew && newDirectionIds.size > 0
                  return (
                    <Fragment key={d.id}>
                      {showDivider && (
                        <div className="flex items-center gap-3 py-1">
                          <div className="flex-1 border-t border-gray-200" />
                          <span className="text-xs text-gray-400 uppercase tracking-wider px-1">Previous directions</span>
                          <div className="flex-1 border-t border-gray-200" />
                        </div>
                      )}
                    <div id={`direction-card-${d.id}`} className={`bg-white border rounded-xl p-5 ${spotlightDirectionId === d.id ? 'border-green-600 ring-2 ring-green-500' : d.chosen ? 'border-green-700' : isNew ? 'border-green-400' : hasDraft ? 'border-blue-200' : 'border-gray-200'}`} style={{ borderLeftColor: '#c9a95c', borderLeftWidth: '3px' }}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-900">{d.name}</h3>
                            {isNew && <span className="text-xs bg-green-700 text-white px-2 py-0.5 rounded-full font-medium">New</span>}
                            {d.chosen && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Selected</span>}
                            {hasDraft && (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-medium">
                                Draft · Gen {dirMaxGen}
                              </span>
                            )}
                            {hasEval && dirBestEval && <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${scoreBg(dirBestEval.overall_score)} ${scoreColor(dirBestEval.overall_score)}`}>{dirBestEval.overall_score}/10</span>}
                          </div>
                          {d.best_show && <p className="text-green-700 text-sm mt-0.5">{d.best_show} · <span className="text-gray-500">{d.best_category}</span></p>}
                          {d.hook && <p className="text-gray-700 mt-2 italic" style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '0.95rem', lineHeight: 1.45 }}>&#8220;{d.hook}&#8221;</p>}

                          {/* ── More Openers ── */}
                          <div className="mt-1.5">
                            <button
                              onClick={() => hooksOptions[d.id]?.length
                                ? setHooksOpen(prev => ({ ...prev, [d.id]: !prev[d.id] }))
                                : generateHooks(d.id)
                              }
                              disabled={hooksLoading[d.id]}
                              className="text-xs text-green-700 hover:text-green-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                              {hooksLoading[d.id]
                                ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generating openers…</>
                                : hooksOptions[d.id]?.length
                                  ? hooksOpen[d.id] ? '↑ Hide openers' : `✦ ${hooksOptions[d.id].length} openers — show`
                                  : '✦ More openers'
                              }
                            </button>

                            {hooksOpen[d.id] && hooksOptions[d.id]?.length > 0 && (
                              <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                                {hooksOptions[d.id].map((hook, i) => (
                                  <div key={i} className="flex items-start gap-2">
                                    <p className="text-gray-700 italic flex-1" style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '0.9rem', lineHeight: 1.4 }}>&#8220;{hook}&#8221;</p>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(hook)
                                        setHooksCopied(prev => ({ ...prev, [d.id]: i }))
                                        setTimeout(() => setHooksCopied(prev => ({ ...prev, [d.id]: null })), 1500)
                                      }}
                                      className="text-gray-300 hover:text-green-700 transition-colors flex-shrink-0 text-sm leading-none mt-0.5"
                                      title="Copy to clipboard"
                                    >
                                      {hooksCopied[d.id] === i ? '✓' : '⎘'}
                                    </button>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                                  <button
                                    onClick={() => generateHooks(d.id)}
                                    disabled={hooksLoading[d.id]}
                                    className="text-xs text-gray-400 hover:text-green-700 transition-colors disabled:opacity-40"
                                  >
                                    ↻ Regenerate
                                  </button>
                                  <button
                                    onClick={() => setHooksOpen(prev => ({ ...prev, [d.id]: false }))}
                                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}

                            {hooksError[d.id] && <div className="mt-1"><ErrorBanner error={hooksError[d.id]} /></div>}
                          </div>

                          {d.angle && <p className="text-gray-500 text-sm mt-2">{d.angle}</p>}
                          {d.likelihood_rationale && <p className="text-gray-400 text-xs mt-2">{d.likelihood_rationale}</p>}
                          <div className="flex gap-4 mt-3">
                            {d.strengths && <div className="flex-1"><p className="text-xs text-green-700 font-medium mb-1">Strengths</p><p className="text-xs text-gray-500 leading-relaxed">{d.strengths}</p></div>}
                            {d.risks && <div className="flex-1"><p className="text-xs text-amber-700 font-medium mb-1">Risks</p><p className="text-xs text-gray-500 leading-relaxed">{d.risks}</p></div>}
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3 flex-wrap">
                            <button onClick={() => generateDraft(d.id)} disabled={generatingDraft}
                              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2">
                              {isGeneratingThis ? (<><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Writing draft…</>) : hasEntries ? 'Regenerate Draft' : 'Generate Draft'}
                            </button>
                            {hasEntries && !isGeneratingThis && (
                              <button onClick={() => setTab('entries')} className="text-xs text-green-700 hover:text-green-600 transition-colors">
                                {hasEval ? 'View entry & evaluation →' : 'View entry →'}
                              </button>
                            )}
                            {/* Arc v2 B2 (decision 4): the recommender-to-angles bridge —
                                each category card links into angle exploration with its
                                category preselected via query param. */}
                            {(d.best_category ?? '').trim() !== '' && (
                              <button onClick={() => router.push(`/projects/${projectId}/angles?category=${encodeURIComponent(d.best_category ?? '')}`)}
                                className="text-xs text-green-700 hover:text-green-600 transition-colors">
                                Explore angles in this category →
                              </button>
                            )}
                            {/* Session 76 — AOY category-fit recommender (which market-scoped
                                category does this entry read strongest in). AOY directions only. */}
                            {isAoyShow(d.best_show) && (
                              <button onClick={() => recommendAoyCategory(d.id)} disabled={recommending}
                                className="text-xs font-medium text-green-700 hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
                                {recommending && recommendingForDirectionId === d.id ? (<><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Checking fit…</>) : '◎ Best-fit category'}
                              </button>
                            )}
                          </div>
                          {isAoyShow(d.best_show) && recommendError && recommendingForDirectionId === d.id && (
                            <div className="mt-2"><ErrorBanner error={recommendError} /></div>
                          )}
                          {aoyRecommendations[d.id] && (() => {
                            const rec = aoyRecommendations[d.id]
                            return (
                              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-xs font-semibold text-gray-700">Category fit</span>
                                  {rec.pillar && <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{rec.pillar} pillar</span>}
                                </div>
                                {rec.recommendation?.headline && <p className="text-sm text-gray-800 font-medium">{rec.recommendation.headline}</p>}
                                <div className="mt-2 space-y-1.5">
                                  {rec.ranking.map(r => {
                                    const isTop = r.stem === rec.recommendation?.top_stem
                                    return (
                                      <div key={r.stem} className={`border rounded-lg px-3 py-2 bg-white ${isTop ? 'border-green-300' : 'border-gray-200'}`}>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <p className="text-xs font-medium text-gray-800 flex-1 min-w-0">
                                            {r.label}
                                            {r.is_current && <span className="text-gray-400"> · current</span>}
                                            {isTop && <span className="text-green-700"> · best fit</span>}
                                          </p>
                                          <p className="text-sm font-bold tabular-nums text-gray-700 flex-shrink-0">{r.fit}<span className="text-xs text-gray-400">/10</span></p>
                                        </div>
                                        {r.rationale && <p className="text-xs text-gray-500 mt-0.5">{r.rationale}</p>}
                                        {r.evidence_sections.length > 0 && (
                                          <p className="text-xs text-gray-400 mt-0.5">Leans on: {r.evidence_sections.map(s => `${s.name} (${s.weight}%)`).join(', ')}</p>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                                {rec.recommendation?.is_switch && (
                                  <p className="text-xs text-gray-500 mt-2">This is a stronger fit than your current category. Add it from the picker if you want to enter it.</p>
                                )}
                              </div>
                            )
                          })()}
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
                          </div>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  )
                })}
              </div>
              </>
            )}
          </div>
        )}

        {/* ── ENTRIES ── */}
        {tab === 'entries' && (
          <div>
            {showsStrip}
            {evaluateError && <ErrorBanner error={evaluateError} />}

            {entries.length === 0 ? (
              <div className="max-w-lg">
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                  <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-700 text-lg">✦</span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">No entry drafts yet</h3>
                  {/* Session 54 — guidance-flavored empty state (v3 brief §10) */}
                  {guidanceEnabled && (
                    <p className="text-gray-700 text-sm mb-2">
                      Your agency profile is loaded. First drafts come out in your team's voice. Revise inline or in chat. Earlier drafts are never deleted.
                    </p>
                  )}
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
                {(() => {
                  // Order: focused entry first (just generated/scored), then the
                  // rest newest-first, so previous entries sit collapsed below
                  // the active one (S91). Default focus = the most recently
                  // drafted entry, so a fresh page load opens on the latest work.
                  const entryDirIds = Array.from(new Set(entries.map(e => e.direction_id)))
                  const newestEntryDirId = entries.length
                    ? entries.reduce((a, b) =>
                        new Date(b.created_at ?? 0).getTime() > new Date(a.created_at ?? 0).getTime() ? b : a
                      ).direction_id
                    : null
                  const effectiveFocusDirId =
                    (focusedEntryDirId != null && entryDirIds.includes(focusedEntryDirId))
                      ? focusedEntryDirId : newestEntryDirId
                  const orderedEntryDirIds = [...entryDirIds].sort((a, b) => {
                    if (a === effectiveFocusDirId) return -1
                    if (b === effectiveFocusDirId) return 1
                    return b - a
                  })
                  return orderedEntryDirIds.map(dirId => {
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
                    const hasJudge = !!evalBoth.judge
                    const hasCoach = !!evalBoth.coach
                    // S160b (Ben feedback): the AOY/config ADVISORY coaches are session-only
                    // and never an evaluations row (S93/S112 — no 0-10, so they must not
                    // enter evalBoth). They now surface under the Coach Review TAB in the
                    // eval rail instead of a separate full-width panel above the columns.
                    const hasAdvisoryCoach = !!(aoyCoaching[dirId] || configCoaching[dirId])
                    // Session 57: three views on the eval panel — judge / coach /
                    // the Recommended Next Steps tab. Falls back to whichever
                    // mode actually exists when the stored view does not.
                    const requestedView = evalDisplayMode[dirId] ?? (hasJudge ? 'judge' : 'coach')
                    const activeView: 'judge' | 'coach' | 'nextsteps' =
                      requestedView === 'nextsteps' ? 'nextsteps'
                        : requestedView === 'coach' && (hasCoach || hasAdvisoryCoach) ? 'coach'
                        : requestedView === 'judge' && hasJudge ? 'judge'
                        : hasJudge ? 'judge' : 'coach'
                    const activeMode: 'judge' | 'coach' = activeView === 'coach' ? 'coach' : 'judge'
                    const evaluation = evalBoth[activeMode]
                    const dirHistory = evalHistory[dirId] ?? []
                    const isEvaluatingThis = evaluatingForDirectionId === dirId
                    const isGeneratingThis = generatingForDirectionId === dirId
                    // Detect when draft has been improved since the last evaluation.
                    // Checked against BOTH modes independently — banner must not flicker
                    // when the user switches between judge/coach tabs.
                    const judgeEvalDraft = evalBoth.judge
                      ? allDirEntries.find(e => e.id === evalBoth.judge!.entry_draft_id) : null
                    const coachEvalDraft = evalBoth.coach
                      ? allDirEntries.find(e => e.id === evalBoth.coach!.entry_draft_id) : null
                    const judgeEvalGen = evalBoth.judge
                      ? (judgeEvalDraft?.draft_generation ?? 1) : null
                    const coachEvalGen = evalBoth.coach
                      ? (coachEvalDraft?.draft_generation ?? 1) : null
                    const needsReEval =
                      (judgeEvalGen !== null && maxGen > judgeEvalGen) ||
                      (coachEvalGen !== null && maxGen > coachEvalGen)
                    // Score deltas for this direction (set after a comparison re-evaluation)
                    const deltas = scoreDeltas[dirId] ?? null
                    // Collapsible card (S91): expanded if the user toggled it, else
                    // open only for the focused (just-worked-on) entry. Summary
                    // badges (score + category fit) show in both states.
                    const isExpanded = entryCardExpanded[dirId] ?? (dirId === effectiveFocusDirId)
                    const summaryScore = (evalBoth.judge ?? evalBoth.coach)?.overall_score ?? null
                    const dirFit = d?.win_likelihood ?? null

                    // ── Entry Room Slice 1 (24 Aug 2026) — version selector ──────────
                    // One state per direction (viewingGen), default = maxGen labeled
                    // "current". allGens covers every generation that has EVER existed
                    // for this direction, current or historical, so the selector always
                    // lists the true range even if the user is mid-view on an old one.
                    const allGens: number[] = Array.from(new Set(allDirEntries.map(e => e.draft_generation ?? 1)))
                    const activeGen = viewingGen[dirId] ?? maxGen
                    const isHistorical = activeGen !== maxGen
                    // historyByGen only holds gens < maxGen (by construction above); the
                    // current generation's own fields are `fields`.
                    const viewFields: EntryDraft[] = isHistorical ? (historyByGen[activeGen] ?? []) : fields
                    const readOnlyFields: MinimalDraftField[] = viewFields.map(vf => ({
                      id: vf.id,
                      field_key: vf.field_key,
                      field_label: vf.field_label,
                      section_weight: vf.section_weight,
                      text: resolveFieldContent(vf),
                    }))
                    // Per-version eval lookup (re-keyed by generation, not discarded to
                    // maxGen-only like `evaluations`). thisVersionEval is keyed to
                    // whichever lens (judge/coach) is currently active for this card.
                    const genEvalSlot = evaluationsByGen[dirId]?.[activeGen] ?? {}
                    const thisVersionEval: MinimalEvaluation = genEvalSlot[activeMode] ?? null
                    // Section-level scores for the version being viewed, keyed by
                    // field_key — evaluations.scores is keyed by field_key regardless
                    // of show type (AOY/SMARTIES/config), so this is safe generically.
                    // Renders NO badge where a section has no score, never a zero.
                    const viewSectionScores: Record<string, number | null> = {}
                    for (const vf of viewFields) {
                      viewSectionScores[vf.field_key] = thisVersionEval?.scores?.[vf.field_key] ?? null
                    }
                    // Newest STRICTLY-EARLIER generation that has an eval in this mode —
                    // may skip generations that were never evaluated at all.
                    const priorEvaluatedGenNum: number | null = (() => {
                      const earlier = allGens.filter(g => g < activeGen).sort((a, b) => b - a)
                      for (const g of earlier) {
                        if (evaluationsByGen[dirId]?.[g]?.[activeMode]) return g
                      }
                      return null
                    })()
                    const priorVersionEval: MinimalEvaluation = priorEvaluatedGenNum != null
                      ? (evaluationsByGen[dirId]?.[priorEvaluatedGenNum]?.[activeMode] ?? null)
                      : null
                    const versionDelta = computeVersionDeltaState({
                      gen: activeGen,
                      thisEval: thisVersionEval,
                      priorEvaluatedEval: priorVersionEval,
                    })

                    // S153: extract the movable blocks so one copy can render either the
                    // desktop side-by-side layout or the old single stack (?sxs=0).
                    const sxsEditSurface = (
                      <>
                        {/* What-changed summary (17 Aug 2026, Joanne Fu call) — renders
                            directly above the current draft whenever an earlier
                            generation exists, so a regenerated ("optimized") draft
                            shows its delta where the transform happened. Reuses the
                            generation grouping + resolveFieldContent the bottom
                            compare view already uses; that view is untouched. Sits
                            at the top of sxsEditSurface so it covers all four
                            layout paths (workbench on/off, sxs on/off) and the AOY
                            workbench, config canvas and legacy campaign fields. */}
                        {historyGens.length > 0 && (historyByGen[historyGens[0]] ?? []).length > 0 && (
                          <DraftChangeSummary
                            generation={maxGen}
                            previousGeneration={historyGens[0]}
                            current={fields.map(f => ({ key: f.field_key || f.field_label || String(f.id), label: f.field_label || f.field_key || 'Section', text: resolveFieldContent(f) }))}
                            previous={(historyByGen[historyGens[0]] ?? []).map(f => ({ key: f.field_key || f.field_label || String(f.id), label: f.field_label || f.field_key || 'Section', text: resolveFieldContent(f) }))}
                          />
                        )}

                        {/* Findings render (23 Aug 2026, entry-room step one): the
                            guard's own output for the draft just generated. On
                            success: the hedged figures it licensed plus the NOFACTS
                            notice. Sits with DraftChangeSummary at the top of
                            sxsEditSurface so it covers all four layout paths. */}
                        {draftFindingsData && !draftFindingsData.blocked && draftFindingsData.dirId === dirId && (
                          <DraftFindings blocked={false} findings={draftFindingsData.findings} hedgedFigures={draftFindingsData.hedgedFigures} notice={draftFindingsData.notice} />
                        )}

                        {/* AOY page-budget meter (Session 74) — AOY entries only.
                            Words used across the exec summary + weighted sections
                            (the endorsement gate is excluded) vs the 10-page cap. */}
                        {/* S148: gate keys off projectIsAoy, not the raw entry_type
                            column — entry_type is only set by the separate "Verify
                            Facts" step, so a fresh AOY project without that step run
                            was falling through to the campaign UI (Ben's P4 test). */}
                        {projectIsAoy && fields.some(f => f.section_weight != null) && (() => {
                          const AOY_WORDS_PER_PAGE = 500
                          const AOY_MAX_PAGES = 10
                          const budgetFields = fields.filter(f => f.field_key !== 'endorsement')
                          const usedWords = budgetFields.reduce((acc, f) => acc + countWords(resolveFieldContent(f)), 0)
                          const usedPages = usedWords / AOY_WORDS_PER_PAGE
                          const pct = Math.min(100, Math.round((usedPages / AOY_MAX_PAGES) * 100))
                          const over = usedWords > AOY_WORDS_PER_PAGE * AOY_MAX_PAGES
                          const weightSum = fields.reduce((acc, f) => acc + (f.section_weight ?? 0), 0)
                          return (
                            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Page budget</span>
                                <span className={`text-xs tabular-nums ${over ? 'text-red-600' : 'text-gray-500'}`}>
                                  {usedWords.toLocaleString()} words · ~{usedPages.toFixed(1)} / {AOY_MAX_PAGES} pages
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: over ? '#dc2626' : '#166534' }} />
                              </div>
                              {over && (
                                <p className="text-xs text-red-600 mt-1.5">Over the 10-page limit. Tighten the lower-weighted sections first.</p>
                              )}
                              {weightSum > 0 && weightSum !== 100 && (
                                <p className="text-xs text-amber-600 mt-1.5">Section weights total {weightSum}%, not 100%. Check the category rubric.</p>
                              )}
                            </div>
                          )
                        })()}

                        {/* Workbench P2 Chunks 2-4 (S138-S143), gated by ?workbench=1.
                            Purely additive: renders ABOVE the legacy canvas. Chunk 2
                            maps the stored AOY eval onto the cards + chips by section
                            key (never order): per-section score, jury rationale, and
                            section-attributed gaps; unmatched gaps stay in the summary
                            bar. Chips jump-scroll to their card and the Jury re-eval
                            lives in the summary bar. Chunk 4: manual save + restore
                            write here (onSaveText/onRestore -> appendRevision/
                            restoreRevision); refine still posts through the legacy box
                            below (its output lands in custom_text + revisions via the
                            edge fn and shows up here on the next render, same row).
                            The legacy A/B/C chips + inline-edit trigger are suppressed
                            below (wbActive) so there is exactly one write surface per
                            section text, not two with different revision fidelity. */}
                        {/* S148: projectIsAoy, not raw entry_type — see note above. */}
                        {workbenchPreview && projectIsAoy && (() => {
                          const wbFields = fields.filter(f => f.field_key !== 'entry')
                          if (wbFields.length === 0) return null
                          // AOY stores per-section jury scores keyed by field_key in
                          // evaluations.scores; the fixed 6-dim type does not describe
                          // that shape, so cast to a keyed record. Explicit Record type
                          // on the fallback (S113: a computed-key index on `|| {}` fails
                          // strict-mode typecheck even when esbuild is clean).
                          // Map the stored AOY eval onto cards + chips by section KEY
                          // (field_key), never array order. Scores live in
                          // evaluations.scores; rationale + the weighted section list
                          // live in output.sections; gaps are entry-level and attributed
                          // to a section by label-word match (fail-soft: unmatched gaps
                          // go to the summary bar, never dropped). Casts are explicit
                          // Record/typed so strict typecheck holds even where esbuild is
                          // clean (S113).
                          const secScores: Record<string, number> =
                            (evaluation?.scores as unknown as Record<string, number>) ?? {}
                          const aoyOut = (evaluation?.output ?? null) as unknown as Record<string, unknown> | null
                          const verdict = typeof aoyOut?.verdict === 'string' ? aoyOut.verdict : null
                          const evalMap = mapAoyEvaluation(
                            {
                              scores: secScores,
                              sections: (aoyOut?.sections as unknown as StoredEvalSection[]) ?? null,
                              gaps: evaluation?.gaps ?? null,
                            },
                            wbFields.map(f => f.field_key),
                          )
                          const summarySections = wbFields.map(f => ({
                            key: f.field_key,
                            label: f.field_label,
                            score: evalMap.bySection[f.field_key]?.score ?? null,
                          }))
                          const jumpToSection = (key: string) => {
                            if (typeof document === 'undefined') return
                            document.getElementById(`wb-${dirId}-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                          // P3 (S146): directional section re-scores. Local (this session)
                          // wins over any persisted on the evaluation row. Keyed by
                          // section_key (field_key), same key the cards + eval map use.
                          const localRescores = sectionRescores[dirId] ?? {}
                          const storedRescores: Record<string, SectionRescore> =
                            (evaluation?.section_rescores as Record<string, SectionRescore>) ?? {}
                          const rescoreFor = (key: string): SectionRescore | null =>
                            localRescores[key] ?? storedRescores[key] ?? null
                          const judgeEvalId = evalBoth.judge?.id
                          const deltaByKey: Record<string, number> = {}
                          let rescoredCount = 0
                          for (const f of wbFields) {
                            const r = rescoreFor(f.field_key)
                            if (!r) continue
                            rescoredCount++
                            const official = evalMap.bySection[f.field_key]?.score
                            if (typeof official === 'number') {
                              deltaByKey[f.field_key] = Math.round((r.score - official) * 10) / 10
                            }
                          }
                          const indicativeTotal = rescoredCount > 0
                            ? computeIndicativeTotal(wbFields.map(f => ({
                                weight: f.section_weight,
                                official: evalMap.bySection[f.field_key]?.score ?? null,
                                rescore: rescoreFor(f.field_key)?.score ?? null,
                              })))
                            : null
                          return (
                            <div className="border-b border-gray-100 bg-white">
                              <div className="px-5 pt-3 pb-1">
                                <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                                  Section workbench
                                </p>
                              </div>
                              <EvalSummaryBar
                                overallScore={evaluation?.overall_score ?? null}
                                verdict={verdict}
                                sections={summarySections}
                                strengths={evaluation?.strengths}
                                unattributedGaps={evalMap.unattributedGaps}
                                onJumpToSection={jumpToSection}
                                onReRunEval={() => evaluateEntry(dirId, 'judge', evalBoth.judge?.id)}
                                reRunning={evaluatingMode[dirId] === 'judge'}
                                reRunLabel={hasJudge ? 'Re-run Jury Eval' : 'Jury Evaluation'}
                                indicativeTotal={indicativeTotal}
                                rescoredCount={rescoredCount}
                                deltaByKey={deltaByKey}
                              />
                              <div className="divide-y divide-gray-100">
                                {wbFields.map(f => {
                                  const r = rescoreFor(f.field_key)
                                  const currentText = resolveFieldContent(f)
                                  const secError = rescoreError[`${dirId}:${f.field_key}`]
                                  return (
                                  <div key={f.id}>
                                  <SectionWorkbench
                                    anchorId={`wb-${dirId}-${f.field_key}`}
                                    sectionKey={f.field_key}
                                    label={f.field_label}
                                    weight={f.section_weight ?? null}
                                    text={currentText}
                                    wordLimit={f.word_limit}
                                    score={evalMap.bySection[f.field_key]?.score ?? null}
                                    rationale={evalMap.bySection[f.field_key]?.rationale ?? null}
                                    gaps={evalMap.bySection[f.field_key]?.gaps}
                                    dataItems={f.data_needed ?? []}
                                    revisions={f.revisions ?? []}
                                    scanningData={!!scanningData[f.id]}
                                    onScanData={() => scanSectionData(f)}
                                    onToggleData={(id, done) => toggleDataNeededItem(f, id, done)}
                                    onAddData={(text) => addDataNeededItem(f, text)}
                                    onTrackGap={(gapText) => trackGapAsDataNeeded(f, gapText)}
                                    onSaveText={(text) => appendRevision(f, text, 'manual')}
                                    onRestore={(idx) => { void restoreRevision(f, idx) }}
                                    onRecheck={judgeEvalId ? () => recheckSection(dirId, judgeEvalId, f) : undefined}
                                    rechecking={!!recheckingSection[`${dirId}:${f.field_key}`]}
                                    rescore={r ? { score: r.score, rationale: r.rationale } : null}
                                    rescoreStale={r ? isRescoreStale(r, currentText) : false}
                                    chatSlot={
                                      <SectionChat
                                        thread={(f.chat_history ?? []) as ChatTurn[]}
                                        onSend={(msg, mode) => sendSectionChat(f, dirId, msg, mode)}
                                        busy={chatBusyField?.id === f.id}
                                        busyMode={chatBusyField?.id === f.id ? chatBusyField.mode : null}
                                        error={chatErrors[f.id]}
                                      />
                                    }
                                  />
                                  {secError && (
                                    <p className="px-5 pb-3 -mt-2 text-xs text-red-600">{secError}</p>
                                  )}
                                  </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Entry fields */}
                        <div className="divide-y divide-gray-100">
                          {(() => {
                            // Entry Form v2 (Chunk v2.2): a config direction whose
                            // seeded spec is v2 (typed sub-fields) renders the truthful
                            // typed canvas. AOY / v1 / craft keep the flat box below.
                            const ef = entryForms[dirId]
                            const cfgMode = configModeFor(dirId, d?.best_show)
                            if (ef && cfgMode && isV2Spec(ef)) {
                              // S151 Workbench-for-SMARTIES: remap the existing config
                              // jury output (evalBoth.judge.output.sections) into a
                              // per-section score/rationale map, keyed by BOTH the
                              // section key and field_key (qualitative config keys by
                              // field_key, weighted by slug key). Read-only, no scorer
                              // touch. Absent when no judge eval exists yet -> the canvas
                              // simply renders no Jury read.
                              const cfgJuryOut = (evalBoth.judge?.output ?? null) as
                                | { sections?: Array<{ key?: string; field_key?: string; score?: number; rationale?: string }> }
                                | null
                              const juryBySection: Record<string, { score: number | null; rationale: string | null }> = {}
                              if (Array.isArray(cfgJuryOut?.sections)) {
                                for (const s of cfgJuryOut!.sections!) {
                                  const entry = {
                                    score: typeof s.score === 'number' ? s.score : null,
                                    rationale: typeof s.rationale === 'string' ? s.rationale : null,
                                  }
                                  if (s.field_key) juryBySection[s.field_key] = entry
                                  if (s.key) juryBySection[s.key] = entry
                                }
                              }
                              return (
                                <ConfigEntryCanvas
                                  spec={ef}
                                  scoringMode={cfgMode}
                                  onSaveSection={saveSectionFields}
                                  dirId={dirId}
                                  juryBySection={juryBySection}
                                  chatBusyRowId={chatBusyField?.id ?? null}
                                  chatErrors={chatErrors}
                                  onRestoreRevision={restoreConfigRevision}
                                  onSendChat={(rowId, message) => {
                                    const fld = fields.find(f => f.id === rowId)
                                    if (!fld) return Promise.resolve()
                                    return sendSectionChat(fld, dirId, message, 'discuss')
                                  }}
                                  rows={fields.filter(f => f.field_key !== 'entry').map(f => ({
                                    id: f.id,
                                    field_key: f.field_key,
                                    field_label: f.field_label,
                                    section_weight: f.section_weight,
                                    version_a: f.version_a,
                                    custom_text: f.custom_text,
                                    field_values: f.field_values ?? null,
                                    chat_history: (f.chat_history ?? []) as ChatTurn[],
                                    revisions: (f.revisions ?? null) as ConfigSectionRevision[] | null,
                                  }))}
                                />
                              )
                            }
                            return (
                              <>
                              {fields.some(f => f.field_key !== 'entry') && (
                                <div className="px-5 pt-3 pb-2">
                                  <p className="text-xs text-gray-400">Tip: click any section's text (or ✎ Edit) to edit it directly. Use the box under each section to refine it with AI. Cmd/Ctrl+Enter sends.</p>
                                </div>
                              )}
                              {fields.map(field => {
                            const content = resolveFieldContent(field)
                            const isEditingThis = editingFieldId === field.id
                            const liveContent = isEditingThis ? fieldEditValue : content
                            const wordCount = liveContent ? countWords(liveContent) : 0
                            const overLimit = !!(field.word_limit && wordCount > field.word_limit)
                            const isUploadedDoc = field.field_key === 'entry'
                            // S158: uploaded entries default EXPANDED so the imported
                            // content is visible on load (an empty collapsed column read
                            // as 'nothing was extracted'). Section fields keep the S154
                            // default-collapsed behaviour.
                            const isExpanded = expandedEntryFields[field.id] ?? isUploadedDoc
                            // Workbench P2 Chunk 4: this same section already has a
                            // SectionWorkbench card above (with History replacing the
                            // chips) whenever the workbench preview is on for an AOY
                            // project. Suppress the legacy chip UI + inline-edit
                            // trigger in that case so there is one write surface, not
                            // two with different revision fidelity (the legacy inline
                            // edit writes custom_text only, no revisions entry).
                            // S148: the primary Workbench gate. Was keyed off the raw
                            // entry_type column, which only flips to 'aoy' after the
                            // separate "Verify Facts" step runs — so every fresh AOY
                            // project (nothing had run Verify Facts) rendered the
                            // legacy campaign UI instead of Workbench. projectIsAoy is
                            // the richer, already-pervasive signal (target_shows +
                            // entry_type + direction.best_show) used everywhere else
                            // in this render; this was the one gate that had drifted.
                            const wbActive = workbenchPreview && projectIsAoy

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
                                  {/* Fix (21 Jul 2026): 'View full entry' previously opened a
                                      384px scroll window (max-h-96) whose macOS overlay scrollbar
                                      is invisible until touched, so a long uploaded entry (any
                                      creative-track show without a structured entry_form) read as
                                      truncated mid-sentence. Expanded now renders the full entry;
                                      blank-line runs from docx/pdf extraction are collapsed for
                                      display only (Copy still copies the raw content). */}
                                  {isExpanded && (
                                    <div className="mt-3">
                                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{(content || '').replace(/\n{3,}/g, '\n\n').trim()}</p>
                                    </div>
                                  )}
                                </div>
                              )
                            }

                            const isRefining = refiningFieldId === field.id
                            const chatThread = field.chat_history || []
                            return (
                              <div key={field.id} className="px-5 py-5">

                                <div className="flex items-start justify-between mb-3 gap-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{field.field_label}</p>
                                    {field.section_weight != null && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-medium tabular-nums">
                                        {field.section_weight}% of score
                                      </span>
                                    )}
                                    {(field.version_b || field.version_c) && !wbActive && (
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
                                    {!wbActive && (
                                      <button
                                        onClick={() => { if (editingFieldId !== field.id) { setEditingFieldId(field.id); setFieldEditValue(content) } }}
                                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                        ✎ Edit
                                      </button>
                                    )}
                                    <button onClick={() => content && navigator.clipboard.writeText(content)}
                                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                      Copy
                                    </button>
                                  </div>
                                </div>

                                {isEditingThis ? (
                                  <div className="mb-4">
                                    <textarea
                                      value={fieldEditValue}
                                      onChange={e => setFieldEditValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Escape') {
                                          setEditingFieldId(null)
                                          setFieldEditValue('')
                                        }
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                          saveFieldEdit(field.id)
                                        }
                                      }}
                                      rows={Math.max(5, (fieldEditValue.match(/\n/g) || []).length + 4)}
                                      autoFocus
                                      className="w-full bg-gray-50 border border-green-600 rounded-lg px-3 py-2.5 text-sm text-gray-900 leading-relaxed focus:outline-none resize-none"
                                    />
                                    <div className="flex items-center gap-2 mt-2">
                                      <button
                                        onClick={() => saveFieldEdit(field.id)}
                                        disabled={savingFieldEdit}
                                        className="text-xs bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded transition-colors"
                                      >
                                        {savingFieldEdit ? 'Saving…' : 'Save'}
                                      </button>
                                      <button
                                        onClick={() => { setEditingFieldId(null); setFieldEditValue('') }}
                                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      {field.custom_text?.trim() && (
                                        <button
                                          onClick={() => saveFieldEdit(field.id, true)}
                                          disabled={savingFieldEdit}
                                          className="text-xs text-amber-600 hover:text-amber-700 transition-colors ml-auto disabled:opacity-40"
                                        >
                                          Clear manual edit
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className={wbActive ? 'mb-4' : 'group relative cursor-text mb-4'}
                                    onClick={wbActive ? undefined : () => {
                                      setEditingFieldId(field.id)
                                      setFieldEditValue(content)
                                    }}
                                    title={wbActive ? undefined : 'Click to edit'}
                                  >
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                      {content || <span className="italic text-gray-400">Not yet generated</span>}
                                    </p>
                                    {field.custom_text?.trim() && (
                                      <span className="text-xs text-blue-600 font-medium mt-0.5 block">✎ manually edited</span>
                                    )}
                                    {!wbActive && (
                                      <span className="absolute top-0 right-0 text-xs text-gray-300 group-hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100 pointer-events-none select-none">
                                        ✎ edit
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Workbench P4 (S147): this whole legacy chat surface (thread +
                                    refine textarea) is superseded by the SectionChat mounted in the
                                    SectionWorkbench card's chatSlot above, for wbActive sections.
                                    Suppressing it here keeps ONE write surface per section, same
                                    reasoning as the chips/inline-edit suppression above (S143). */}
                                {!wbActive && (<>
                                {chatThread.length > 0 && (
                                  <div className={`mb-3 space-y-2 ${chatThread.length > 8 ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
                                    {chatThread.map((msg, i) => {
                                      if (msg.role === 'user') {
                                        return (
                                          <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                                            <span className="text-gray-300 mt-0.5">↺</span>
                                            <span className="italic">"{msg.content}"</span>
                                            {msg.version_created && (
                                              <span className="text-green-700 font-medium uppercase flex-shrink-0">→ {msg.version_created}</span>
                                            )}
                                          </div>
                                        )
                                      }
                                      const turnKey = `${field.id}:${i}`
                                      const isOpen = expandedChatTurns[turnKey] ?? false
                                      return (
                                        <div key={i} className="ml-5 text-xs">
                                          <button
                                            onClick={() => setExpandedChatTurns(prev => ({ ...prev, [turnKey]: !isOpen }))}
                                            className="text-gray-400 hover:text-gray-600 transition-colors"
                                          >
                                            {isOpen ? 'Hide revision ↑' : 'Show revision ↓'}
                                          </button>
                                          {isOpen && (
                                            <p className="mt-1 text-gray-500 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded p-2">{msg.content}</p>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {refineBarFieldId === field.id && (
                                  <div className="mb-2">
                                    <GeneratingBar
                                      isGenerating={isRefining}
                                      estimatedDuration={22_000}
                                      statementInterval={3_500}
                                      statements={REFINE_STATEMENTS}
                                      onComplete={() => setRefineBarFieldId(null)}
                                    />
                                  </div>
                                )}
                                {refineErrors[field.id] && (
                                  <p className="text-xs text-red-600 mb-2">{refineErrors[field.id]}</p>
                                )}
                                <div className="flex gap-2 items-end">
                                  <textarea
                                    value={refineMessage[field.id] || ''}
                                    onChange={e => setRefineMessage(prev => ({ ...prev, [field.id]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault()
                                        refineField(field, dirId)
                                      }
                                    }}
                                    rows={Math.min(6, Math.max(3, ((refineMessage[field.id] || '').match(/\n/g) || []).length + 2))}
                                    placeholder={`Refine with AI — e.g. "make this punchier" or "cut to ${field.word_limit ? field.word_limit + ' words' : '100 words'}"`}
                                    disabled={isRefining}
                                    className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors disabled:opacity-50 resize-none"
                                  />
                                  <button
                                    onClick={() => refineField(field, dirId)}
                                    disabled={isRefining || !refineMessage[field.id]?.trim()}
                                    className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2 flex-shrink-0"
                                  >
                                    {isRefining ? (
                                      <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Refining…</>
                                    ) : 'Refine →'}
                                  </button>
                                </div>
                                </>)}
                              </div>
                            )
                          })}
                              </>
                            )
                          })()}
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
                                disabled={evaluating || generatingDraft || coaching}
                                className="text-xs text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {((isEvaluatingThis && evaluatingMode[dirId] === 'coach') || (coaching && coachingForDirectionId === dirId)) ? (
                                  <><svg className="animate-spin h-3 w-3 inline mr-1" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Coaching…</>
                                ) : isAoyShow(d?.best_show ?? '') ? (
                                  <>✦ {aoyCoaching[dirId] ? 'Re-run AOY Coach' : 'AOY Coach'}</>
                                ) : configModeFor(dirId, d?.best_show) ? (
                                  <>✦ {configCoaching[dirId] ? 'Re-run Coach' : 'Coach Review'}</>
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
                                  {/* Fix (22 Jul 2026): compare shows FULL sections, always.
                                      The first pass defaulted to line-clamp-3 previews with a
                                      Show-full toggle; truncated text ending in an ellipsis
                                      reads as broken, and 'click to compare' already implies
                                      the full text. The panel is opt-in and collapsed by
                                      default, so length is acceptable. */}
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
                                              <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{(histContent || '').replace(/\n{3,}/g, '\n\n').trim()}</p>
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
                      </>
                    )
                    const sxsEvalTop = (
                      <>
                        {/* Evaluation panel */}
                        {(hasJudge || hasCoach || hasAdvisoryCoach) && (
                          <div className="border-b border-gray-200 bg-gray-50">
                            {/* Collapsed summary strip (S152). Default collapsed: the
                                per-section jury reads now render inline in the edit surface
                                below, so the full breakdown is opt-in, not stacked above it. */}
                            <button
                              type="button"
                              onClick={() => setEvalPanelExpanded(prev => ({ ...prev, [dirId]: !(prev[dirId] ?? evalDefaultExpanded) }))}
                              className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{hasJudge ? 'Jury evaluation' : 'Coach review'}</span>
                                {summaryScore != null && (
                                  <span className="text-sm font-bold tabular-nums text-gray-900">{summaryScore.toFixed(1)}<span className="font-normal text-gray-400">/10</span></span>
                                )}
                              </div>
                              <span className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600">{(evalPanelExpanded[dirId] ?? evalDefaultExpanded) ? 'Hide breakdown ↑' : 'Full breakdown ↓'}</span>
                            </button>
                            <div className={(evalPanelExpanded[dirId] ?? evalDefaultExpanded) ? 'border-t border-gray-200' : 'hidden'}>

                            {/* Eval view tab strip — Session 57: shown once ANY eval exists.
                                Tabs render per existing mode, plus the always-present
                                Recommended Next Steps tab (the Build 2 card's new home).
                                Larger targets than the Session 55 strip per Ben's review. */}
                            <div className="px-5 pt-4 flex items-center gap-1 border-b border-gray-200 flex-wrap">
                              {hasJudge && (
                                <button
                                  onClick={() => setEvalDisplayMode(prev => ({ ...prev, [dirId]: 'judge' }))}
                                  className={`text-sm font-medium px-4 py-2 rounded-t-lg border-b-2 transition-colors -mb-px ${activeView === 'judge' ? 'border-gray-800 text-gray-900 bg-white' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                                  style={{ minHeight: '44px' }}
                                >
                                  ⚖ Jury Evaluation
                                </button>
                              )}
                              {(hasCoach || hasAdvisoryCoach) && (
                                <button
                                  onClick={() => setEvalDisplayMode(prev => ({ ...prev, [dirId]: 'coach' }))}
                                  className={`text-sm font-medium px-4 py-2 rounded-t-lg border-b-2 transition-colors -mb-px ${activeView === 'coach' ? 'border-green-700 text-green-800 bg-white' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                                  style={{ minHeight: '44px' }}
                                >
                                  ✦ Coach Review
                                </button>
                              )}
                              <button
                                onClick={() => setEvalDisplayMode(prev => ({ ...prev, [dirId]: 'nextsteps' }))}
                                className={`text-sm font-semibold px-4 py-2 rounded-t-lg border-b-2 transition-colors -mb-px ${activeView === 'nextsteps' ? 'border-green-700 text-green-800 bg-green-50' : 'border-transparent text-green-700 hover:text-green-600 hover:bg-green-50'}`}
                                style={{ minHeight: '44px' }}
                              >
                                ✦ Recommended Next Steps
                              </button>
                            </div>

                          {activeView === 'nextsteps' ? (
                          <div className="px-5 py-5">
                            {(() => {
                              // Session 57: the Build 2 Next Step card, relocated from the
                              // bottom of the judge output into this tab and made state-aware.
                              // Still PRODUCT OUTPUT — ignores the guidance toggle.
                              const judgeEval = evalBoth.judge ?? null
                              const judgeOut = (judgeEval?.output ?? null) as JudgeOutput | null
                              const realDirs = directions.filter(dd => dd.angle !== 'Uploaded entry — direct evaluation')
                              const evalDirFit = directions.find(dd => dd.id === dirId)?.win_likelihood ?? null
                              const strongerDirections: NextStepDirectionRef[] = realDirs
                                .filter(dd => dd.id !== dirId && typeof dd.win_likelihood === 'number')
                                .filter(dd => evalDirFit === null || (dd.win_likelihood as number) > evalDirFit)
                                .sort((a, b) => (b.win_likelihood ?? 0) - (a.win_likelihood ?? 0))
                                .slice(0, 2)
                                .map(dd => ({ id: dd.id, name: dd.name, show: dd.best_show, category: dd.best_category, fit: dd.win_likelihood }))
                              // Run counts for this direction: active slot + history rows
                              // (evaluation_mode null on legacy rows counts as judge)
                              const judgeRunCount = (evalBoth.judge ? 1 : 0) + dirHistory.filter(h => h.evaluation_mode !== 'coach').length
                              const coachRunCount = (evalBoth.coach ? 1 : 0) + dirHistory.filter(h => h.evaluation_mode === 'coach').length
                              const opportunities = judgeEval && judgeOut && Array.isArray(judgeOut.next_opportunities)
                                ? judgeOut.next_opportunities.map((opp): NextStepOpportunity => ({
                                    ...opp,
                                    existingDirectionId:
                                      realDirs.find(dd =>
                                        sameShow(dd.best_show, opp.show) &&
                                        (dd.best_category ?? '').trim().toLowerCase() === opp.category.trim().toLowerCase()
                                      )?.id ??
                                      realDirs.find(dd => sameShow(dd.best_show, opp.show))?.id ?? null,
                                  }))
                                : null
                              return (
                                <NextStepCard
                                  opportunities={opportunities}
                                  evaluatedShow={dirShow ?? ''}
                                  overallScore={judgeEval ? judgeEval.overall_score : null}
                                  judgeRunCount={judgeRunCount}
                                  coachRunCount={coachRunCount}
                                  hasJudge={hasJudge}
                                  hasCoach={hasCoach}
                                  hasScript={!!(scriptStarted || project?.script_text)}
                                  hasDirections={realDirs.length > 0}
                                  strongerDirections={strongerDirections}
                                  altCategoriesLoading={smartDirectionsLoading[dirId] === 'alternatives'}
                                  actionsDisabled={evaluating || generatingDraft}
                                  onShown={(count) => {
                                    if (nextstepShownRef.current.has(dirId)) return
                                    nextstepShownRef.current.add(dirId)
                                    track('nextstep_shown', { project_id: Number(projectId), direction_id: dirId, opportunity_count: count, view: 'tab' })
                                  }}
                                  onAction={(action: NextStepAction) => {
                                    track('nextstep_clicked', {
                                      project_id: Number(projectId),
                                      direction_id: dirId,
                                      cta: action.type,
                                      ...(action.type === 'view_direction'
                                        ? { target_direction_id: action.directionId, source: action.source, show: action.show ?? null, category: action.category ?? null }
                                        : {}),
                                    })
                                    if (action.type === 'run_coach') { evaluateEntry(dirId, 'coach', evalBoth.coach?.id); return }
                                    if (action.type === 'run_jury') { evaluateEntry(dirId, 'judge', evalBoth.judge?.id); return }
                                    if (action.type === 'video_script') { setTab('script'); return }
                                    if (action.type === 'press_kit') { setTab('presskit'); return }
                                    if (action.type === 'alt_categories') {
                                      const evalForSmart = evalBoth.judge ?? evalBoth.coach
                                      if (evalForSmart) generateSmartDirections(dirId, evalForSmart.id, 'alternatives')
                                      return
                                    }
                                    // Directions-bound CTAs land on the list sorted by fit (Ben, Session 57)
                                    if (action.type === 'view_directions' || action.type === 'view_direction') setDirSortKey('category_fit')
                                    setTab('directions')
                                    if (action.type === 'view_direction') {
                                      spotlightDirection(action.directionId)
                                    } else if (action.type === 'generate_directions') {
                                      generateDirections()
                                    }
                                  }}
                                />
                              )
                            })()}
                          </div>
                          ) : evaluation ? (
                          <div className="px-5 py-5">
                            {/* S160 refactor: the eval payoff render (score header, AOY/
                                SMARTIES/config section breakdowns, 6-dim grid, jury-read /
                                coach output, legacy fallback, changes analysis, fix-this
                                chips) now lives in the reusable EvalBreakdown component.
                                Page-coupled pieces ride in as slots/props below. */}
                            <EvalBreakdown
                              evaluation={evaluation}
                              deltas={deltas}
                              fixChips={{
                                open: fixChipsOpen[dirId] ?? false,
                                selected: draftFocusItems[dirId] || [],
                                onToggleOpen: () => setFixChipsOpen(prev => ({ ...prev, [dirId]: !(prev[dirId] ?? false) })),
                                onToggleItem: (item) => toggleFocusItem(dirId, item),
                              }}
                              marketContextSlot={(() => {
                                /* AOY market-context modifier (S85, Phase 3, Option B):
                                   a bounded, source-cited adjustment shown ALONGSIDE the
                                   calibrated raw score. The raw score never changes; every
                                   nonzero delta names the sourced market fact behind it. */
                                const isAoyJudge = !!(evaluation.output as unknown as { aoy?: boolean } | null)?.aoy && evaluation.evaluation_mode === 'judge'
                                if (!isAoyJudge) return null
                                const adj = aoyMarketAdj[dirId]
                                const showAdj = !!adj && adj.evaluation_id === evaluation.id
                                const busy = marketAdjusting === dirId
                                const err = marketAdjustError[dirId]
                                const mc = showAdj ? adj.market_context : null
                                return (
                                  <div className="mb-5 border border-gray-200 rounded-lg px-3 py-3 bg-gray-50">
                                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                                      <span className="text-xs font-semibold text-gray-600">Market context</span>
                                      {!showAdj && (
                                        <button
                                          onClick={() => applyAoyMarket(dirId, evaluation.id)}
                                          disabled={busy}
                                          className="text-xs font-medium bg-green-800 hover:bg-green-700 text-white px-2.5 py-1 rounded-full disabled:opacity-50"
                                        >
                                          {busy ? 'Adjusting...' : 'Apply market context'}
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">A bounded, sourced adjustment (max ±{adj?.cap ?? 0.5} per section) on top of the calibrated score. The raw score is never altered.</p>
                                    {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
                                    {showAdj && adj.no_baseline && (
                                      <p className="text-xs text-gray-500">No verified market baseline on file for this market and cycle. The raw score stands.</p>
                                    )}
                                    {showAdj && !adj.no_baseline && (
                                      <>
                                        <div className="flex items-baseline gap-3 flex-wrap mb-2">
                                          <span className="text-xs text-gray-500">Raw <span className="font-bold tabular-nums text-gray-700">{adj.raw_overall.toFixed(1)}</span><span className="text-gray-400">/10</span></span>
                                          <span className="text-xs text-gray-500">Market-adjusted{' '}
                                            <span className={`font-bold tabular-nums ${adj.overall_delta > 0 ? 'text-green-700' : adj.overall_delta < 0 ? 'text-red-600' : 'text-gray-700'}`}>{adj.adjusted_overall.toFixed(1)}</span><span className="text-gray-400">/10</span>
                                            {adj.overall_delta !== 0 && <span className={`ml-1 font-semibold ${adj.overall_delta > 0 ? 'text-green-600' : 'text-red-500'}`}>{adj.overall_delta > 0 ? `+${adj.overall_delta}` : adj.overall_delta}</span>}
                                          </span>
                                          {mc && (
                                            <span className="text-xs font-medium bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">
                                              {mc.market}{mc.fallback_to_all ? ' (all-market)' : ` (${mc.discipline})`} · {mc.window_start} to {mc.window_end}
                                            </span>
                                          )}
                                        </div>
                                        {adj.note && <p className="text-xs text-gray-500 mb-2 leading-relaxed">{adj.note}</p>}
                                        <div className="space-y-1">
                                          {adj.sections.filter(s => s.delta !== 0).map(s => (
                                            <div key={s.key} className="text-xs text-gray-600 leading-relaxed">
                                              <span className="font-medium">{s.label}</span>{' '}
                                              <span className={`font-semibold tabular-nums ${s.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>{s.delta > 0 ? `+${s.delta}` : s.delta}</span>{' '}
                                              <span className="text-gray-400 tabular-nums">({s.raw_score} to {s.adjusted_score})</span>
                                              {s.rationale && <span className="text-gray-500"> · {s.rationale}</span>}
                                            </div>
                                          ))}
                                          {adj.sections.every(s => s.delta === 0) && (
                                            <p className="text-xs text-gray-400">No section moved: the market did not materially change how this entry reads.</p>
                                          )}
                                        </div>
                                        {mc && mc.figures.length > 0 && (
                                          <div className="mt-2 pt-2 border-t border-gray-200">
                                            <p className="text-xs text-gray-400 mb-1">Sourced market figures</p>
                                            <ul className="space-y-0.5">
                                              {mc.figures.map((f, i) => (
                                                <li key={i} className="text-xs text-gray-500">
                                                  {f.figure}: {f.value}{f.scope ? ` [${f.scope}]` : ''}
                                                  {f.url && <> · <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">source</a></>}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )
                              })()}
                              improveCtaSlot={
                                /* Generate Improved Draft — prominent CTA anchored to this evaluation */
                                <div className="mt-5 pt-4 border-t border-gray-200">
                                  <button
                                    onClick={() => generateDraft(dirId, evaluation.id)}
                                    disabled={generatingDraft || evaluating}
                                    className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-3 rounded transition-colors flex items-center justify-center gap-2"
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
                                  {generateDraftError && generateDraftErrorDirId === dirId && (
                                    <div className="mt-3"><ErrorBanner error={generateDraftError} /></div>
                                  )}
                                  {generateDraftError && generateDraftErrorDirId === dirId && draftFindingsData?.blocked && draftFindingsData.dirId === dirId && (
                                    <div className="mt-3"><DraftFindings blocked findings={draftFindingsData.findings} hedgedFigures={draftFindingsData.hedgedFigures} /></div>
                                  )}
                                </div>
                              }
                            />
                          </div>
                          ) : null}

                            {/* S160b: advisory coach output (AOY / config) renders under
                                the Coach Review tab in this rail — session-only, never an
                                evaluations row (S93/S112), so it is NOT part of evalBoth
                                and must never write a 0-10 anywhere. Moved here from the
                                full-width panels that sat above the columns. */}
                            {activeView === 'coach' && (
                              <>
                            {isAoyShow(d?.best_show ?? '') && aoyCoaching[dirId] && (() => {
                              const c = aoyCoaching[dirId]
                              // Chunk 5 staleness flag: the persisted/live coaching is
                              // keyed to the draft_generation it was run against. If the
                              // draft has since been regenerated (maxGen is this scope's
                              // current-generation count, same variable the judge/coach
                              // needsReEval check above already uses), say so plainly
                              // instead of silently showing advice for an older draft.
                              const coachStale = maxGen > c.draft_generation
                              return (
                                <div className="px-5 py-5">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-600">✦ AOY Coach review</span>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{c.pillar} pillar</span>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">advisory, not a score</span>
                                  </div>
                                  {coachStale && (
                                    <p className="text-xs text-amber-700 mb-2">Draft changed since this coaching. Re-run AOY Coach for advice on the current version.</p>
                                  )}
                                  {c.overall && <p className="text-sm text-gray-700">{c.overall}</p>}
                                  {c.priorities.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Highest-Leverage Fixes</p>
                                      <ul className="list-disc list-inside space-y-0.5">{c.priorities.map((p, i) => <li key={i} className="text-xs text-gray-600">{p}</li>)}</ul>
                                    </div>
                                  )}
                                  {(() => {
                                    const maxWeight = c.sections.reduce((m, x) => Math.max(m, x.weight || 0), 1)
                                    return (
                                  <div className="mt-3 space-y-2">
                                    {c.sections.map(sec => (
                                      <div key={sec.key} className={`border rounded-lg px-3 py-2.5 ${sec.is_placeholder ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <p className="text-xs font-medium text-gray-800 min-w-0 flex-1">{sec.label}</p>
                                          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{sec.weight}% of score{sec.is_placeholder ? ' · not written' : ''}</span>
                                        </div>
                                        <div className="mt-1.5"><MeterBar fraction={(sec.weight || 0) / maxWeight} color={sec.is_placeholder ? '#d97706' : '#15803d'} /></div>
                                        {sec.missing.length > 0 && <p className="text-xs text-amber-700 mt-1.5">Missing: {sec.missing.join('; ')}</p>}
                                        {sec.suggestions.length > 0 && (
                                          <ul className="list-disc list-inside mt-1 space-y-0.5">{sec.suggestions.map((x, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">{x}</li>)}</ul>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                    )
                                  })()}
                                  {/* Feedback export (S93): clean plain text bundling this
                                      coach review + the latest jury eval, to copy into an
                                      email/message or download. */}
                                  {d && (() => {
                                    const fbInput = {
                                      kind: 'AOY' as const,
                                      category: d.best_category ?? null,
                                      overall: c.overall,
                                      priorities: c.priorities,
                                      sections: c.sections.map(s => ({ label: s.label, weight: s.weight, missing: s.missing, suggestions: s.suggestions })),
                                    }
                                    const copyKey = `aoy-fb-${dirId}`
                                    return (
                                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                                        <button
                                          onClick={() => copyTextWithConfirm(copyKey, buildFeedbackText(d, evalBoth.judge, fbInput), setFeedbackCopied)}
                                          className="text-xs font-medium text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          {feedbackCopied[copyKey] ? '✓ Copied' : 'Copy feedback'}
                                        </button>
                                        <button
                                          onClick={() => downloadCoachFeedback(d, evalBoth.judge, fbInput)}
                                          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          ↓ Feedback .txt
                                        </button>
                                      </div>
                                    )
                                  })()}
                                </div>
                              )
                            })()}
                            {configCoaching[dirId] && (() => {
                              const c = configCoaching[dirId]
                              return (
                                <div className="px-5 py-5">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-600">✦ Coach review</span>
                                    {c.category_key && <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{c.category_key}</span>}
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">advisory, not a score</span>
                                  </div>
                                  {/* framing_degraded (S98 Chunk 4): Coach ran without the
                                      show's full jury framing. Surface it so a generic pass
                                      is visible rather than mistaken for show-calibrated advice. */}
                                  {c.framing_degraded && (
                                    <p className="text-xs text-amber-600 mb-2">Coaching without full show framing. Advice is general; seed this show&apos;s jury framing for show-specific guidance.</p>
                                  )}
                                  {c.overall && <p className="text-sm text-gray-700 leading-relaxed">{c.overall}</p>}
                                  {c.priorities.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Highest-Leverage Fixes</p>
                                      <ul className="list-disc list-inside space-y-0.5">{c.priorities.map((p, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">{p}</li>)}</ul>
                                    </div>
                                  )}
                                  <div className="mt-3 space-y-2">
                                    {c.sections.map(sec => (
                                      <div key={sec.key} className={`border rounded-lg px-3 py-2.5 ${sec.is_placeholder ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{sec.label}{typeof sec.weight === 'number' ? <span className="text-gray-400 font-normal"> {sec.weight}% of score</span> : null}</p>
                                          {sec.is_placeholder && <span className="text-xs text-gray-400 flex-shrink-0">not written</span>}
                                        </div>
                                        {sec.missing.length > 0 && <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">Missing: {sec.missing.join('; ')}</p>}
                                        {sec.suggestions.length > 0 && (
                                          <ul className="list-disc list-inside mt-1 space-y-0.5">{sec.suggestions.map((x, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">{x}</li>)}</ul>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {/* Feedback export: clean plain text bundling this coach
                                      review + the latest jury eval. Weighted -> AOY-shaped
                                      (carries weights), qualitative -> SMARTIES-shaped. */}
                                  {d && (() => {
                                    const fbInput = c.scoring_mode === 'weighted'
                                      ? {
                                          kind: 'AOY' as const,
                                          category: c.category_key,
                                          overall: c.overall,
                                          priorities: c.priorities,
                                          sections: c.sections.map(s => ({ label: s.label, weight: s.weight ?? 0, missing: s.missing, suggestions: s.suggestions })),
                                        }
                                      : {
                                          kind: 'SMARTIES' as const,
                                          category: c.category_key,
                                          overall: c.overall,
                                          priorities: c.priorities,
                                          sections: c.sections.map(s => ({ label: s.label, missing: s.missing, suggestions: s.suggestions })),
                                        }
                                    const copyKey = `config-fb-${dirId}`
                                    return (
                                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                                        <button
                                          onClick={() => copyTextWithConfirm(copyKey, buildFeedbackText(d, evalBoth.judge, fbInput), setFeedbackCopied)}
                                          className="text-xs font-medium text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          {feedbackCopied[copyKey] ? '✓ Copied' : 'Copy feedback'}
                                        </button>
                                        <button
                                          onClick={() => downloadCoachFeedback(d, evalBoth.judge, fbInput)}
                                          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          ↓ Feedback .txt
                                        </button>
                                      </div>
                                    )
                                  })()}
                                </div>
                              )
                            })()}
                              </>
                            )}
                            </div>{/* /collapsible eval breakdown (S152) */}
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
                      </>
                    )
                    const sxsEvalChat = (
                      <>
                        {/* Evaluation Chat — gated on hasJudge || hasCoach, not on the active-mode evaluation,
                             so the section stays mounted when the user switches between judge/coach tabs */}
                        {(hasJudge || hasCoach) && (
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

                                {/* Input row — disabled if active mode has no evaluation yet */}
                                {!evaluation ? (
                                  <p className="text-xs text-gray-400 italic">
                                    Run a {activeMode === 'judge' ? 'Jury Evaluation' : 'Coach Review'} to start chatting about this entry.
                                  </p>
                                ) : (
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
                                    className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors flex-shrink-0"
                                  >
                                    Send
                                  </button>
                                </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                    return (
                      <div key={dirId} id={`aoy-dir-${dirId}`} className={`bg-white border rounded-xl overflow-hidden transition-shadow ${justScoredDirId === dirId ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'}`}>

                        {/* Direction header — Session 57: stacks on mobile. The old
                            single-row flex (right block flex-shrink-0) crushed the
                            title to one word per line on phones. */}
                        <div className={`px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 ${isExpanded ? 'border-b border-gray-200' : ''}`}>
                          {/* Left: clickable toggle (chevron + label + name + show/
                              category + score/fit badges). Collapsing keeps the whole
                              card to this compact header (S91). */}
                          <div className="min-w-0 pt-0.5 flex-1">
                            <button
                              onClick={() => setEntryCardExpanded(prev => ({ ...prev, [dirId]: !isExpanded }))}
                              className="flex items-start gap-2 text-left w-full group"
                              title={isExpanded ? 'Collapse this entry' : 'Expand this entry'}
                            >
                              <span className="text-gray-400 group-hover:text-gray-700 flex-shrink-0 transition-colors text-3xl leading-none w-6 text-center">{isExpanded ? '▾' : '▸'}</span>
                              <span className="min-w-0">
                                <span className="block text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">Direction</span>
                                <span className="block font-medium text-gray-900">{dirName}</span>
                                {dirShow && !(dirName.includes(dirShow) && (!dirCategory || dirName.includes(dirCategory))) && (
                                  <span className="block text-green-700 text-xs mt-0.5">
                                    {dirShow}{dirCategory ? <> · <span className="text-gray-400">{dirCategory}</span></> : null}
                                  </span>
                                )}
                                <span className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {summaryScore != null && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${scoreBg(summaryScore)} ${scoreColor(summaryScore)}`}>{summaryScore}/10</span>
                                  )}
                                  {typeof dirFit === 'number' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 border border-gray-200">{dirFit}% fit</span>
                                  )}
                                  {!isExpanded && needsReEval && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">Draft updated</span>
                                  )}
                                </span>
                              </span>
                            </button>
                            <button
                              onClick={() => setTab('directions')}
                              className="text-xs text-gray-400 hover:text-gray-600 mt-1.5 ml-6 transition-colors"
                            >
                              ← View in Directions
                            </button>
                            {/* Entry Room Slice 1 (24 Aug 2026) — version selector.
                                Only shown once a second generation exists; default
                                (activeGen === maxGen) is unlabeled "current" state. */}
                            {isExpanded && allGens.length > 1 && (
                              <div className="ml-6 mt-1.5">
                                <VersionSelector
                                  generations={allGens}
                                  maxGen={maxGen}
                                  activeGen={activeGen}
                                  onSelect={(gen) => setViewingGen(prev => ({ ...prev, [dirId]: gen === maxGen ? null : gen }))}
                                />
                              </div>
                            )}
                          </div>

                          {/* Right: action buttons — only when expanded; a collapsed
                              card stays compact (S91). */}
                          {isExpanded && (
                          <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto sm:flex-shrink-0">

                            {/* Row 1 — Jury Eval + AOY Coach + Re-Draft */}
                            <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                              <button
                                onClick={() => evaluateEntry(dirId, 'judge', evalBoth.judge?.id)}
                                disabled={evaluating || generatingDraft}
                                title="Evaluate the entry as written — mirrors what a jury member sees"
                                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center justify-center gap-2 sm:w-48"
                              >
                                {isEvaluatingThis && evaluatingMode[dirId] === 'judge' ? (
                                  <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                                ) : (
                                  <>⚖ {hasJudge ? 'Re-run Jury Eval' : 'Jury Evaluation'}</>
                                )}
                              </button>
                              <button
                                onClick={() => evaluateEntry(dirId, 'coach', evalBoth.coach?.id)}
                                disabled={evaluating || generatingDraft || coaching}
                                title="Review the entry and surface what is missing and how to strengthen it"
                                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center justify-center gap-2 sm:w-48"
                              >
                                {((isEvaluatingThis && evaluatingMode[dirId] === 'coach') || (coaching && coachingForDirectionId === dirId)) ? (
                                  <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Coaching…</>
                                ) : isAoyShow(d?.best_show ?? '') ? (
                                  <>✦ {aoyCoaching[dirId] ? 'Re-run AOY Coach' : 'AOY Coach'}</>
                                ) : configModeFor(dirId, d?.best_show) ? (
                                  <>✦ {configCoaching[dirId] ? 'Re-run Coach' : 'Coach Review'}</>
                                ) : (
                                  <>✦ {hasCoach ? 'Re-run Coach Review' : 'Coach Review'}</>
                                )}
                              </button>
                              <button
                                onClick={() => generateDraft(dirId)}
                                disabled={generatingDraft || evaluating}
                                title="Generate a fresh draft for this direction"
                                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 disabled:opacity-40 px-4 py-2 rounded transition-colors flex items-center justify-center gap-2 sm:w-48"
                              >
                                {isGeneratingThis ? (
                                  <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Re-Drafting…</>
                                ) : '↻ Re-Draft'}
                              </button>
                            </div>

                            {/* Row 2 — Share Draft + Share Eval (downloads) */}
                            {((d && getCurrentDraftFields(dirId).length > 0) || (evaluation && d)) && (
                            <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                              {d && getCurrentDraftFields(dirId).length > 0 && (
                                <button
                                  onClick={() => downloadDraft(d)}
                                  className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded transition-colors text-center sm:w-48"
                                  title="Download the current draft as a text file"
                                >
                                  ↓ Share Draft
                                </button>
                              )}
                              {evaluation && d && (
                                <button
                                  onClick={() => downloadEvaluation(d, evaluation)}
                                  className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded transition-colors text-center sm:w-48"
                                  title="Download the evaluation report as a text file"
                                >
                                  ↓ Share Eval
                                </button>
                              )}
                            </div>
                            )}

                            {/* Row 3 — Alt Categories / Alt Shows (post-eval) or Suggest Directions (pre-eval) */}
                            <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                              {(hasJudge || hasCoach) ? (
                                <>
                                  <button
                                    onClick={() => {
                                      const evalForSmart = evalBoth.judge ?? evalBoth.coach
                                      if (evalForSmart) generateSmartDirections(dirId, evalForSmart.id, 'alternatives')
                                    }}
                                    disabled={evaluating || generatingDraft || !!smartDirectionsLoading[dirId]}
                                    title="Suggest alternative categories in the same show, informed by this evaluation"
                                    className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 sm:w-48"
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
                                    className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 sm:w-48"
                                  >
                                    {smartDirectionsLoading[dirId] === 'other_shows' ? (
                                      <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Finding…</>
                                    ) : '✦ Alt Shows'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setTab('directions')}
                                  className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center justify-center gap-1.5 sm:w-48"
                                  title="Explore AI-recommended show and category directions"
                                >
                                  <span>Suggest Directions</span>
                                  <span>→</span>
                                </button>
                              )}
                            </div>

                          </div>
                          )}
                        </div>

                        {isExpanded && (<>
                        {/* ── Jury intelligence panel — "What wins at this show" ──────────── */}
                        {/* Shown only when a show_profiles row exists for this direction's show.
                            Collapsed by default. Uses the same show_profiles query pattern as the
                            evaluate-entry and generate-draft edge functions. */}
                        {showProfiles[dirId] && (
                          <div className="border-b border-gray-100">
                            <button
                              onClick={() => setShowProfileOpen(prev => ({ ...prev, [dirId]: !prev[dirId] }))}
                              className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">🎯</span>
                                <span className="text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors">
                                  What wins at {dirShow || showProfiles[dirId]!.show_name}
                                </span>
                                {dirCategory && showProfiles[dirId]!.show_name && (
                                  <span className="text-xs text-gray-300">· {dirCategory}</span>
                                )}
                              </div>
                              <span className="text-gray-300 text-xs group-hover:text-gray-400 transition-colors">
                                {showProfileOpen[dirId] ? '▲' : '▼'}
                              </span>
                            </button>

                            {showProfileOpen[dirId] && (
                              <div className="px-5 pb-5 pt-3 bg-gray-50 space-y-4">
                                {showProfiles[dirId]!.judging_philosophy && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Judging philosophy</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{showProfiles[dirId]!.judging_philosophy}</p>
                                  </div>
                                )}
                                {showProfiles[dirId]!.scoring_emphasis && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">What they score on</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{showProfiles[dirId]!.scoring_emphasis}</p>
                                  </div>
                                )}
                                {showProfiles[dirId]!.common_mistakes && (
                                  <div>
                                    <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1.5">Common mistakes</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{showProfiles[dirId]!.common_mistakes}</p>
                                  </div>
                                )}
                                {showProfiles[dirId]!.language_guidance && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Language & tone</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{showProfiles[dirId]!.language_guidance}</p>
                                  </div>
                                )}
                                {showProfiles[dirId]!.jury_composition_notes && (
                                  <p className="text-xs text-gray-400 pt-3 border-t border-gray-200 leading-relaxed">
                                    {showProfiles[dirId]!.jury_composition_notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Jury Profile Intelligence panel — "Who judges this show" ──────── */}
                        {/* Phase 1: static 2021-2026 dataset. Shows composition, president signal,
                            and historical win patterns. No individual names exposed. */}
                        {dirShow && juryShowCells[dirShow] && juryShowCells[dirShow].length > 0 && (
                          <JuryProfilePanel
                            showName={dirShow}
                            category={dirCategory ?? ''}
                            cells={juryShowCells[dirShow]}
                            regionalUplift={regionalUplift}
                            isOpen={!!juryPanelOpen[dirId]}
                            onToggle={() => setJuryPanelOpen(prev => ({ ...prev, [dirId]: !prev[dirId] }))}
                          />
                        )}

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
                              /* coach run feels different from the click: gold (opportunity/craft) vs the jury's green */
                              accent={evaluatingMode[dirId] === 'coach' ? '#c9a95c' : '#15803d'}
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
                                disabled={evaluating || generatingDraft || coaching}
                                className="text-xs font-medium text-amber-800 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {((isEvaluatingThis && evaluatingMode[dirId] === 'coach') || (coaching && coachingForDirectionId === dirId)) ? (
                                  <><svg className="animate-spin h-3 w-3 inline mr-1" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Coaching…</>
                                ) : isAoyShow(d?.best_show ?? '') ? (
                                  <>✦ {aoyCoaching[dirId] ? 'Re-run AOY Coach' : 'AOY Coach'}</>
                                ) : configModeFor(dirId, d?.best_show) ? (
                                  <>✦ {configCoaching[dirId] ? 'Re-run Coach' : 'Coach Review'}</>
                                ) : (
                                  <>✦ {hasCoach ? 'Re-run Coach Review' : 'Coach Review'}</>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* AOY Coach error banner (the coach RESULT panel moved into the
                            eval rail's Coach Review tab, S160b). Kept out here so a failed
                            run stays visible even when no coaching result/tab exists. */}
                        {isAoyShow(d?.best_show ?? '') && coachingError && coachingForDirectionId === dirId && (
                          <div className="px-5 py-3 border-b border-gray-200"><ErrorBanner error={coachingError} /></div>
                        )}

                        {/* Config Coach error banner — same posture as the AOY one above
                            (result panel lives in the eval rail's Coach Review tab, S160b). */}
                        {configModeFor(dirId, d?.best_show) && coachingError && coachingForDirectionId === dirId && (
                          <div className="px-5 py-3 border-b border-gray-200"><ErrorBanner error={coachingError} /></div>
                        )}
                        {isHistorical ? (
                          <>
                            <HistoricalViewBanner
                              gen={activeGen}
                              totalGens={allGens.length}
                              onReturn={() => setViewingGen(prev => ({ ...prev, [dirId]: null }))}
                            />
                            <div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start px-5 py-5">
                              <div className="w-full min-w-0 lg:flex-1">
                                <ReadOnlyVersionFields fields={readOnlyFields} sectionScores={viewSectionScores} />
                              </div>
                              <div className="w-full min-w-0 lg:w-[360px] lg:flex-shrink-0 lg:sticky lg:top-4 lg:self-start">
                                <div className="bg-white border border-gray-200 rounded-xl p-4">
                                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                      {activeMode === 'coach' ? 'Coach review' : 'Jury evaluation'} — v{activeGen}
                                    </span>
                                    <VersionDeltaChip state={versionDelta.state} delta={versionDelta.delta} priorGen={priorEvaluatedGenNum} />
                                  </div>
                                  {thisVersionEval ? (
                                    <div className="flex items-baseline gap-2">
                                      <span className={`text-3xl font-bold tabular-nums ${scoreColor(thisVersionEval.overall_score)}`}>{thisVersionEval.overall_score.toFixed(1)}</span>
                                      <span className="text-sm text-gray-400">/10</span>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-400">No evaluation was run on this version.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : sideBySidePreview ? (
                          <>
                            <div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
                              <div className="w-full min-w-0 lg:flex-1">
                                {sxsEditSurface}
                              </div>
                              <div className="w-full min-w-0 lg:w-[360px] lg:flex-shrink-0 lg:sticky lg:top-4 lg:self-start">
                                {sxsEvalTop}
                                {sxsEvalChat}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {sxsEvalTop}
                            {sxsEvalChat}
                            {sxsEditSurface}
                          </>
                        )}
                        </>)}

                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── VIDEO SCRIPT (extracted, R2) ── */}
        <div className={tab === 'script' ? '' : 'hidden'}>
          <VideoScriptTab
            tab={tab}
            projectId={projectId}
            project={project}
            setProject={setProject}
            directions={directions}
            entries={entries}
            evaluations={evaluations}
            user={user}
            guidanceEnabled={guidanceEnabled}
            projectIsAoy={projectIsAoy}
            kbShows={kbShows}
            showsStrip={showsStrip}
            getToken={getToken}
            materialHasText={materialHasText}
            fetchMaterialText={fetchMaterialText}
            getEntryDraftContent={getEntryDraftContent}
            track={track}
            setShowRequestName={setShowRequestName}
            setShowRequestUrl={setShowRequestUrl}
            setShowRequestMarket={setShowRequestMarket}
            setShowRequestKitUrl={setShowRequestKitUrl}
            setShowRequestDone={setShowRequestDone}
            setShowRequestNoKit={setShowRequestNoKit}
            setShowRequestModal={setShowRequestModal}
            onScriptStartedChange={setScriptStarted}
          />
        </div>

        {/* ── PRESS KIT (extracted, R1) ── */}
        <div className={tab === 'presskit' ? '' : 'hidden'}>
          <PressKitTab
            tab={tab}
            projectId={projectId}
            project={project}
            directions={directions}
            entries={entries}
            collaborators={collaborators}
            orgPressProfile={orgPressProfile}
            guidanceEnabled={guidanceEnabled}
            getToken={getToken}
            getCurrentDraftFields={getCurrentDraftFields}
            resolveFieldContent={resolveFieldContent}
            copyTextWithConfirm={copyTextWithConfirm}
            track={track}
            onStartedChange={setPressKitStarted}
          />
        </div>

      </main>

      {/* ── GEOGRAPHIC ELIGIBILITY WARNING MODAL ── */}
      {showGeoWarningModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-red-500 text-base">⚠</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Eligibility warning</h3>
                <p className="text-sm text-gray-500 mt-0.5">The following shows have geographic entry restrictions. Generating directions for an ineligible campaign wastes your submission budget.</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {geoWarnings.map(w => (
                <div key={w.show} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-red-800">{w.show}</p>
                  <p className="text-xs text-red-700 mt-0.5">{w.rule}</p>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-3 cursor-pointer mb-5 p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <input
                type="checkbox"
                id="geoConfirm"
                className="mt-0.5 flex-shrink-0 accent-green-700"
                onChange={e => {
                  const btn = document.getElementById('geoConfirmBtn') as HTMLButtonElement | null
                  if (btn) btn.disabled = !e.target.checked
                }}
              />
              <span className="text-sm text-gray-700">I confirm this campaign is eligible for the show{geoWarnings.length > 1 ? 's' : ''} listed above and understand that entering an ineligible campaign will result in disqualification without refund.</span>
            </label>
            <div className="flex gap-3">
              <button
                id="geoConfirmBtn"
                disabled
                onClick={() => { setShowGeoWarningModal(false); generateDirections(true) }}
                className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors">
                Confirmed — generate directions
              </button>
              <button
                onClick={() => { setShowGeoWarningModal(false); setGeoWarnings([]) }}
                className="flex-1 border border-gray-300 text-gray-700 hover:border-gray-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

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

            {/* Detection banner */}
            {quickEvalDetecting && (
              <div className="mb-4 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <svg className="animate-spin h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-xs text-gray-400">Detecting show and category from document…</span>
              </div>
            )}
            {!quickEvalDetecting && (quickEvalDetectedFields.show || quickEvalDetectedFields.category) && (
              <div className={`mb-4 border rounded-lg px-3 py-2 ${
                quickEvalDetectedFields.confidence === 'low'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <p className={`text-xs ${quickEvalDetectedFields.confidence === 'low' ? 'text-amber-700' : 'text-green-700'}`}>
                  {quickEvalDetectedFields.confidence === 'low'
                    ? '⚠ Possible match detected — please verify before evaluating.'
                    : '✓ Detected from document — review and edit if needed.'}
                </p>
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs text-gray-500">Award Show</label>
                  {quickEvalDetectedFields.show && !quickEvalDetecting && (
                    <span className={`text-xs font-medium ${quickEvalDetectedFields.confidence === 'low' ? 'text-amber-600' : 'text-green-600'}`}>
                      {quickEvalDetectedFields.confidence === 'low' ? '? verify' : '✓ detected'}
                    </span>
                  )}
                </div>
                {/* Quick-select chips from project target shows */}
                {(project.target_shows ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(project.target_shows ?? []).map((show: string) => (
                      <button
                        key={show}
                        type="button"
                        onClick={() => { setQuickEvalShow(show); setQuickEvalCategory(''); setQuickEvalDetectedFields(prev => ({ ...prev, show: false, category: false })); setQuickEvalSuggestion(null) }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          quickEvalShow === show
                            ? 'bg-green-100 text-green-800 border-green-300 font-medium'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'
                        }`}
                      >
                        {show}
                      </button>
                    ))}
                  </div>
                )}
                <ShowCombobox
                  value={quickEvalShow}
                  onChange={v => {
                    setQuickEvalShow(v)
                    // Session 99: a no-category show (Women to Watch) has no field to
                    // fill; write the fixed placeholder directly instead of '' so the
                    // resolver has something to store on the direction immediately.
                    setQuickEvalCategory(showHasNoCategoryConcept(v) ? NO_CATEGORY_PLACEHOLDER : '')
                    setQuickEvalDetectedFields(prev => ({ ...prev, show: false }))
                    setQuickEvalSuggestion(null)
                  }}
                  options={Array.from(new Set([...(project.target_shows ?? []), ...kbShows]))}
                  placeholder={(project.target_shows ?? []).length > 0 ? 'Or type another show…' : 'e.g. Cannes Lions, Effies APAC, WARC…'}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs text-gray-500">Category{showHasNoCategoryList(quickEvalShow) ? ' (optional)' : ''}</label>
                  {!isAoyShow(quickEvalShow) && !showHasNoCategoryConcept(quickEvalShow) && quickEvalDetectedFields.category && !quickEvalDetecting && (
                    <span className={`text-xs font-medium ${quickEvalDetectedFields.confidence === 'low' ? 'text-amber-600' : 'text-green-600'}`}>
                      {quickEvalDetectedFields.confidence === 'low' ? '? verify' : '✓ detected'}
                    </span>
                  )}
                  {!isAoyShow(quickEvalShow) && !showHasNoCategoryConcept(quickEvalShow) && quickEvalSuggestion && quickEvalCategory && !quickEvalSuggesting && (
                    <span className={`text-xs font-medium ${quickEvalSuggestion.confidence === 'low' ? 'text-amber-600' : 'text-green-600'}`}>
                      ✦ suggested
                    </span>
                  )}
                  {/* Session 52 — for users who don't know the right category (non-AOY,
                      non-no-category-show only: "suggest for me" has nothing to suggest
                      among zero candidates and hard-fails, S99 bug report). */}
                  {!isAoyShow(quickEvalShow) && !showHasNoCategoryConcept(quickEvalShow) && categoriesForShow(quickEvalShow).length > 0 && (
                    <button
                      type="button"
                      onClick={suggestQuickEvalCategory}
                      disabled={quickEvalSuggesting || quickEvaluating || quickEvalDetecting || !quickEvalShow.trim()}
                      title={!quickEvalShow.trim() ? 'Choose an award show first' : 'Recommend the best-fit category based on the entry content'}
                      className="ml-auto text-xs font-medium text-green-700 hover:text-green-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {quickEvalSuggesting ? 'Suggesting…' : "Don't know? Suggest for me"}
                    </button>
                  )}
                </div>

                {isAoyShow(quickEvalShow) ? (
                  /* Session 72 — Campaign AOY controlled, market-scoped picker.
                     Writes a canonical best_category that resolves to a rubric stem.
                     Keyed on the show string so it resets when the show changes. */
                  <AoyEntryPicker key={`qe-${quickEvalShow}`} onChange={v => setQuickEvalCategory(v)} />
                ) : showHasNoCategoryConcept(quickEvalShow) ? (
                  /* Session 99: Women to Watch judges one uniform nomination form, no
                     category to pick. Show a static note instead of a free-text box
                     that invites a meaningless answer, and skip "Suggest for me"
                     entirely (nothing to suggest among zero candidates). */
                  <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    This show has one uniform nomination form — no category to choose.
                  </p>
                ) : (
                  <>
                    {/* Free-text category input with optional suggestions for known shows */}
                    <input
                      type="text"
                      list="quickeval-categories"
                      value={quickEvalCategory}
                      onChange={e => { setQuickEvalCategory(e.target.value); setQuickEvalDetectedFields(prev => ({ ...prev, category: false })); setQuickEvalSuggestion(null) }}
                      placeholder={categoryPlaceholderForShow(quickEvalShow)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
                    />
                    <datalist id="quickeval-categories">
                      {categoriesForShow(quickEvalShow).map((cat: string) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                    {quickEvalSuggestion && quickEvalCategory && (
                      <p className={`text-xs mt-1.5 ${quickEvalSuggestion.confidence === 'low' ? 'text-amber-600' : 'text-gray-500'}`}>
                        {quickEvalSuggestion.rationale || 'Suggested from the entry content — review before evaluating.'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {quickEvalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-red-600 text-xs">{quickEvalError}</p>
              </div>
            )}

            {quickEvaluating && (() => {
              const isAoyUploadEval = isAoyShow(quickEvalShow.trim())
              return (
                <div className="mb-4">
                  <GeneratingBar
                    isGenerating={quickEvaluating}
                    estimatedDuration={isAoyUploadEval ? 165000 : 50000}
                    statements={isAoyUploadEval ? JURY_EVAL_STATEMENTS : MATERIALS_EVAL_STATEMENTS}
                  />
                  {isAoyUploadEval && (
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      {quickEvalPhase === 'segmenting'
                        ? 'Step 1 of 2: mapping your entry onto the rubric sections…'
                        : quickEvalPhase === 'scoring'
                        ? 'Step 2 of 2: scoring each weighted section…'
                        : 'Preparing…'}
                      {' '}This runs two AI passes and can take up to about 3 minutes. Keep this tab open.
                    </p>
                  )}
                </div>
              )
            })()}

            <div className="flex gap-3">
              <button
                onClick={evaluateUploadedEntry}
                disabled={quickEvaluating}
                className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors flex items-center justify-center gap-2"
              >
                {quickEvaluating ? (
                  <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Evaluating…</>
                ) : 'Evaluate Entry'}
              </button>
              <button
                onClick={() => { setShowQuickEvalModal(false); setQuickEvalError(''); setQuickEvalDetecting(false); setQuickEvalDetectedFields({ show: false, category: false, confidence: undefined }); setQuickEvalSuggestion(null) }}
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
                  {showRequestError && (
                    <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{showRequestError}</p>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={submitShowRequest}
                      disabled={showRequestSubmitting}
                      className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded transition-colors"
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

      <ShowsDrawer
        open={showsDrawerOpen}
        onClose={() => setShowsDrawerOpen(false)}
        initialTab={showsDrawerTab}
        directions={directions}
        orgId={orgId}
      />

    </div>
  )
}
