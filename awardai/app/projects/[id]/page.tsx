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
import { appErrorFromResponse, formatError, parseErrorString } from '@/lib/errorMessages'
import { computeRoiIndex, normaliseKbShow, DEADLINES_2026 } from '@/lib/shows-data'
import { isAoyShow, AOY_SHOW_NAME, aoyResolveStored, aoyTrackById, buildAoyBestCategory, pillarForKey, normalizeAoyCategory, type AoyPillar } from '@/lib/aoy-taxonomy'
// Workbench P2 Chunk 1 (S138): source-agnostic section-workbench surface. Rendered
// read-only behind ?workbench=1 this phase; the write-path cutover is P2 Chunk 4.
import SectionWorkbench, { type SectionRevision } from '@/components/SectionWorkbench'
import EvalSummaryBar from '@/components/EvalSummaryBar'
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

// ── ErrorBanner — renders a friendly message with a small diagnostic code ────
// Expects error strings in "message [CODE]" format from formatError().
// Falls back gracefully for plain strings.
function ErrorBanner({ error }: { error: string }) {
  const { message, code } = parseErrorString(error)
  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p className="text-red-600 text-sm">{message}</p>
      {code && (
        <p className="text-red-300 text-xs font-mono mt-1 select-all">{code}</p>
      )}
    </div>
  )
}

// ── TonalBrief — structured production brief returned by generate-tonal-brief ─
type ColorSwatch = { hex: string; name: string; role: string }

// ── Collaborator ──────────────────────────────────────────────────────────────
type CollabType =
  | 'lead_agency' | 'creative_agency' | 'media_agency'
  | 'production_company' | 'pr_agency' | 'brand_team' | 'tech_partner' | 'other'

const COLLAB_TYPE_LABELS: Record<CollabType, string> = {
  lead_agency:        'Lead Agency',
  creative_agency:    'Creative Agency',
  media_agency:       'Media Agency',
  production_company: 'Production Company',
  pr_agency:          'PR Agency',
  brand_team:         'Brand / Client Team',
  tech_partner:       'Technology Partner',
  other:              'Other',
}

type Collaborator = {
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
type OrgPressProfile = {
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
type PressKitExtra = {
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
  base_win_rate: number | null
}

// ── Press Kit Draft — persisted AI copy with up to 3 versions ────────────────
// project_id + direction_id + id are all bigint in the DB (bigint PK pattern used across all tables)
type PressKitDraftRow = {
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

type TonalBrief = {
  summary: string
  mood: string
  color_palette: ColorSwatch[]
  typography: string
  vo_style: string
  music_style: string
  brand_notes: string
}

// Canonical list of award shows — displayed in the Brief tab selector
// Derived from shows-data.ts — single source of truth for show names.
// To add or remove shows, update DEADLINES_2026 in lib/shows-data.ts.
const CANONICAL_SHOWS = DEADLINES_2026.map(d => d.show).sort((a, b) => a.localeCompare(b))

// Comprehensive category lists per award show — used in Script tab dropdowns
// Session 52: tolerant category lookup. SHOW_CATEGORIES is keyed by exact
// canonical names, but show fields are free text and detection's keyword map
// historically emitted variants ('Effies', 'New York Festivals') that matched
// no key — the user saw an empty category dropdown and a dead end. ALWAYS use
// categoriesForShow() to read category lists; never index SHOW_CATEGORIES
// directly.
const SHOW_CATEGORY_ALIASES: Record<string, string> = {
  'effies': 'Effie APAC',
  'effie': 'Effie APAC',
  'effies apac': 'Effie APAC',
  'effie awards': 'Effie APAC',
  'asia pacific effie awards': 'Effie APAC',
  'new york festivals': 'New York Festivals Advertising Awards',
  'nyf': 'New York Festivals Advertising Awards',
  'cannes': 'Cannes Lions',
  'spikes': 'Spikes Asia',
  'warc': 'WARC Awards',
  'one show': 'One Show',
  'mma smarties': 'MMA Smarties APAC',
  'smarties': 'MMA Smarties APAC',
  'smarties apac': 'MMA Smarties APAC',
  // SMARTIES uses one global category framework — Global reuses the APAC list
  'mma smarties global': 'MMA Smarties APAC',
  'smarties global': 'MMA Smarties APAC',
  'andy awards': 'ANDY Awards',
}

const categoriesForShow = (showName: string): string[] => {
  const name = (showName || '').trim()
  if (!name) return []
  if (SHOW_CATEGORIES[name]) return SHOW_CATEGORIES[name]
  const lower = name.toLowerCase()
  const ciKey = Object.keys(SHOW_CATEGORIES).find(k => k.toLowerCase() === lower)
  if (ciKey) return SHOW_CATEGORIES[ciKey]
  const alias = SHOW_CATEGORY_ALIASES[lower]
  if (alias && SHOW_CATEGORIES[alias]) return SHOW_CATEGORIES[alias]
  return []
}

// Session 99 — shows with NO category concept at all, not just an undocumented
// list. Distinct from Clio Entertainment/Sports/Creators/ANDY/Gerety/ROI
// Festival (categoriesForShow() also returns [] for those, but real categories
// exist and are simply not yet in SHOW_CATEGORIES per the research pipeline —
// never conflate "not yet documented" with "does not exist"). Women to Watch
// judges ONE uniform nomination form per the verified entry kit (Show-Pilots-
// EntryForm-Research-2026-07-01.md §1): there is no category to pick, so the
// free-text input + "Suggest for me" (which 500s on an empty candidate list,
// S99 bug report) are both the wrong UI here, not just unpopulated.
const NO_CATEGORY_SHOWS = ['Campaign Asia Women to Watch APAC']
const showHasNoCategoryConcept = (showName: string): boolean =>
  NO_CATEGORY_SHOWS.some(s => s.toLowerCase() === (showName || '').trim().toLowerCase())
// The fixed value written to best_category for a no-category show. Any string
// is functionally safe (the config resolver's category-exact lookup always
// misses and falls back to the show-level entry_form row — the only row these
// shows have), so this is chosen for display only.
const NO_CATEGORY_PLACEHOLDER = 'Nomination'

// A show whose category list is not yet seeded in SHOW_CATEGORIES (SABRE, Clio
// Entertainment/Sports/Creators, ANDY, Gerety, ROI Festival). Real categories
// exist (unlike showHasNoCategoryConcept); they are simply not documented yet, so
// categoriesForShow() returns []. For these, "Suggest for me" has zero candidates
// and 500s, and forcing a required category is a dead end, so category is optional
// and the suggest button is hidden until the taxonomy is seeded. Both gates key
// off categoriesForShow(), so seeding the list restores both (self-heal).
const showHasNoCategoryList = (showName: string): boolean =>
  !isAoyShow(showName) &&
  !showHasNoCategoryConcept(showName) &&
  categoriesForShow(showName).length === 0

// Build 2 (Session 55): candidate list sent to evaluate-entry for the
// next_opportunities field (judge mode). Only shows with verified category
// lists qualify (SHOW_CATEGORIES keys) — the no-category-list shows are
// automatically excluded, and the show being evaluated is excluded here AND
// re-enforced server-side (Session 52 suggest-mode pattern). Old edge
// functions ignore the param; old frontends send nothing — deploy-order safe
// in both directions.
const buildNextCandidates = (excludeShow: string): { show: string; categories: string[] }[] => {
  const ex = (excludeShow || '').trim().toLowerCase()
  return Object.keys(SHOW_CATEGORIES)
    .filter(s => s.toLowerCase() !== ex)
    .map(s => ({ show: s, categories: SHOW_CATEGORIES[s] }))
}

// Session 55 feedback round: direction show names are FREE TEXT from
// generate-directions (legacy rows especially carry variants like 'Effies' or
// 'Spikes'), while Next Step suggestions are canonical. Tolerant comparison:
// alias-normalise both sides, then case-insensitive equality. Never compare
// show names with === when one side comes from a direction row.
const sameShow = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false
  const norm = (s: string) => (normaliseKbShow(s) ?? s).trim().toLowerCase()
  return norm(a) === norm(b)
}

// SMARTIES show detection. Byte-aligned with the copies in
// generate-smarties-draft.ts and evaluate-smarties-entry.ts: "smarties" is unique
// to MMA among canonical show names, so the substring is the reliable signal (the
// keyword map routes every variant to "MMA Smarties APAC" / "MMA Smarties Global").
function isSmartiesShow(showName: string | null | undefined): boolean {
  return (showName ?? '').trim().toLowerCase().includes('smarties')
}

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
  'Effie APAC': [
    'Best Insights & Strategic Thinking', 'Best Integrated Campaign',
    'Best Launch', 'Best Long-Term Effects', 'Best New Product/Service',
    'Best Use of Data', 'Best Use of Digital', 'Best Use of Media', 'B2B',
    'Challenger Brand', 'Cultural Breakthrough', 'David vs. Goliath',
    'E-Commerce / Shopper Marketing', 'Engagement & Retention', 'Grand Effie',
    'Health & Wellness', 'Local Brand', 'Purpose-Driven Marketing',
    'Seasonal Marketing', 'Sustained Success',
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
    'Audio & Radio', 'Brand Experience & Activation', 'Creative B2B',
    'Creative Commerce', 'Creative Data', 'Creative Effectiveness',
    'Creative Strategy', 'Design', 'Digital Craft', 'Direct', 'Entertainment',
    'Film', 'Film Craft', 'Gaming', 'Glass: The Award for Change', 'Healthcare',
    'Industry Craft', 'Innovation', 'Integrated', 'Media', 'Music', 'Outdoor',
    'PR', 'Print & Publishing', 'Social & Creator',
  ],
  'Dubai Lynx': [
    'Brand Experience & Activation', 'Creative Commerce', 'Creative Data',
    'Creative Strategy', 'Design', 'Digital', 'Direct', 'Entertainment',
    'Film', 'Film Craft', 'Health & Wellness', 'Innovation', 'Integrated',
    'Media', 'Mobile', 'Outdoor', 'PR', 'Print & Publishing', 'Radio & Audio',
    'Social & Influencer', 'Sustainable Development Goals',
  ],
  'Eurobest': [
    'Audio & Radio', 'Brand Experience & Activation', 'Creative B2B',
    'Creative Business Transformation', 'Creative Commerce', 'Creative Data',
    'Creative Effectiveness', 'Creative Strategy', 'Design', 'Digital Craft',
    'Direct', 'Entertainment', 'Film', 'Film Craft',
    'Glass: The Award for Change', 'Healthcare', 'Industry Craft',
    'Innovation', 'Integrated', 'Media', 'Outdoor', 'PR',
    'Print & Publishing', 'Social & Creator',
  ],
  'New York Festivals Advertising Awards': [
    'Advertising', 'Brand Design', 'Entertainment', 'Gaming',
    'Health & Wellness', 'Innovation', 'Interactive', 'Out of Home',
    'Branded Film', 'Radio & Audio', 'TV & Cinema',
  ],
  'London International Awards': [
    'Ambient & Activation',
    'Billboard',
    'Branded Content & Entertainment',
    'Creativity in Business-to-Business',
    'Creative Use of Data',
    'Creativity in the Metaverse',
    'Creativity in PR',
    'Design',
    'Digital',
    'Evolution',
    'Health & Wellness',
    'Health & Wellness – Craft',
    'Integration',
    'Music & Sound',
    'Music Video',
    'Non-Traditional',
    'Online Film',
    'Package Design',
    'Pharma & Medical',
    'Pharma & Medical – Craft',
    'Poster',
    'Print',
    'Production & Post-Production',
    'Radio & Audio',
    'Social Media & Influencers',
    'Television/Cinema',
    'Transformative Business Impact',
    'Sports',
    'Gaming',
    'Cultural Catalyst',
    'Entertainment & Content',
    'Business Transformation',
    'Democracy and Human Rights',
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
    'Film', 'Print', 'Radio', 'Digital', 'Integrated Campaigns',
    'Design', 'PR & Events', 'Experiential', 'Branded Content',
    'Film Craft', 'Print Craft', 'Social Media', 'Influencer Marketing',
    'Data-Driven', 'Artificial Intelligence', 'Virtual & Augmented Reality',
    'Sports Marketing', 'Seasonal Advertising', 'Humour', 'Public Interest',
    'B2B & Corporate', 'News-Jacking', 'Cultural Insight', 'Celebrity Collaborations',
    'Media Usage', 'Alternative Media', 'Self-Promotion',
  ],
  'Webby Awards': [
    'Websites & Mobile Sites', 'Video & Film', 'Advertising Media & PR',
    'Podcasts', 'Social & Games', 'Apps Software & Immersive', 'Creators', 'AI',
    'Branded Entertainment', 'Social Campaigns', 'PR Campaigns',
    'Branded Content', 'Integrated Campaign', 'Digital Campaign',
    'Interactive Online & Mobile', 'Experiential',
  ],
  'SABRE Awards Asia-Pacific': [
    'Consumer Marketing',
    'Corporate Reputation & Brand Communications',
    'Crisis & Issues Management',
    'Digital, Social & Influencer',
    'Employee Communications',
    'Financial & Investor Relations',
    'Government & Public Affairs',
    'Healthcare & Wellness',
    'Not-for-Profit & Social Impact',
    'Sustainability & ESG',
    'Technology',
    'Diamond SABRE — Long-term Reputation / Sustained Programme',
    'IN2 SABRE — Best Earned Media',
    'IN2 SABRE — Best Content',
    'IN2 SABRE — Best Data-Led Campaign',
    'IN2 SABRE — Best Digital/Social Campaign',
    'Innovation SABRE',
    'Geographic: Southeast Asia',
    'Geographic: North Asia',
    'Geographic: Australia/New Zealand',
    'Geographic: APAC Multi-Market',
    'Agency of the Year',
  ],
  'Global SABRE Awards': [
    'Best in Show (Top 40 Campaigns Worldwide)',
    'Global Agency of the Year',
    'Global Independent Agency of the Year',
    'Consumer Marketing',
    'Corporate Reputation',
    'Crisis Management',
    'Digital & Social',
    'Employee Communications',
    'Public Affairs',
    'Healthcare',
    'Sustainability & ESG',
    'Diamond SABRE — Long-term Reputation',
    'IN2 SABRE — Earned Media Excellence',
  ],
  'ICCO Global Awards': [
    'Large Consultancy of the Year',
    'Mid-size Consultancy of the Year',
    'Championing Diversity Award',
    'PR Leader of the Year',
    'Rising Star of the Year',
    'Automotive & Transport',
    'Technology',
    'Not-for-Profit or Charity',
    'Health, Wellness & Wellbeing',
    'Infrastructure (Construction, Energy, Manufacturing & Real Estate)',
    'Consumer, Sports & Entertainment',
    'Best Digital, New Media & Influencer',
    'Best B2B',
    'Best Internal Comms & Employer Branding',
    'Best ESG',
    'Best Strategy and Evaluation in a Campaign',
    'Best Media Relations',
    'Best Public Affairs',
    'Best Event, Launch or Stunt',
    'Best Crisis Management',
    'Campaign of the Year: Europe',
    'Campaign of the Year: Asia-Pacific, Middle East & Africa',
  ],
  'PRCA UK Awards': [
    'Automotive & Transport',
    'B2B',
    'B2B Technology',
    'Broadcast',
    'Consumer (High Budget)',
    'Consumer (Low Budget)',
    'Consumer Technology',
    'Corporate, Financial & Investor Relations',
    'Crisis & Issues Management',
    'Digital & Social Media',
    'Diversity, Equity & Inclusion',
    'Employee Engagement',
    'Health & Wellbeing',
    'International Campaign',
    'Media Relations',
    'Not-for-Profit & Charity',
    'Public Sector',
    'Purpose',
    'Small Consultancy',
    'Medium Consultancy',
    'Large Consultancy',
    'Specialist Consultancy',
    'New Consultancy',
    'International Consultancy',
    'In-House Team (Private Sector)',
    'In-House Team (Public Sector)',
    'Young Communicator of the Year',
    'PR Leader of the Year',
  ],
  'PRCA APAC Awards': [
    'Agency of the Year',
    'Small Consultancy of the Year',
    'Campaign of the Year',
    'B2B',
    'Consumer PR',
    'Corporate Communications',
    'Crisis & Issues Management',
    'Digital PR',
    'Employee Engagement',
    'Public Affairs',
    'Purpose & Sustainability',
    'Individual Award',
  ],
  'Shorty Awards': [
    'B2B', 'Brand Strategy', 'Community', 'Content Series',
    'Creative Use of Technology', 'Events & Experiential', 'Gaming',
    'Integration', 'Live Events', 'Long Form Video', 'Rebranding',
    'Short Form Video', 'Social Good', 'Social Media', 'Storytelling',
    'Use of Influencers',
  ],
  'Festival of Media APAC': [
    'Best Branded Content', 'Best Campaign for a Holiday or Celebration',
    'Best Campaign for a Specific Audience', 'Best Cause Campaign',
    'Best Communications Strategy', 'Best Engagement Strategy',
    'Best Event and Experiential Campaign', 'Best Integrated Campaign',
    'Best Launch or Relaunch Campaign', 'Best Local Brand Campaign',
    'Best Local Execution of a Global Brand', 'Best Music Marketing Campaign',
    'Best Partnership', 'Best Response Campaign', 'Best Viral Campaign',
    'Best Distribution and Amplification of Content', 'Best Retail Media Campaign',
    'The ROI Award', 'Best Use of Audio', 'Best Use of Data', 'Best Use of Gaming',
    'Best Use of Mobile', 'Best Use of Online', 'Best Use of Out of Home',
    'Best Use of Publishing', 'Best Use of Real-Time Marketing',
    'Best Use of Social Media', 'The Best Use of Sport', 'Best Use of Talent',
    'Best Use of Technology', 'Best Use of Video', 'Best Use of AI',
    'Best Search Campaign',
  ],
  'MMA Smarties APAC': [
    'Brand Purpose / Activism', 'Social Impact Marketing',
    'Diversity and Inclusive Excellence', 'Brand Experience',
    'Instant Impact / Promotion', 'Customer Growth & Conversion Strategy',
    'New Product or Service Launch / Re-launch', 'Real Time Marketing',
    'Small Budget, Big Impact', 'Creator / Influencer / Celebrity Marketing',
    'Partnership, PR & Branded Content Excellence', 'Omnichannel Marketing',
    'Cross Digital Media Marketing', 'Social Media Marketing',
    'AI Powered Data Insights / Contextual Marketing',
    'Advanced Technologies Marketing', 'Retail Media / O2O Excellence',
    'Audience Engagement Excellence Using AI',
    'Integrated E-commerce Innovation & Live Streaming',
    'Design / Customer / User Experience', 'Personalization',
    'Short or Long Form Video', 'Innovative Use of AI in Advertising',
    'AI-Driven Creative Excellence', 'D2C / E-commerce Marketing Excellence',
  ],
  'MMA Smarties Global': [
    'Brand Purpose / Activism', 'Social Impact Marketing',
    'Diversity and Inclusive Excellence', 'Brand Experience',
    'Instant Impact / Promotion', 'Customer Growth & Conversion Strategy',
    'New Product or Service Launch / Re-launch', 'Real Time Marketing',
    'Small Budget, Big Impact', 'Creator / Influencer / Celebrity Marketing',
    'Partnership, PR & Branded Content Excellence', 'Omnichannel Marketing',
    'Cross Digital Media Marketing', 'Social Media Marketing',
    'AI Powered Data Insights / Contextual Marketing',
    'Advanced Technologies Marketing', 'Retail Media / O2O Excellence',
    'Audience Engagement Excellence Using AI',
    'Integrated E-commerce Innovation & Live Streaming',
    'Design / Customer / User Experience', 'Personalization',
    'Short or Long Form Video', 'Innovative Use of AI in Advertising',
    'AI-Driven Creative Excellence', 'D2C / E-commerce Marketing Excellence',
  ],
  'ADFEST': [
    'Film Lotus',
    'Film Craft Lotus',
    'Digital & Social Lotus',
    'Digital Craft Lotus',
    'Design Lotus',
    'Outdoor Lotus',
    'Press Lotus',
    'Print & Outdoor Craft Lotus',
    'Radio & Audio Lotus',
    'Brand Experience Lotus',
    'Commerce Lotus',
    'Direct Lotus',
    'PR Lotus',
    'Media Lotus',
    'Effective Lotus',
    'Creative Strategy Lotus',
    'Entertainment Lotus',
    'INNOVA Lotus',
    'Lotus Roots',
    'New Director Lotus',
    'Sustainable Lotus',
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
  'The Drum Awards Festival': [
    'Advertising', 'B2B', 'Content', 'Design', 'Digital Experience',
    'Experiential', 'Media', 'PR', 'Social', 'Social Purpose', 'Agency Business',
  ],
  'Loeries': [
    'Design',
    'Digital',
    'Film',
    'Live Communications',
    'Media Innovation',
    'Out of Home',
    'Print Communication',
    'PR & Media Communication',
    'Radio & Audio',
    'Student Awards',
    'Effective Creativity',
    'Social Impact Campaign',
    'Service Design',
    'B2B Creativity',
    'Comedic Impact',
    'New Launch Campaign',
    'Marketing Impact Award',
    'Integrated Campaign',
    'Young Creatives Award',
  ],
  'African Cristal Festival': [
    'Film', 'Digital', 'Print & OOH', 'Ambient & Experiential',
    'Social & Influencer', 'Audio', 'Brand Content', 'Direct', 'Healthcare',
    'Business to Business', 'Luxury & Fashion', 'Creative Technology',
    'Digital Design', 'Design', 'Film Craft', 'Print Craft', 'Digital Craft',
    'Brand Purpose', 'Brand Transformation', 'Social Impact', 'Brand Storytelling',
    'Long Term Creativity', 'Creative Strategy', 'Creative Commerce',
    'The Innovative Media Award', 'The Creative Effectiveness Award',
    'The Creative Business Award',
  ],
  'Campaign UK Agency of the Year': [
    'Branding Agency', 'Brand Experience Agency', 'Creative Agency',
    'Customer Engagement Agency', 'Digital Transformation Agency',
    'Independent PR Agency', 'Independent Media Agency', 'Independent Creative Agency',
    'In-House Agency', 'Integrated Marketing Agency', 'Media Agency',
    'Performance Marketing Agency', 'PR Agency', 'Start-Up Agency', 'Social Media Agency',
    'Account Person', 'Agency Producer', 'Creative Leader', 'Creative Team',
    'Head of Agency – Creative/Advertising', 'Head of Agency – Digital',
    'Head of Agency – Integrated Marketing', 'Head of Agency – Media', 'Head of Agency – PR',
    'Media Planning Leader', 'New Business Development Team/Person',
    'Strategic Leader', 'Strategist', 'Talent Management Team or Person',
  ],
  'Campaign US Agency of the Year': [
    'Ad Agency of the Year', 'AI Creative Studio', 'Design Studio',
    'Digital/Innovation Agency', 'Experiential Agency', 'Fastest Growing Agency',
    'Independent Agency', 'Influencer Agency', 'Media Agency', 'Multicultural Agency',
    'Account Person', 'Agency Leader', 'Creative Person', 'Inclusion Advocate',
    'Innovative Lead', 'Media Planner/Buyer', 'Strategist',
    'Content Team', 'Corporate Communications/Marketing Team', 'Creative Team',
    'Media Team', 'Pitch Team', 'Social Media Team', 'Strategy Team',
  ],
  'Campaign Global Agency of the Year': [
    'Global Network', 'Best Network: Asia Pacific', 'Best Network: Europe',
    'Best Network: Latin America', 'Best Network: Middle East & Africa', 'Best Network: North America',
    'Branding Agency', 'Brand Experience Agency', 'Consultancy', 'Creative Agency',
    'Customer Engagement Agency', 'Digital Transformation Agency',
    'Healthcare & Pharma Agency', 'Independent Creative/Advertising Agency',
    'Independent Media Agency', 'Independent PR Agency', 'In-House Agency',
    'Integrated Marketing Agency', 'Media Agency', 'Performance Agency',
    'PR Agency', 'Social Media Agency',
    'Account Person', 'Agency Growth Leader', 'Agency Leader', 'Creative Leader',
    'Creative Team', 'Head of Agency', 'New Business Development Team/Person',
    'Strategic Planning Leader', 'Talent Management Team/Person',
    'Global Inclusion Initiative', 'Best Place to Work',
  ],
  'Adweek Agency of the Year': [
    'Global Agency of the Year', 'International Agency of the Year',
    'U.S. Agency of the Year', 'Midsize Agency of the Year',
    'Small Agency of the Year', 'Breakthrough Agency of the Year',
    'Multicultural Agency of the Year', 'Independent Agency of the Year',
    'Agency Network of the Year', 'Social/Influencer Agency of the Year',
    'Innovation Agency of the Year',
  ],
  'One Show Indies': [
    'Branded Entertainment', 'Brand-Side / In-House', 'Creative Effectiveness',
    'Creative Marketer', 'Creative Use of AI', 'Creative Use of Data',
    'Creative Use of Technology', 'Creator Content', 'Cultural Driver',
    'Design & Branding', 'Design in Advertising', 'Direct Marketing',
    'Experiential & Immersive', 'Film & Video', 'Gaming', 'Health & Wellness',
    'Integrated / Omnichannel', 'Interactive Online & Mobile', 'IP & Product Design',
    'Moving Image Craft & Production', 'Music & Sound Craft', 'Out of Home',
    'Print & Promotional', 'Public Relations', 'Radio & Audio-First', 'Social Media',
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
  'Eurobest': 9,             // Research-based: ~9% shortlist rate
  'New York Festivals': 15,
  'London International Awards': 12,
  'Campaign Big Awards': 15,
  'Creative Circle': 14,
  'Epica Awards': 8,          // Research-based: scarce, journalist jury
  'ADFEST': 12,
  'Webby Awards': 5,           // Research-based: 13,000+ entries, very competitive
  'Shorty Awards': 20,
  'MMA Smarties': 20,
  'Asian Marketing Effectiveness Awards': 18,
  'Asia Pacific Effie Awards': 18,
  'Global Effie Awards': 12,
  'Australian Effies': 18,
  'The Drum Awards Festival': 12,       // ~12% across discipline shows
  'African Cristal Festival': 9,        // One winner per category — scarce
  'Loeries': 15,                        // Regional dominant; ~2,784 entries, 2025
  'Campaign UK Agency of the Year': 15, // Agency-tier; broad recognition
  'Campaign US Agency of the Year': 15,
  'Campaign Global Agency of the Year': 15,
  'Adweek Agency of the Year': 15,      // Editorial judged; paid entry new in 2025
  'One Show Indies': 8,                 // Inaugural 2026; high-bar One Show criteria
  'SABRE Awards Asia-Pacific': 15,        // PR sector show; ~20% EMEA finalist rate proxy; APAC volume lower
  'Global SABRE Awards': 5,              // Prestige capstone — top 40 from 5,000+ total entries; no direct entry
  'ICCO Global Awards': 15,              // PR sector show; effectiveness-purist; selective field (64 shortlisted 2024)
  'PRCA UK Awards': 15,                 // PR sector show; fee-banded tiers, outcomes-led
  'PRCA APAC Awards': 15,               // PR sector show; APAC regional
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

type Material = {
  name: string
  path: string
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
const materialWordCount = (m: Material): number =>
  typeof m.text_words === 'number'
    ? m.text_words
    : (m.extracted_text || '').trim().split(/\s+/).filter(Boolean).length

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
  tonal_brief: TonalBrief | null
  // AOY entry-type discriminator (S71) + validated agency-facts record (S73).
  entry_type: string | null
  agency_facts: Record<string, unknown> | null
  // AOY endorsements checklist (chunk 6): item_key -> boolean, hygiene-only.
  endorsements_checklist: Record<string, boolean> | null
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

type EntryDraft = {
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
  campaign_name_note?: string
  // Build 2 (Session 55): present only on evals run with candidates supplied.
  // [] is a valid "no stronger placements" answer; absent = pre-Build-2 eval.
  next_opportunities?: { show: string; category: string; rationale: string }[]
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
  // P3 (S146): directional per-section re-scores, keyed by section_key. Separate from
  // scores/output; NEVER the official score. Empty {} for rows predating the feature.
  section_rescores?: Record<string, SectionRescore> | null
}

type Tab = 'brief' | 'materials' | 'entries' | 'script' | 'directions' | 'facts' | 'endorsements' | 'presskit'

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

// Coach mode shows UNTAPPED potential (10 - raw score). Lower = better.
function coachScoreColor(untapped: number): string {
  if (untapped <= 2) return 'text-green-700'   // <=2 pts gap, most potential captured
  if (untapped <= 5) return 'text-amber-700'   // moderate gap
  return 'text-red-600'                         // significant potential not yet in draft
}

// Thin proportional meter bar shared by the AOY panels (weight share, fit score).
// Width/colors are INLINE styles, not Tailwind arbitrary values: the purge drops
// arbitrary values in dynamic spots here (the GeneratingBar / gold-accent gotcha).
// Presentational only; the fraction is always computed from code-authoritative
// numbers (persisted section_weight, parsed rubric weight, model fit 0-10).
function MeterBar({ fraction, color = '#15803d', track = '#e5e7eb', height = 4 }:
  { fraction: number; color?: string; track?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: track }}>
      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 9999 }} />
    </div>
  )
}

// Always-openable show picker (S78 bug fix, replaces the datalist whose list was
// hidden until the field was cleared). Free text is still allowed (unknown shows
// route to the request flow). Chevron toggles the list; typing filters it;
// clicking outside closes it.
function ShowCombobox({ value, onChange, options, placeholder }:
  { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const q = value.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options
  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-stretch gap-1">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
        />
        <button
          type="button"
          aria-label="Toggle show list"
          onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 px-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
        >
          <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {filtered.map(o => (
            <li key={o}>
              <button
                type="button"
                onClick={() => { onChange(o); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-green-50 transition-colors ${o === value ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'}`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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
  lines.push('---', 'Generated by Shortlist · shortlist.app')
  return lines.join('\n')
}

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

  // Press Kit
  const [orgPressProfile, setOrgPressProfile] = useState<OrgPressProfile | null>(null)
  const [selectedPressKitDirs, setSelectedPressKitDirs] = useState<Set<number>>(new Set())
  const [pressKitOutputs, setPressKitOutputs] = useState<Record<number, string>>({}) // dirId → email HTML
  const [pressKitExtras, setPressKitExtras] = useState<Record<number, PressKitExtra>>({}) // dirId → extra sections
  const [pressKitAiCopy, setPressKitAiCopy] = useState<Record<string, string>>({}) // key: `${dirId}-${field}` or `${dirId}-pressHook-${target}`
  const [pressKitDrafts, setPressKitDrafts] = useState<Record<string, PressKitDraftRow>>({}) // key: `${dirId}-${field_key}`
  const [pressKitAiLoading, setPressKitAiLoading] = useState<Record<string, boolean>>({})
  const [pressTargets, setPressTargets] = useState<Record<number, string[]>>({}) // dirId → selected press targets
  const [pressHookCopied, setPressHookCopied] = useState<Record<string, boolean>>({})
  const [pressKitCopied, setPressKitCopied] = useState<Record<number, boolean>>({})
  const [pressKitCopiedExtra, setPressKitCopiedExtra] = useState<Record<string, boolean>>({}) // key: `${dirId}-${field}`
  const [pressKitGenerating, setPressKitGenerating] = useState(false)

  // Brief editor chat
  const [briefChatOpen, setBriefChatOpen] = useState(false)
  const [briefChatInput, setBriefChatInput] = useState('')
  const [briefChatting, setBriefChatting] = useState(false)
  const [briefChatHistory, setBriefChatHistory] = useState<ChatMessage[]>([])
  const [briefChatError, setBriefChatError] = useState('')

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
  // Directions tab: sort key
  const [dirSortKey, setDirSortKey] = useState<'default' | 'category_fit' | 'medal_chance' | 'roi'>('default')

  // Festival / jury intelligence — show_profiles rows keyed by directionId
  const [showProfiles, setShowProfiles] = useState<Record<number, ShowProfile | null>>({})
  const [showProfileOpen, setShowProfileOpen] = useState<Record<number, boolean>>({})
  // Jury Intelligence Layer — Phase 1 (jury_cells keyed by show name, panel open state by dirId)
  const [juryShowCells, setJuryShowCells] = useState<Record<string, JuryCell[]>>({})
  const [juryPanelOpen, setJuryPanelOpen] = useState<Record<number, boolean>>({})
  const [regionalUplift, setRegionalUplift] = useState<RegionalUplift[]>([])
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

    // Fetch total KB campaign count for the Script Analysis subheadline
    supabase.from('campaigns').select('*', { count: 'exact', head: true })
      .then(({ count }) => { if (!cancelled && count !== null) setKbCount(count) })

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

    // Fetch saved press kit drafts for this project (non-critical)
    supabase
      .from('press_kit_drafts')
      .select('id, project_id, direction_id, field_key, field_label, version_a, version_b, version_c, selected, custom_text, press_target, model_used, updated_at')
      .eq('project_id', projectId)
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) {
          const map: Record<string, PressKitDraftRow> = {}
          for (const row of data) {
            map[`${row.direction_id}-${row.field_key}`] = row as PressKitDraftRow
          }
          setPressKitDrafts(map)
        }
      })

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
        if (proj.script_text) setScriptText(proj.script_text)
        if (proj.script_analysis) setScriptAnalysis(proj.script_analysis)
        if (proj.tonal_brief) setTonalBriefData(proj.tonal_brief as TonalBrief)
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

  // Auto-restore saved press kit drafts into pressKitAiCopy when there are saved drafts.
  // Runs whenever pressKitDrafts loads or tab changes to 'presskit'.
  useEffect(() => {
    if (tab !== 'presskit') return
    if (Object.keys(pressKitDrafts).length === 0) return
    setPressKitAiCopy(prev => {
      const next = { ...prev }
      for (const [storeKey, draft] of Object.entries(pressKitDrafts)) {
        // Only restore if not already showing something (don't clobber a new generation)
        if (next[storeKey]) continue
        const selected = draft.selected === 'b' ? draft.version_b
                       : draft.selected === 'c' ? draft.version_c
                       : draft.version_a
        if (selected) next[storeKey] = selected
      }
      return next
    })
    // Also restore selected press targets from saved press hook drafts
    setPressTargets(prev => {
      const next = { ...prev }
      for (const [, draft] of Object.entries(pressKitDrafts)) {
        if (draft.field_key.startsWith('pressHook-') && draft.press_target) {
          const dirId = draft.direction_id
          const current = next[dirId] ?? []
          if (!current.includes(draft.press_target)) {
            next[dirId] = [...current, draft.press_target]
          }
        }
      }
      return next
    })
  }, [tab, pressKitDrafts])

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
          .select('show_name, judging_philosophy, scoring_emphasis, language_guidance, common_mistakes, jury_composition_notes, base_win_rate')
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

  // Display name for the submitting org
  const getOrgDisplayName = (): string => {
    if (!orgPressProfile) return ''
    if (orgPressProfile.org_type === 'brand' && orgPressProfile.in_house_team_name) {
      return orgPressProfile.in_house_team_name
    }
    return orgPressProfile.agency_name || ''
  }

  // Build Outlook-safe HTML press kit for one direction
  const buildPressKitEmail = (dirId: number): string => {
    const direction = directions.find(d => d.id === dirId)
    if (!direction || !project) return ''
    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName()
    const pr = orgPressProfile

    // Colours
    const green = '#166534'
    const darkGray = '#111111'
    const midGray = '#555555'
    const lightGray = '#888888'
    const ruleColor = '#eeeeee'
    const placeholderBg = '#f9fafb'
    const placeholderBorder = '#d1d5db'

    const rule = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 1px solid ${ruleColor}; font-size: 0; line-height: 0;">&nbsp;</td></tr></table>`

    // Build credits block
    const leadCollabs = collaborators.filter(c => c.is_lead_credit)
    const otherCollabs = collaborators.filter(c => !c.is_lead_credit)
    const allCredits = [...leadCollabs, ...otherCollabs]
    let creditsHtml = ''
    if (orgName || allCredits.length > 0) {
      const creditItems: string[] = []
      if (orgName) {
        creditItems.push(`<strong>${orgName}</strong>${pr?.tagline ? ` — ${pr.tagline}` : ''}`)
      }
      for (const c of allCredits) {
        creditItems.push(`${COLLAB_TYPE_LABELS[c.collaborator_type]}: ${c.collaborator_name}`)
      }
      creditsHtml = `
        <p style="margin: 0 0 6px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Credits</p>
        ${creditItems.map(item => `<p style="margin: 0 0 4px 0; font-size: 13px; color: ${midGray};">${item}</p>`).join('')}
        ${rule}`
    }

    // Build contact block
    let contactHtml = ''
    if (pr?.pr_contact_name || pr?.pr_contact_email) {
      const contactParts: string[] = []
      if (pr.pr_contact_name) contactParts.push(`<strong>${pr.pr_contact_name}</strong>`)
      if (pr.pr_contact_email) contactParts.push(`<a href="mailto:${pr.pr_contact_email}" style="color: ${green}; text-decoration: none;">${pr.pr_contact_email}</a>`)
      if (pr.pr_contact_phone) contactParts.push(pr.pr_contact_phone)
      if (pr.website_url) contactParts.push(`<a href="${pr.website_url}" style="color: ${green}; text-decoration: none;">${pr.website_url.replace(/^https?:\/\//, '')}</a>`)
      const socialParts: string[] = []
      if (pr.linkedin_url) socialParts.push(`LinkedIn: ${pr.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, '')}`)
      if (pr.x_handle) socialParts.push(`X: @${pr.x_handle.replace(/^@/, '')}`)
      if (pr.instagram_handle) socialParts.push(`Instagram: @${pr.instagram_handle.replace(/^@/, '')}`)
      contactHtml = `
        <p style="margin: 0 0 6px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Press Contact</p>
        <p style="margin: 0 0 4px 0; font-size: 13px; color: ${midGray}; line-height: 1.6;">${contactParts.join(' &nbsp;·&nbsp; ')}</p>
        ${socialParts.length > 0 ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: ${lightGray};">${socialParts.join(' &nbsp;·&nbsp; ')}</p>` : ''}
        ${rule}`
    }

    // Entry field sections
    const fieldsSections = fields.map(f => {
      const content = resolveFieldContent(f)
      if (!content) return ''
      // Preserve line breaks in the content
      const contentHtml = content.replace(/\n\n/g, '</p><p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: ' + darkGray + ';">').replace(/\n/g, '<br>')
      return `
        <p style="margin: 0 0 5px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${f.field_label}</p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.65; color: ${darkGray};">${contentHtml}</p>`
    }).filter(Boolean).join('')

    // Date
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; font-family: Arial, Helvetica, sans-serif;">

  <!-- INTRO PLACEHOLDER -->
  <tr><td style="padding: 28px 0 0 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding: 14px 16px; background: ${placeholderBg}; border: 1px dashed ${placeholderBorder}; border-radius: 6px;">
      <p style="margin: 0; font-size: 13px; color: ${lightGray}; font-style: italic; line-height: 1.5;">
        [Add your personal introduction here &mdash; who you are, any shared context, and why you&rsquo;re sharing this work with them specifically.]
      </p>
    </td></tr>
    </table>
  </td></tr>

  <!-- SHOW CONTEXT -->
  <tr><td style="padding: 28px 0 0 0;">
    <p style="margin: 0 0 8px 0; font-size: 11px; color: ${lightGray}; text-transform: uppercase; letter-spacing: 0.8px; font-weight: bold;">
      ${direction.best_show || ''}${direction.best_category ? ' &nbsp;&middot;&nbsp; ' + direction.best_category : ''}
    </p>

    <!-- CAMPAIGN NAME -->
    <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: ${darkGray}; line-height: 1.2;">
      ${project.campaign_name}
    </p>

    <!-- CLIENT -->
    ${project.client_name ? `<p style="margin: 0 0 24px 0; font-size: 14px; color: ${lightGray};">for ${project.client_name}</p>` : `<p style="margin: 0 0 24px 0;"></p>`}

    ${direction.hook ? `
    <!-- HOOK -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
    <tr>
      <td width="3" style="background: ${green}; border-radius: 2px;">&nbsp;</td>
      <td width="12">&nbsp;</td>
      <td>
        <p style="margin: 0; font-size: 15px; color: ${darkGray}; font-style: italic; line-height: 1.6;">${direction.hook}</p>
      </td>
    </tr>
    </table>` : ''}
  </td></tr>

  ${rule}

  <!-- ENTRY FIELDS -->
  <tr><td>
    ${fieldsSections || `<p style="font-size: 14px; color: ${lightGray}; font-style: italic;">Generate an entry draft to populate this section.</p>`}
  </td></tr>

  ${rule}

  <!-- CREDITS -->
  <tr><td>
    ${creditsHtml}
  </td></tr>

  <!-- CONTACT -->
  <tr><td>
    ${contactHtml || ''}
  </td></tr>

  <!-- CLOSE PLACEHOLDER -->
  <tr><td style="padding: 0 0 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding: 14px 16px; background: ${placeholderBg}; border: 1px dashed ${placeholderBorder}; border-radius: 6px;">
      <p style="margin: 0; font-size: 13px; color: ${lightGray}; font-style: italic; line-height: 1.5;">
        [Your personal sign-off &mdash; e.g. &ldquo;Happy to share assets or a full case film. Let me know if you&rsquo;d like to talk through the work. Best, [Name]&rdquo;]
      </p>
    </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding: 16px 0; border-top: 1px solid ${ruleColor};">
    <p style="margin: 0; font-size: 11px; color: ${lightGray};">Generated by Shortlist &middot; ${today}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
  }

  // Build social / summary extras for one direction
  const buildPressKitExtra = (dirId: number): PressKitExtra => {
    const direction = directions.find(d => d.id === dirId)
    const empty: PressKitExtra = { quickSummary: '', pressHook: '', linkedinPost: '', xPost: '', instagramCaption: '' }
    if (!direction || !project) return empty

    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName()
    const show = direction.best_show || ''
    const category = direction.best_category || ''
    const hook = direction.hook || direction.angle || ''
    const campaign = project.campaign_name
    const client = project.client_name || ''
    const showCategory = [category, show].filter(Boolean).join(' at ')

    // First entry field body (for LinkedIn/summary depth)
    const firstField = fields[0] ? resolveFieldContent(fields[0]) : ''
    const bodySnippet = firstField ? firstField.replace(/\n+/g, ' ').trim().slice(0, 220) + (firstField.length > 220 ? '…' : '') : ''

    // ── Quick Summary (2–3 sentences for email intros / press release openers) ──
    const summaryParts: string[] = []
    summaryParts.push(`${campaign}${client ? ` for ${client}` : ''}${orgName ? ` by ${orgName}` : ''} is entered in ${showCategory || 'the show'}.`)
    if (hook) summaryParts.push(hook)
    if (bodySnippet && bodySnippet !== hook) summaryParts.push(bodySnippet)
    const quickSummary = summaryParts.join(' ')

    // ── Press Hook (single punchy line tailored to show/category) ──
    const pressHook = hook
      ? `${campaign}${client ? ` for ${client}` : ''}: ${hook}`
      : `${campaign}${client ? ` for ${client}` : ''}${orgName ? `, by ${orgName}` : ''} — entered in ${showCategory || 'the show'}.`

    // ── LinkedIn Post ──
    const linkedinParts: string[] = []
    linkedinParts.push(`We've entered ${campaign}${client ? ` for ${client}` : ''} in ${showCategory || 'the show'}.`)
    if (hook) linkedinParts.push(`\n${hook}`)
    if (bodySnippet) linkedinParts.push(`\n${bodySnippet}`)
    if (orgName) linkedinParts.push(`\n— ${orgName}`)
    const showTag = show ? `#${show.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''
    const lgHashtags = ['#awards', showTag, '#advertising', '#creative'].filter(Boolean).join(' ')
    linkedinParts.push(`\n\n${lgHashtags}`)
    const linkedinPost = linkedinParts.join('\n')

    // ── X / Twitter Post (≤ 280 chars) ──
    const xCore = `${campaign}${client ? ` for ${client}` : ''}${showCategory ? ` — entered in ${showCategory}` : ''}. ${hook}`.trim()
    const xPost = xCore.length > 277 ? xCore.slice(0, 274) + '…' : xCore

    // ── Instagram Caption ──
    const igParts: string[] = []
    igParts.push(`${campaign}${client ? ` for ${client}` : ''} 🏆`)
    if (hook) igParts.push(hook)
    if (showCategory) igParts.push(`\nEntered in ${showCategory}.`)
    if (orgName) igParts.push(`\n${orgName}`)
    const igTag = show ? `#${show.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''
    const igHashtags = ['#awards', igTag, '#advertising', '#creative', '#design'].filter(Boolean).join(' ')
    igParts.push(`\n\n${igHashtags}`)
    const instagramCaption = igParts.join('\n')

    return { quickSummary, pressHook, linkedinPost, xPost, instagramCaption }
  }

  // Copy plain text extra section to clipboard
  const copyPressKitExtra = async (dirId: number, field: keyof PressKitExtra) => {
    const text = pressKitExtras[dirId]?.[field]
    if (!text) return
    const key = `${dirId}-${field}`
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
    setPressKitCopiedExtra(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setPressKitCopiedExtra(prev => ({ ...prev, [key]: false })), 2500)
  }

  // Generate AI-drafted copy for one direction + field (social + quick summary)
  const generateAiPressCopy = async (dirId: number, field: 'linkedinPost' | 'xPost' | 'instagramCaption' | 'quickSummary') => {
    const formatMap: Record<string, string> = {
      linkedinPost: 'linkedin',
      xPost: 'x',
      instagramCaption: 'instagram',
      quickSummary: 'quicksummary',
    }
    const labelMap: Record<string, string> = {
      linkedinPost: 'LinkedIn Post',
      xPost: 'X / Twitter Post',
      instagramCaption: 'Instagram Caption',
      quickSummary: 'Quick Summary',
    }
    const key = `${dirId}-${field}`
    setPressKitAiLoading(prev => ({ ...prev, [key]: true }))
    try {
      // Session 47 audit fix S1: generate-press-copy now requires user auth —
      // send the session access token, not the anon key.
      const accessToken = await getToken()
      if (!accessToken) { window.location.href = '/login'; return }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-press-copy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ direction_id: dirId, format: formatMap[field], project_id: projectId }),
        }
      )
      const data = await res.json()
      if (data.copy) {
        setPressKitAiCopy(prev => ({ ...prev, [key]: data.copy }))
        // Persist to DB with version shifting
        await upsertPressKitDraft(dirId, field, labelMap[field], data.copy)
      }
    } catch (err) {
      console.error('AI press copy failed:', err)
    } finally {
      setPressKitAiLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  // Generate AI press hooks for all selected press targets for a direction
  const generateAiPressHooks = async (dirId: number) => {
    const targets = pressTargets[dirId] ?? []
    if (targets.length === 0) return
    await Promise.all(targets.map(async (target) => {
      const key = `${dirId}-pressHook-${target}`
      const fieldKey = `pressHook-${target}`
      setPressKitAiLoading(prev => ({ ...prev, [key]: true }))
      try {
        // Session 47 audit fix S1: generate-press-copy now requires user auth.
        const accessToken = await getToken()
        if (!accessToken) { window.location.href = '/login'; return }
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-press-copy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ direction_id: dirId, format: 'presshook', press_target: target, project_id: projectId }),
          }
        )
        const data = await res.json()
        if (data.copy) {
          setPressKitAiCopy(prev => ({ ...prev, [key]: data.copy }))
          // Persist to DB with version shifting
          await upsertPressKitDraft(dirId, fieldKey, `Press Hook (${target})`, data.copy, target)
        }
      } catch (err) {
        console.error('AI press hook failed:', err)
      } finally {
        setPressKitAiLoading(prev => ({ ...prev, [key]: false }))
      }
    }))
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

  // Copy formatted HTML to clipboard so it pastes as rich text in Outlook
  const copyPressKitToClipboard = async (dirId: number) => {
    const html = pressKitOutputs[dirId]
    if (!html) return
    try {
      if (typeof ClipboardItem !== 'undefined') {
        const blob = new Blob([html], { type: 'text/html' })
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
      } else {
        // Fallback: create a temp div, select, copy via execCommand
        const div = document.createElement('div')
        div.innerHTML = html
        div.style.position = 'fixed'
        div.style.opacity = '0'
        div.style.pointerEvents = 'none'
        document.body.appendChild(div)
        const range = document.createRange()
        range.selectNode(div)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        document.execCommand('copy')
        window.getSelection()?.removeAllRanges()
        document.body.removeChild(div)
      }
      setPressKitCopied(prev => ({ ...prev, [dirId]: true }))
      setTimeout(() => setPressKitCopied(prev => ({ ...prev, [dirId]: false })), 2500)
    } catch {
      // Silent fail — clipboard access may be blocked in some contexts
    }
  }

  // Download PDF via jsPDF (dynamic import to avoid SSR issues)
  const downloadPressKitPDF = async (dirId: number) => {
    const direction = directions.find(d => d.id === dirId)
    if (!direction || !project) return
    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName()
    const pr = orgPressProfile

    try {
      const { jsPDF } = await import('jspdf' as never) as { jsPDF: new (o?: Record<string, unknown>) => {
        setFillColor: (r: number, g: number, b: number) => void
        rect: (x: number, y: number, w: number, h: number, style: string) => void
        setTextColor: (r: number, g: number, b: number) => void
        setFontSize: (size: number) => void
        setFont: (font: string, style: string) => void
        text: (text: string, x: number, y: number, opts?: Record<string, unknown>) => void
        splitTextToSize: (text: string, maxWidth: number) => string[]
        setDrawColor: (r: number, g: number, b: number) => void
        line: (x1: number, y1: number, x2: number, y2: number) => void
        addPage: () => void
        save: (filename: string) => void
        addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void
        internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
      } }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentW = pageW - margin * 2
      let y = 0

      const checkPage = (neededHeight: number) => {
        if (y + neededHeight > pageH - margin) { doc.addPage(); y = margin }
      }

      const rule = (gap = 8) => {
        doc.setDrawColor(225, 225, 225)
        doc.line(margin, y, pageW - margin, y)
        y += gap
      }

      const sectionLabel = (text: string) => {
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52) // green-800
        doc.text(text.toUpperCase(), margin, y)
        y += 5
      }

      // ── Header bar ──
      doc.setFillColor(22, 101, 52)
      doc.rect(0, 0, pageW, 16, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text('PRESS KIT', margin, 10)

      // Show · Category badge (right-aligned in header)
      if (direction.best_show || direction.best_category) {
        const badge = [direction.best_show, direction.best_category].filter(Boolean).join('  ·  ')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text(badge, pageW - margin, 10, { align: 'right' } as Record<string, unknown>)
      }

      y = 24

      // ── Logo (top-right, loaded async) ──
      if (pr?.logo_url) {
        try {
          const { data: { publicUrl } } = supabase.storage.from('org-logos').getPublicUrl(pr.logo_url)
          const logoDataUrl = await new Promise<string>((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              if (!ctx) { reject(new Error('no ctx')); return }
              ctx.drawImage(img, 0, 0)
              resolve(canvas.toDataURL('image/png'))
            }
            img.onerror = reject
            img.src = publicUrl
          })
          // Place logo top-right: max 32mm wide, max 14mm tall
          const tmpImg = new Image()
          tmpImg.src = logoDataUrl
          const aspect = tmpImg.naturalWidth / (tmpImg.naturalHeight || 1)
          const maxW = 32
          const maxH = 14
          const logoH = Math.min(maxH, maxW / (aspect || 1))
          const logoW = logoH * (aspect || 1)
          doc.addImage(logoDataUrl, 'PNG', pageW - margin - logoW, 18, logoW, logoH)
          y = Math.max(y, 18 + logoH + 4)
        } catch {
          // Logo load failed — continue without it
        }
      }

      // ── Campaign name ──
      doc.setTextColor(15, 15, 15)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      const nameLines = doc.splitTextToSize(project.campaign_name, contentW - (pr?.logo_url ? 36 : 0))
      nameLines.forEach((line: string) => { doc.text(line, margin, y); y += 9 })

      // ── Client ──
      if (project.client_name) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(120, 120, 120)
        doc.text(`for ${project.client_name}`, margin, y)
        y += 7
      }

      // ── Org name + tagline ──
      if (orgName) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52)
        const orgLine = orgName + (pr?.tagline ? `  —  ${pr.tagline}` : '')
        doc.text(orgLine, margin, y)
        y += 7
      }

      // ── Hook ──
      if (direction.hook) {
        y += 3
        // Green accent bar
        doc.setFillColor(22, 101, 52)
        doc.rect(margin, y - 3.5, 2.5, 0, 'F') // placeholder — draw after measuring
        const hookLines = doc.splitTextToSize(direction.hook, contentW - 8)
        const hookBlockH = hookLines.length * 6 + 2
        checkPage(hookBlockH + 8)
        doc.setFillColor(22, 101, 52)
        doc.rect(margin, y - 3.5, 2.5, hookBlockH, 'F')
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bolditalic')
        doc.setTextColor(30, 30, 30)
        hookLines.forEach((line: string) => { doc.text(line, margin + 6, y); y += 6 })
        y += 6
      }

      y += 2
      rule(10)

      // ── Entry fields ──
      for (const f of fields) {
        const content = resolveFieldContent(f)
        if (!content) continue
        checkPage(22)
        sectionLabel(f.field_label)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(25, 25, 25)
        const contentLines = doc.splitTextToSize(content, contentW)
        for (const line of contentLines) {
          checkPage(6)
          doc.text(line, margin, y)
          y += 5.5
        }
        y += 7
      }

      // ── Credits ──
      const leadCollabs = collaborators.filter(c => c.is_lead_credit)
      const otherCollabs = collaborators.filter(c => !c.is_lead_credit)
      const allCredits = [...leadCollabs, ...otherCollabs]
      if (orgName || allCredits.length > 0) {
        checkPage(22)
        rule(8)
        sectionLabel('Credits')
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(25, 25, 25)
        if (orgName) {
          doc.text(orgName, margin, y)
          if (pr?.tagline) {
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(120, 120, 120)
            doc.setFontSize(9.5)
            doc.text(pr.tagline, margin, y + 5)
            y += 5
          }
          y += 6
        }
        doc.setFontSize(10.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        for (const c of allCredits) {
          checkPage(6)
          doc.text(`${COLLAB_TYPE_LABELS[c.collaborator_type]}: ${c.collaborator_name}`, margin, y)
          y += 5.5
        }
        y += 4
      }

      // ── Press Contact ──
      if (pr?.pr_contact_name || pr?.pr_contact_email) {
        checkPage(22)
        rule(8)
        sectionLabel('Press Contact')
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(25, 25, 25)
        if (pr.pr_contact_name) { doc.text(pr.pr_contact_name, margin, y); y += 5.5 }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10.5)
        doc.setTextColor(60, 60, 60)
        const contactLine = [pr.pr_contact_email, pr.pr_contact_phone].filter(Boolean).join('  ·  ')
        if (contactLine) { doc.text(contactLine, margin, y); y += 5 }
        if (pr.website_url) {
          doc.setTextColor(22, 101, 52)
          doc.text(pr.website_url.replace(/^https?:\/\//, ''), margin, y)
          y += 5
        }
        const social = [
          pr.linkedin_url ? `LinkedIn: ${pr.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, '')}` : '',
          pr.x_handle ? `X: @${pr.x_handle.replace(/^@/, '')}` : '',
          pr.instagram_handle ? `IG: @${pr.instagram_handle.replace(/^@/, '')}` : '',
        ].filter(Boolean).join('  ·  ')
        if (social) {
          doc.setTextColor(120, 120, 120)
          doc.setFontSize(9.5)
          doc.text(social, margin, y)
          y += 5
        }
      }

      // ── Footer ──
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 180, 180)
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Generated by Shortlist  ·  ${today}`, margin, pageH - 10)

      const safeShow = (direction.best_show || 'show').replace(/[^a-z0-9]/gi, '-').toLowerCase()
      const safeCampaign = project.campaign_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      doc.save(`${safeCampaign}-${safeShow}-press-kit.pdf`)
    } catch (err) {
      console.error('Press kit PDF generation failed:', err)
      alert('PDF generation failed. Make sure jspdf is installed.')
    }
  }

  // Generate press kits for all selected directions
  const generatePressKits = () => {
    setPressKitGenerating(true)
    const outputs: Record<number, string> = {}
    const extras: Record<number, PressKitExtra> = {}
    for (const dirId of Array.from(selectedPressKitDirs)) {
      const html = buildPressKitEmail(dirId)
      if (html) outputs[dirId] = html
      extras[dirId] = buildPressKitExtra(dirId)
    }
    setPressKitOutputs(prev => ({ ...prev, ...outputs }))
    setPressKitExtras(prev => ({ ...prev, ...extras }))
    setPressKitGenerating(false)
    if (Object.keys(outputs).length > 0) {
      track('presskit_generated', { project_id: Number(projectId), direction_count: Object.keys(outputs).length })
    }
  }

  // Upsert an AI-generated copy string into press_kit_drafts.
  // Shifts version_a → version_b → version_c on each new generation.
  const upsertPressKitDraft = async (
    dirId: number,
    fieldKey: string,
    fieldLabel: string,
    newText: string,
    pressTarget?: string,
  ) => {
    const storeKey = `${dirId}-${fieldKey}`
    const existing = pressKitDrafts[storeKey]

    // Compute new version columns by shifting
    let version_a = newText
    let version_b: string | null = null
    let version_c: string | null = null
    if (existing) {
      version_b = existing.version_a ?? null
      version_c = existing.version_b ?? null
      // existing version_c is dropped
    }

    const upsertData = {
      project_id: project?.id ?? null,
      direction_id: dirId,
      field_key: fieldKey,
      field_label: fieldLabel,
      version_a,
      version_b,
      version_c,
      selected: 'a' as const,
      press_target: pressTarget ?? null,
      model_used: 'claude-haiku-4-5-20251001',
    }

    const { data, error } = await supabase
      .from('press_kit_drafts')
      .upsert(upsertData, { onConflict: 'direction_id,field_key' })
      .select('id, project_id, direction_id, field_key, field_label, version_a, version_b, version_c, selected, custom_text, press_target, model_used, updated_at')
      .single()

    if (!error && data) {
      setPressKitDrafts(prev => ({ ...prev, [storeKey]: data as PressKitDraftRow }))
    }
  }

  // Select a specific saved version for a draft field and update pressKitAiCopy to display it.
  const selectPressKitVersion = async (dirId: number, fieldKey: string, version: 'a' | 'b' | 'c') => {
    const storeKey = `${dirId}-${fieldKey}`
    const draft = pressKitDrafts[storeKey]
    if (!draft) return

    const text = version === 'a' ? draft.version_a
                : version === 'b' ? draft.version_b
                : draft.version_c
    if (!text) return

    // Optimistic UI update
    setPressKitDrafts(prev => ({ ...prev, [storeKey]: { ...draft, selected: version } }))
    setPressKitAiCopy(prev => ({ ...prev, [storeKey]: text }))

    // Persist selection to DB
    await supabase
      .from('press_kit_drafts')
      .update({ selected: version })
      .eq('direction_id', dirId)
      .eq('field_key', fieldKey)
  }

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
    const safeFileName = file.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
    const path = `${project.id}/${Date.now()}-${safeFileName}`
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
        // AcroForm field values — keyed by fieldName to deduplicate across pages
        const formFields: Map<string, string> = new Map()

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)

          // 1. Extract AcroForm field values (fillable PDF forms)
          try {
            const annotations = await page.getAnnotations()
            for (const ann of annotations as Array<{
              subtype?: string; annotationType?: number;
              fieldName?: string; fullName?: string;
              fieldValue?: unknown; currentValue?: unknown; defaultFieldValue?: unknown;
            }>) {
              // Widget annotations = form fields. Check both string subtype and numeric type (20).
              const isWidget = ann.subtype === 'Widget' || ann.annotationType === 20
              const name = ann.fieldName || ann.fullName
              if (!isWidget || !name) continue
              // Try fieldValue first, then currentValue, then defaultFieldValue
              const raw = ann.fieldValue ?? ann.currentValue ?? ann.defaultFieldValue
              if (typeof raw === 'string' && raw.trim() && !formFields.has(name)) {
                formFields.set(name, raw.trim())
              }
            }
          } catch { /* annotations optional */ }

          // 2. Extract text content stream
          const textContent = await page.getTextContent()
          const pageText = (textContent.items as Array<{ str?: string }>)
            .filter(item => typeof item.str === 'string')
            .map(item => item.str as string)
            .join(' ').trim()
          if (pageText.length > 80) { textParts.push(pageText) }
          else { chartPageNums.push(pageNum) }
        }

        // Prepend form fields block so it appears in the first chars read by detection
        const formFieldsBlock = formFields.size > 0
          ? `=== Form Fields ===\n${Array.from(formFields.entries()).map(([k, v]) => `${k}: ${v}`).join('\n')}\n=== End Form Fields ===\n\n`
          : ''
        extractedText = (formFieldsBlock + textParts.join('\n\n')).slice(0, 50000)

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
    await supabase.storage.from('project-materials').remove([material.path])
    if (material.chart_image_paths?.length) {
      await supabase.storage.from('project-materials').remove(material.chart_image_paths)
    }
    // Session 52 (P-03): removal by PATH via RPC — see upload note; the old
    // filtered-array write-back must never come back. Local state only updates
    // on success so the in-memory list never desyncs from the DB.
    const { error: removeErr } = await supabase.rpc('remove_project_material', {
      p_project_id: project.id,
      p_path: material.path,
    })
    if (!removeErr) {
      delete materialTextCache.current[material.path]
      setProject(p => p ? { ...p, materials: (p.materials || []).filter((_, i) => i !== index) } : p)
    }
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
  const fetchMaterialText = async (material: Material | undefined): Promise<string> => {
    if (!material) return ''
    if (material.extracted_text) return material.extracted_text
    if (!material.has_text) return ''
    const cached = materialTextCache.current[material.path]
    if (cached !== undefined) return cached
    const { data, error } = await supabase.rpc('get_project_material_text', {
      p_project_id: projectId,
      p_path: material.path,
    })
    if (error) { console.error('material text fetch failed', error); return '' }
    const text = (data as string | null) ?? ''
    materialTextCache.current[material.path] = text
    return text
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
        dirContextOverride = (await fetchMaterialText(mats[dirSourceMaterialIdx])) || undefined
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
        return
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
    const text = await fetchMaterialText(material)
    if (!text) { setQuickEvalDetecting(false); return }
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
      const text = await fetchMaterialText(project.materials[quickEvalMaterialIdx])
      if (!text) {
        setQuickEvalError('Could not load the material text — please refresh the page and try again.')
        return
      }
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
      const entryText = await fetchMaterialText(material)
      if (!entryText) {
        setQuickEvalError('Could not load the material text — please refresh the page and try again.')
        return
      }

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
            body: JSON.stringify({ project_id: project.id, direction_id: dir.id, material_path: material.path }),
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

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  const formatBytes = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  // Derive the available categories for the chosen script show
  const availableCategories = scriptShow ? categoriesForShow(scriptShow) : []

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
  const spinePressKitStarted = Object.keys(pressKitDrafts).length > 0 || Object.keys(pressKitOutputs).length > 0
  const spineScriptDone = !!(scriptText && scriptText.trim()) || !!project.script_text

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
    { key: 'jury', label: 'Jury Read', done: spineHasJudge,
      summary: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    { key: 'facts', label: 'Verify Facts', done: spineFactsDone },
    { key: 'directions', label: 'Directions', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    { key: 'refine', label: 'Refine', done: spineHasCoach },
    { key: 'endorsements', label: 'Endorsements', done: spineEndorsementsDone },
    { key: 'script', label: 'Video Script', done: spineScriptDone },
    { key: 'presskit', label: 'Press Kit', done: spinePressKitStarted },
  ]

  const campaignSpineSteps: SpineStep[] = [
    { key: 'brief', label: 'Brief', done: !!((project.combined_text || briefText || '').trim()) },
    { key: 'materials', label: 'Materials', done: (project.materials?.length ?? 0) > 0,
      summary: project.materials?.length ? String(project.materials.length) : undefined },
    { key: 'directions', label: 'Directions', done: directions.length > 0,
      summary: directions.length > 0 ? String(directions.length) : undefined },
    { key: 'draft', label: 'Draft', done: entries.length > 0,
      summary: spineMaxDraftGen > 0 ? `Gen ${spineMaxDraftGen}` : undefined },
    { key: 'evaluated', label: 'Evaluated', done: spineHasEval,
      summary: spineBestJudge !== null ? spineBestJudge.toFixed(1) : undefined },
    // Session 57 (Ben): Press Kit is the LAST step — the script crystalises
    // the story first; the press kit announces the finished entry.
    { key: 'script', label: 'Video Script', done: spineScriptDone },
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
    const target: Tab = projectIsAoy
      ? (AOY_STEP_TO_TAB[step.key] ?? 'materials')
      : ((step.key === 'draft' || step.key === 'evaluated') ? 'entries' : (step.key as Tab))
    track('spine_step_clicked', { project_id: Number(projectId), step: step.key, was_empty: !step.done })
    setTab(target)
  }

  // Effective script category label for display
  const effectiveCategoryLabel = scriptCategory === 'suggest'
    ? (customScriptCategory || 'Suggest Best Fits')
    : scriptCategory

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
                <h2 className="text-sm font-medium text-gray-700">Award Directions</h2>
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
                    {(['default', 'category_fit', 'medal_chance', 'roi'] as const).map(key => (
                      <button
                        key={key}
                        onClick={() => setDirSortKey(key)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          dirSortKey === key
                            ? 'bg-green-800 border-green-700 text-white'
                            : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {key === 'default' ? 'Default' : key === 'category_fit' ? 'Category Fit ↓' : key === 'medal_chance' ? 'Medal Chance ↓' : 'ROI ↓'}
                      </button>
                    ))}
                  </div>
                )}
              <div className="grid grid-cols-1 gap-4">
                {[...directions].sort((a, b) => {
                  if (dirSortKey === 'category_fit') {
                    return (b.win_likelihood ?? 0) - (a.win_likelihood ?? 0)
                  }
                  if (dirSortKey === 'medal_chance') {
                    const aEval = evaluations[a.id]?.judge ?? evaluations[a.id]?.coach
                    const bEval = evaluations[b.id]?.judge ?? evaluations[b.id]?.coach
                    const aChance = calculateWinLikelihood(a.best_show, aEval?.overall_score)
                    const bChance = calculateWinLikelihood(b.best_show, bEval?.overall_score)
                    return bChance - aChance
                  }
                  if (dirSortKey === 'roi') {
                    const aRoi = computeRoiIndex(a.best_show, a.win_likelihood ?? undefined)
                    const bRoi = computeRoiIndex(b.best_show, b.win_likelihood ?? undefined)
                    return bRoi - aRoi
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
                            {/* Win Likelihood */}
                            <div>
                              {(() => {
                                const evalScore = (evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)?.overall_score
                                const winPct = calculateWinLikelihood(d.best_show, evalScore)
                                return (
                                  <>
                                    <p className={`text-base font-semibold tabular-nums ${winPct >= 20 ? 'text-green-700' : winPct >= 10 ? 'text-amber-700' : 'text-red-600'}`}>~{winPct}%</p>
                                    <p className="text-gray-400 text-xs">chance of medal{!evalScore ? '*' : ''}</p>
                                  </>
                                )
                              })()}
                            </div>
                            {/* ROI Index — category-fit adjusted */}
                            {(() => {
                              const roiIdx = computeRoiIndex(d.best_show, d.win_likelihood ?? undefined)
                              if (!roiIdx) return null
                              return (
                                <div>
                                  <p className={`text-base font-semibold tabular-nums ${roiIdx >= 70 ? 'text-green-700' : roiIdx >= 40 ? 'text-amber-700' : 'text-gray-500'}`}>{roiIdx}<span className="text-xs font-normal text-gray-400">/100</span></p>
                                  <p className="text-gray-400 text-xs">ROI index</p>
                                </div>
                              )
                            })()}
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
            {directions.some(d => d.win_likelihood !== null && !(evaluations[d.id]?.judge ?? evaluations[d.id]?.coach)) && (
              <p className="text-xs text-gray-400 mt-4">* Chance of Medal based on show base rate only — evaluate an entry to factor in content quality.</p>
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
                    // Session 57: three views on the eval panel — judge / coach /
                    // the Recommended Next Steps tab. Falls back to whichever
                    // mode actually exists when the stored view does not.
                    const requestedView = evalDisplayMode[dirId] ?? (hasJudge ? 'judge' : 'coach')
                    const activeView: 'judge' | 'coach' | 'nextsteps' =
                      requestedView === 'nextsteps' ? 'nextsteps'
                        : requestedView === 'coach' && hasCoach ? 'coach'
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

                    // S153: extract the movable blocks so one copy can render either the
                    // desktop side-by-side layout or the old single stack (?sxs=0).
                    const sxsEditSurface = (
                      <>
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
                            const isExpanded = expandedEntryFields[field.id] ?? false
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
                                  {isExpanded && (
                                    <div className="mt-3 max-h-96 overflow-y-auto pr-1">
                                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
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
                      </>
                    )
                    const sxsEvalTop = (
                      <>
                        {/* Evaluation panel */}
                        {(hasJudge || hasCoach) && (
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
                              {hasCoach && (
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
                                  hasScript={!!((scriptText && scriptText.trim()) || project?.script_text)}
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
                            {(() => {
                              const isCoach = evaluation.evaluation_mode === 'coach'
                              const untapped = parseFloat((10 - evaluation.overall_score).toFixed(1))
                              const displayScore = isCoach ? untapped : evaluation.overall_score
                              return (
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span
                                    className={`font-bold tabular-nums ${isCoach ? coachScoreColor(displayScore) : scoreColor(displayScore)}`}
                                    style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '2.8rem', lineHeight: 1, letterSpacing: '-0.02em' }}
                                  >
                                    {displayScore.toFixed(1)}
                                  </span>
                                  <span className="text-gray-400" style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '1.25rem' }}>/10</span>
                                  {/* Overall delta badge — shown as raw score change regardless of mode */}
                                  {deltas?.['overall'] !== undefined && deltas['overall'] !== 0 && (
                                    <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-full ${deltas['overall'] > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                      {deltas['overall'] > 0 ? `↑ +${deltas['overall']}` : `↓ ${deltas['overall']}`}
                                    </span>
                                  )}
                                  {deltas?.['overall'] === 0 && (
                                    <span className="text-sm text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">— No change</span>
                                  )}
                                  {/* Mode badge */}
                                  {isCoach ? (
                                    <span className="text-xs font-medium bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full">✦ Coach Review</span>
                                  ) : (
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">⚖ Jury Evaluation</span>
                                  )}
                                </div>
                                {/* Coach: label the inverted score, then explain what it measures */}
                                {isCoach && (
                                  <p className="text-xs font-semibold text-gray-500 mt-1">untapped potential <span className="font-normal text-gray-400">— lower is better</span></p>
                                )}
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {isCoach
                                    ? 'Estimated gap between this draft and your campaign\'s full potential'
                                    : 'Scored on entry as written'}
                                </p>
                              </div>
                              <p className="text-xs text-gray-400">
                                {new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                              )
                            })()}

                            {/* Coach mode: explain that dimension scores still read higher = more covered */}
                            {evaluation.evaluation_mode === 'coach' && (
                              <p className="text-xs text-gray-400 italic mb-3">
                                Dimension scores show how fully each aspect of your campaign&apos;s available material is represented in this draft. Higher = stronger coverage; lower = more to unlock in that area.
                              </p>
                            )}

                            {/* AOY weight-aware jury (S75): per-section scores x section_weight.
                                Replaces the fixed 6-dimension campaign grid for AOY entries. */}
                            {(() => {
                              const aoyOut = evaluation.output as unknown as {
                                aoy?: boolean; pillar?: string; category_key?: string; weight_warning?: string | null;
                                sections?: { key: string; label: string; weight: number; score: number; weighted_contribution: number; rationale: string; is_placeholder: boolean }[]
                              } | null
                              if (!aoyOut?.aoy) return null
                              const secs = Array.isArray(aoyOut.sections) ? aoyOut.sections : []
                              return (
                                <div className="mb-5">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-600">Weighted rubric: {aoyOut.category_key}</span>
                                    {aoyOut.pillar && <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{aoyOut.pillar} pillar</span>}
                                  </div>
                                  {aoyOut.weight_warning && <p className="text-xs text-amber-600 mb-2">{aoyOut.weight_warning}</p>}
                                  {(() => {
                                    const maxWeight = secs.reduce((m, x) => Math.max(m, x.weight || 0), 1)
                                    return (
                                  <div className="space-y-2">
                                    {secs.map(s => {
                                      const sDelta = deltas?.[s.key]
                                      return (
                                        <div key={s.key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                                          <div className="flex items-baseline justify-between gap-2">
                                            <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label} <span className="text-gray-400 font-normal">{s.weight}% of score</span></p>
                                            <div className="flex items-baseline gap-1.5 flex-shrink-0">
                                              <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                                              {sDelta !== undefined && sDelta !== 0 && (
                                                <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="mt-1.5"><MeterBar fraction={(s.weight || 0) / maxWeight} /></div>
                                          <p className="text-xs text-gray-400 mt-1 tabular-nums">Adds {s.weighted_contribution} to the weighted total{s.is_placeholder ? ' · section not written' : ''}</p>
                                          {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                                        </div>
                                      )
                                    })}
                                  </div>
                                    )
                                  })()}
                                </div>
                              )
                            })()}

                            {/* SMARTIES qualitative jury (S92): per-section scores
                                plus a holistic overall. SMARTIES publishes no section
                                weighting, so there is no weighted total. Replaces the
                                fixed campaign grid for SMARTIES entries. */}
                            {(() => {
                              const smOut = evaluation.output as unknown as {
                                smarties?: boolean; category?: string | null;
                                sections?: { field_key: string; label: string; score: number; rationale: string; is_placeholder: boolean }[]
                              } | null
                              if (!smOut?.smarties) return null
                              const secs = Array.isArray(smOut.sections) ? smOut.sections : []
                              return (
                                <div className="mb-5">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-600">SMARTIES case study{smOut.category ? `: ${smOut.category}` : ''}</span>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">holistic score, no published section weighting</span>
                                  </div>
                                  <div className="space-y-2">
                                    {secs.map(s => {
                                      const sDelta = deltas?.[s.field_key]
                                      return (
                                        <div key={s.field_key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                                          <div className="flex items-baseline justify-between gap-2">
                                            <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label}</p>
                                            <div className="flex items-baseline gap-1.5 flex-shrink-0">
                                              <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                                              {sDelta !== undefined && sDelta !== 0 && (
                                                <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                                              )}
                                            </div>
                                          </div>
                                          {s.is_placeholder && <p className="text-xs text-gray-400 mt-1">Section not written</p>}
                                          {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Config jury (S98 Chunk 5): per-section breakdown from
                                evaluate-entry-config, branching ONCE on scoring_mode.
                                Weighted mirrors the AOY weighted panel (score x weight,
                                weighted contribution, MeterBar); qualitative mirrors the
                                SMARTIES panel (per-section 0-10, holistic overall shown
                                in the header). This is the from-spec render that replaces
                                per-show SMARTIES JSX. */}
                            {(() => {
                              const cfgOut = evaluation.output as unknown as {
                                config?: boolean; scoring_mode?: 'weighted' | 'qualitative'
                                category_key?: string | null; category?: string | null; weight_warning?: string | null
                                sections?: { key?: string; field_key?: string; label: string; weight?: number; score: number; weighted_contribution?: number; rationale: string; is_placeholder: boolean }[]
                              } | null
                              if (!cfgOut?.config) return null
                              const secs = Array.isArray(cfgOut.sections) ? cfgOut.sections : []
                              const isWeighted = cfgOut.scoring_mode === 'weighted'
                              const cat = cfgOut.category_key ?? cfgOut.category ?? null
                              const maxWeight = isWeighted ? secs.reduce((m, x) => Math.max(m, x.weight || 0), 1) : 1
                              return (
                                <div className="mb-5">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-600">{isWeighted ? 'Weighted rubric' : 'Case study'}{cat ? `: ${cat}` : ''}</span>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{isWeighted ? 'config jury' : 'holistic score, no published section weighting'}</span>
                                  </div>
                                  {isWeighted && cfgOut.weight_warning && <p className="text-xs text-amber-600 mb-2">{cfgOut.weight_warning}</p>}
                                  <div className="space-y-2">
                                    {secs.map((s, i) => {
                                      const sKey = s.key ?? s.field_key ?? String(i)
                                      const sDelta = deltas?.[sKey]
                                      return (
                                        <div key={sKey} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                                          <div className="flex items-baseline justify-between gap-2">
                                            <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label}{isWeighted && typeof s.weight === 'number' ? <span className="text-gray-400 font-normal"> {s.weight}% of score</span> : null}</p>
                                            <div className="flex items-baseline gap-1.5 flex-shrink-0">
                                              <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                                              {sDelta !== undefined && sDelta !== 0 && (
                                                <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                                              )}
                                            </div>
                                          </div>
                                          {isWeighted && <div className="mt-1.5"><MeterBar fraction={(s.weight || 0) / maxWeight} /></div>}
                                          {isWeighted && typeof s.weighted_contribution === 'number' && <p className="text-xs text-gray-400 mt-1 tabular-nums">Adds {s.weighted_contribution} to the weighted total{s.is_placeholder ? ' · section not written' : ''}</p>}
                                          {!isWeighted && s.is_placeholder && <p className="text-xs text-gray-400 mt-1">Section not written</p>}
                                          {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}

                            {/* AOY market-context modifier (S85, Phase 3, Option B):
                                a bounded, source-cited adjustment shown ALONGSIDE the
                                calibrated raw score. The raw score never changes; every
                                nonzero delta names the sourced market fact behind it. */}
                            {(() => {
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

                            {!((evaluation.output as unknown as { aoy?: boolean } | null)?.aoy) && !((evaluation.output as unknown as { smarties?: boolean } | null)?.smarties) && !((evaluation.output as unknown as { config?: boolean } | null)?.config) && (
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
                            )}

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
                                          <div className="mb-5">
                                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Recommendations to Help Your Chances</p>
                                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{o.recommendations}</p>
                                          </div>
                                        )}

                                        {/* Campaign name note */}
                                        {o.campaign_name_note && (
                                          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">On the Campaign Name</p>
                                            <p className="text-sm text-gray-700 leading-relaxed">{o.campaign_name_note}</p>
                                          </div>
                                        )}

                                        {/* Session 57: the Next Step card moved from here into the
                                            "✦ Recommended Next Steps" tab on the eval view strip
                                            (activeView === 'nextsteps'). Do not reintroduce it inline. */}
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

                            {/* Fix-this chips — user selects which issues to prioritise */}
                            {(() => {
                              const o = evaluation.output as EvaluationOutput | null
                              const judgeOutput = evaluation.evaluation_mode === 'judge' ? o as JudgeOutput | null : null
                              const coachOutput = evaluation.evaluation_mode === 'coach' ? o as CoachOutput | null : null
                              const chipItems: string[] =
                                judgeOutput?.kills_it?.length ? judgeOutput.kills_it :
                                coachOutput?.priority_fixes?.length ? coachOutput.priority_fixes.map(pf => pf.fix) :
                                evaluation.gaps?.length ? evaluation.gaps : []
                              if (chipItems.length === 0) return null
                              const selected = draftFocusItems[dirId] || []
                              return (
                                <div className="mt-5 pt-4 border-t border-gray-200">
                                  <button
                                    type="button"
                                    onClick={() => setFixChipsOpen(prev => ({ ...prev, [dirId]: !(prev[dirId] ?? false) }))}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 transition-colors"
                                  >
                                    Focus the next draft on…
                                    <span className="text-gray-400">{(fixChipsOpen[dirId] ?? false) ? '▲' : '▼'}</span>
                                  </button>
                                  {(fixChipsOpen[dirId] ?? false) && (<>
                                  <div className="flex flex-wrap gap-2">
                                    {chipItems.map((item, i) => {
                                      const active = selected.includes(item)
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => toggleFocusItem(dirId, item)}
                                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors text-left ${
                                            active
                                              ? 'bg-green-800 text-white border-green-800'
                                              : 'bg-white text-gray-600 border-gray-300 hover:border-green-600 hover:text-green-700'
                                          }`}
                                        >
                                          {active ? '✓ ' : ''}{item.length > 60 ? item.slice(0, 57) + '…' : item}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  {selected.length > 0 && (
                                    <p className="text-xs text-green-700 mt-2">{selected.length} issue{selected.length > 1 ? 's' : ''} selected — the draft will prioritise these above all others.</p>
                                  )}
                                  </>)}
                                </div>
                              )
                            })()}

                            {/* Generate Improved Draft — prominent CTA anchored to this evaluation */}
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
                            </div>
                          </div>
                          ) : null}
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
                    const sxsRoi = (
                      <>
                        {/* ── ROI Estimation ─────────────────────────────────────────
                             Shows after jury eval, updates when coach review also exists.
                             Jury-only:   quality = juryScore × 10
                             Combined:    quality = (juryScore + untappedPotential) × 10
                             Both capped at 100 before passing to computeRoiIndex. */}
                        {(hasJudge || hasCoach) && dirShow && (() => {
                          const juryScore  = evalBoth.judge?.overall_score
                          const coachScore = evalBoth.coach?.overall_score
                          const untapped   = coachScore !== undefined
                            ? parseFloat((10 - coachScore).toFixed(1))
                            : undefined
                          // Jury-only quality: score × 10, capped at 100
                          const juryQuality = juryScore !== undefined
                            ? Math.min(100, juryScore * 10)
                            : undefined
                          // Combined quality: (juryScore + untapped) × 10, capped at 100
                          const combinedQuality = juryScore !== undefined && untapped !== undefined
                            ? Math.min(100, (juryScore + untapped) * 10)
                            : undefined
                          const baseRoi     = computeRoiIndex(dirShow)
                          const juryRoi     = juryQuality !== undefined  ? computeRoiIndex(dirShow, juryQuality)     : undefined
                          const combinedRoi = combinedQuality !== undefined ? computeRoiIndex(dirShow, combinedQuality) : undefined
                          if (!baseRoi) return null
                          const roiColor = (v: number) => v >= 70 ? 'text-green-700' : v >= 40 ? 'text-amber-700' : 'text-gray-500'
                          const roiBg    = (v: number) => v >= 70 ? 'bg-green-50 border-green-200' : v >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                          return (
                            <div className="px-5 py-4 border-b border-gray-200 bg-white">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">ROI Estimation</p>
                              <div className="flex flex-wrap gap-2">
                                {/* Base — no quality adjustment */}
                                <div className={`flex-1 min-w-[100px] border rounded-lg px-3 py-2.5 ${roiBg(baseRoi)}`}>
                                  <p className={`text-xl font-bold tabular-nums ${roiColor(baseRoi)}`}>
                                    {baseRoi}<span className="text-xs font-normal text-gray-400">/100</span>
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">Base</p>
                                </div>
                                {/* Jury-adjusted */}
                                {juryRoi !== undefined && (
                                  <div className={`flex-1 min-w-[100px] border rounded-lg px-3 py-2.5 ${roiBg(juryRoi)}`}>
                                    <p className={`text-xl font-bold tabular-nums ${roiColor(juryRoi)}`}>
                                      {juryRoi}<span className="text-xs font-normal text-gray-400">/100</span>
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">Jury score adjusted</p>
                                  </div>
                                )}
                                {/* Combined potential — jury + coach untapped */}
                                {combinedRoi !== undefined && (
                                  <div className={`flex-1 min-w-[100px] border-2 rounded-lg px-3 py-2.5 ${roiBg(combinedRoi)}`}>
                                    <p className={`text-xl font-bold tabular-nums ${roiColor(combinedRoi)}`}>
                                      {combinedRoi}<span className="text-xs font-normal text-gray-400">/100</span>
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">Maximum potential</p>
                                    <p className="text-xs text-gray-400">({juryScore?.toFixed(1)} + {untapped?.toFixed(1)} untapped)</p>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-2.5 leading-relaxed">
                                Prestige × Base Medal Chance Rate % ÷ entry fee, quality-adjusted. Index normalized to 100.
                              </p>
                            </div>
                          )
                        })()}
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
                                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2"
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
                                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors flex items-center gap-2"
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
                                className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 disabled:opacity-40 px-4 py-2 rounded transition-colors flex items-center gap-2"
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
                                  className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded transition-colors"
                                  title="Download the current draft as a text file"
                                >
                                  ↓ Share Draft
                                </button>
                              )}
                              {evaluation && d && (
                                <button
                                  onClick={() => downloadEvaluation(d, evaluation)}
                                  className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-4 py-2 rounded transition-colors"
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
                                    className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
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
                                    className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
                                  >
                                    {smartDirectionsLoading[dirId] === 'other_shows' ? (
                                      <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Finding…</>
                                    ) : '✦ Alt Shows'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setTab('directions')}
                                  className="text-xs font-medium text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-4 py-2 rounded transition-colors flex items-center gap-1.5"
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

                        {/* AOY Coach — advisory per-section guidance (generate-aoy-coach,
                            S77). AOY directions only; not an evaluations row, so it
                            renders separately from the Jury panel. */}
                        {isAoyShow(d?.best_show ?? '') && coachingError && coachingForDirectionId === dirId && (
                          <div className="px-5 py-3 border-b border-gray-200"><ErrorBanner error={coachingError} /></div>
                        )}
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
                            <div className="border-b border-gray-200 bg-green-50/40 px-5 py-4">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800">✦ AOY Coach</span>
                                <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{c.pillar} pillar</span>
                                <span className="text-xs text-gray-400">advisory, not a score</span>
                              </div>
                              {coachStale && (
                                <p className="text-xs text-amber-700 mb-2">Draft changed since this coaching. Re-run AOY Coach for advice on the current version.</p>
                              )}
                              {c.overall && <p className="text-sm text-gray-700">{c.overall}</p>}
                              {c.priorities.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-600 mb-1">Highest-leverage fixes</p>
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

                        {/* Config Coach — advisory per-section guidance
                            (generate-entry-coach-config, S98 Chunk 5). Non-AOY config
                            directions (weighted or qualitative, e.g. SMARTIES); not an
                            evaluations row, so it renders separately from the Jury
                            panel. Replaces the dedicated SMARTIES coach panel (S93).
                            Reuses the shared coaching error state. */}
                        {configModeFor(dirId, d?.best_show) && coachingError && coachingForDirectionId === dirId && (
                          <div className="px-5 py-3 border-b border-gray-200"><ErrorBanner error={coachingError} /></div>
                        )}
                        {configCoaching[dirId] && (() => {
                          const c = configCoaching[dirId]
                          return (
                            <div className="border-b border-gray-200 bg-green-50/40 px-5 py-4">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-lg font-semibold text-gray-800">✦ Coach</span>
                                {c.category_key && <span className="text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{c.category_key}</span>}
                                <span className="text-sm text-gray-400">advisory, not a score</span>
                              </div>
                              {/* framing_degraded (S98 Chunk 4): Coach ran without the
                                  show's full jury framing. Surface it so a generic pass
                                  is visible rather than mistaken for show-calibrated advice. */}
                              {c.framing_degraded && (
                                <p className="text-sm text-amber-700 mb-2">Coaching without full show framing. Advice is general; seed this show&apos;s jury framing for show-specific guidance.</p>
                              )}
                              {c.overall && <p className="text-base text-gray-700 leading-relaxed">{c.overall}</p>}
                              {c.priorities.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium text-gray-600 mb-1">Highest-leverage fixes</p>
                                  <ul className="list-disc list-inside space-y-1">{c.priorities.map((p, i) => <li key={i} className="text-base text-gray-600 leading-relaxed">{p}</li>)}</ul>
                                </div>
                              )}
                              <div className="mt-3 space-y-2">
                                {c.sections.map(sec => (
                                  <div key={sec.key} className={`border rounded-lg px-3 py-2.5 ${sec.is_placeholder ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p className="text-base font-medium text-gray-800 min-w-0 flex-1">{sec.label}{typeof sec.weight === 'number' ? <span className="text-gray-400 font-normal"> {sec.weight}% of score</span> : null}</p>
                                      {sec.is_placeholder && <span className="text-sm text-gray-400 flex-shrink-0">not written</span>}
                                    </div>
                                    {sec.missing.length > 0 && <p className="text-base text-amber-700 mt-1.5 leading-relaxed">Missing: {sec.missing.join('; ')}</p>}
                                    {sec.suggestions.length > 0 && (
                                      <ul className="list-disc list-inside mt-1 space-y-1">{sec.suggestions.map((x, i) => <li key={i} className="text-base text-gray-600 leading-relaxed">{x}</li>)}</ul>
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
                                      className="text-sm font-medium text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      {feedbackCopied[copyKey] ? '✓ Copied' : 'Copy feedback'}
                                    </button>
                                    <button
                                      onClick={() => downloadCoachFeedback(d, evalBoth.judge, fbInput)}
                                      className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                      ↓ Feedback .txt
                                    </button>
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })()}
                        {sideBySidePreview ? (
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
                            {sxsRoi}
                          </>
                        ) : (
                          <>
                            {sxsEvalTop}
                            {sxsRoi}
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

        {/* ── VIDEO SCRIPT ── */}
        {tab === 'script' && (
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
        )}

        {/* ── PRESS KIT ── */}
        {tab === 'presskit' && (
          <div className="max-w-2xl">

            {/* Nudge: no press contact configured */}
            {!orgPressProfile?.pr_contact_name && !orgPressProfile?.pr_contact_email && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                <span className="text-amber-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm text-amber-800 font-medium">Press contact not configured</p>
                  <p className="text-xs text-amber-700 mt-0.5">Add your press contact details and agency profile on the <button onClick={() => window.open('/projects', '_self')} className="underline">Projects page</button> to include them in generated press kits.</p>
                </div>
              </div>
            )}

            {/* Logo display / nudge */}
            {orgPressProfile && (
              <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white border border-gray-200 rounded-xl">
                {orgPressProfile.logo_url ? (
                  <>
                    <img
                      src={supabase.storage.from('org-logos').getPublicUrl(orgPressProfile.logo_url).data.publicUrl}
                      alt="Logo"
                      className="h-8 max-w-[100px] object-contain"
                    />
                    <p className="text-xs text-gray-400">Logo will appear in PDF press kits. <button onClick={() => router.push('/projects')} className="text-green-700 hover:text-green-600 underline">Manage on Profile page.</button></p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No logo uploaded. <button onClick={() => router.push('/projects')} className="text-green-700 hover:text-green-600 underline">Add a logo on the Profile page</button> to include it in PDF press kits.</p>
                )}
              </div>
            )}

            {/* Header + Select All */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Select Directions to Export</h2>
                <p className="text-xs text-gray-400 mt-0.5">One press kit per direction. Directions without an entry draft are unavailable.</p>
              </div>
              {directions.length > 0 && (
                <div className="flex gap-3 flex-shrink-0 ml-4">
                  <button
                    onClick={() => {
                      const eligibleIds = directions.filter(d => getCurrentDraftFields(d.id).length > 0).map(d => d.id)
                      setSelectedPressKitDirs(new Set(eligibleIds))
                    }}
                    className="text-xs text-green-700 hover:text-green-600 transition-colors"
                  >Select all</button>
                  <button
                    onClick={() => setSelectedPressKitDirs(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >Clear</button>
                </div>
              )}
            </div>

            {/* Direction list */}
            {directions.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                {/* Session 54 — guidance-flavored empty state (v3 brief §10) */}
                {guidanceEnabled && (
                  <p className="text-gray-700 text-sm mb-2">
                    One click after the entry. The press materials are often what travels farthest.
                  </p>
                )}
                <p className="text-sm text-gray-400">
                  No directions yet. Generate directions first, then create entry drafts before producing press kits.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {directions.map(d => {
                  const hasFields = getCurrentDraftFields(d.id).length > 0
                  const isSelected = selectedPressKitDirs.has(d.id)
                  const isGenerated = !!pressKitOutputs[d.id]
                  return (
                    <div
                      key={d.id}
                      className={`bg-white border rounded-xl px-4 py-3 transition-colors ${
                        isSelected ? 'border-green-400 bg-green-50/30' : 'border-gray-200'
                      } ${!hasFields ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!hasFields}
                          onChange={e => {
                            setSelectedPressKitDirs(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(d.id)
                              else next.delete(d.id)
                              return next
                            })
                          }}
                          className="w-4 h-4 accent-green-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {d.best_show && d.best_category ? `${d.best_show} — ${d.best_category}` : d.name}
                          </p>
                          {d.hook && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate italic">{d.hook}</p>
                          )}
                          {!hasFields && (
                            <p className="text-xs text-amber-600 mt-0.5">No entry draft — generate one first</p>
                          )}
                          {hasFields && (
                            <p className="text-xs text-gray-400 mt-0.5">{getCurrentDraftFields(d.id).length} fields ready</p>
                          )}
                        </div>
                        {isGenerated && (
                          <span className="text-xs text-green-700 font-medium flex-shrink-0">✓ Ready</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Generate button */}
            {directions.length > 0 && (
              <button
                onClick={generatePressKits}
                disabled={selectedPressKitDirs.size === 0 || pressKitGenerating}
                className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded transition-colors mb-8"
              >
                {pressKitGenerating
                  ? 'Generating…'
                  : selectedPressKitDirs.size === 0
                  ? 'Select at least one direction'
                  : `Generate ${selectedPressKitDirs.size} Press Kit${selectedPressKitDirs.size > 1 ? 's' : ''}`}
              </button>
            )}

            {/* Generated outputs */}
            {Object.keys(pressKitOutputs).length > 0 && (
              <div className="space-y-6">
                <h2 className="text-sm font-semibold text-gray-800">Generated Press Kits</h2>
                {directions
                  .filter(d => pressKitOutputs[d.id])
                  .map(d => {
                    const extra = pressKitExtras[d.id]
                    const dirLabel = d.best_show && d.best_category ? `${d.best_show} — ${d.best_category}` : d.name

                    // Press target options for press hook AI generation
                    const PRESS_TARGET_OPTIONS = ['Local', 'Regional', 'Global', 'Trade / Industry', 'Consumer', 'Broadcast']
                    const dirPressTargets = pressTargets[d.id] ?? []
                    const anyPressHookLoading = PRESS_TARGET_OPTIONS.some(t => pressKitAiLoading[`${d.id}-pressHook-${t}`])

                    // Helper to render a plain-text copyable section (with optional AI generation)
                    const aiFields = new Set<keyof PressKitExtra>(['quickSummary', 'linkedinPost', 'xPost', 'instagramCaption'])
                    const ExtraSection = ({ label, field, value, hint }: { label: string; field: keyof PressKitExtra; value: string; hint?: string }) => {
                      const key = `${d.id}-${field}`
                      const copied = pressKitCopiedExtra[key]
                      const aiText = pressKitAiCopy[key]
                      const aiLoading = pressKitAiLoading[key]
                      const displayText = aiText || value
                      const canAI = aiFields.has(field)
                      const draft = pressKitDrafts[key]
                      const hasVersionB = !!(draft?.version_b)
                      const hasVersionC = !!(draft?.version_c)
                      const selectedVersion = draft?.selected ?? 'a'
                      return (
                        <div className="border-t border-gray-100 px-4 py-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div>
                              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</p>
                              {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {canAI && (
                                <button
                                  onClick={() => generateAiPressCopy(d.id, field as 'linkedinPost' | 'xPost' | 'instagramCaption' | 'quickSummary')}
                                  disabled={aiLoading}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                    aiLoading ? 'bg-gray-100 text-gray-400' : 'bg-green-50 hover:bg-green-100 text-green-800 border border-green-200'
                                  }`}
                                >
                                  {aiLoading ? '…' : aiText ? '✦ Regenerate' : '✦ AI Draft'}
                                </button>
                              )}
                              <button
                                onClick={() => copyPressKitExtra(d.id, field)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                  copied ? 'bg-green-100 text-green-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                              >
                                {copied ? '✓ Copied!' : '📋 Copy'}
                              </button>
                            </div>
                          </div>
                          {/* Version pills — shown when more than one AI generation exists */}
                          {draft && (hasVersionB || hasVersionC) && (
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-xs text-gray-400 mr-0.5">Version:</span>
                              {(['a', 'b', 'c'] as const).filter(v => v === 'a' || (v === 'b' && hasVersionB) || (v === 'c' && hasVersionC)).map(v => (
                                <button
                                  key={v}
                                  onClick={() => selectPressKitVersion(d.id, field, v)}
                                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                    selectedVersion === v
                                      ? 'bg-green-700 text-white border-green-700'
                                      : 'bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-700'
                                  }`}
                                >
                                  {v === 'a' ? 'Latest' : v === 'b' ? 'Previous' : 'Older'}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${aiText ? 'text-gray-800' : 'text-gray-500'}`}>{displayText}</p>
                          {aiText && <p className="text-xs text-green-700 mt-1.5 font-medium">✦ AI draft — edit before posting</p>}
                        </div>
                      )
                    }

                    return (
                      <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

                        {/* Card header */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{dirLabel}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{d.name}</p>
                          </div>
                        </div>

                        {/* ── Outlook Email ── */}
                        <div className="border-t border-gray-100 px-4 py-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Outlook Email</p>
                              <p className="text-xs text-gray-400 mt-0.5">Formatted press email — paste directly into Outlook</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => downloadPressKitPDF(d.id)}
                                className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                ⬇ PDF
                              </button>
                              <button
                                onClick={() => copyPressKitToClipboard(d.id)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                  pressKitCopied[d.id]
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-green-800 hover:bg-green-700 text-white'
                                }`}
                              >
                                {pressKitCopied[d.id] ? '✓ Copied!' : '📋 Copy for Outlook'}
                              </button>
                            </div>
                          </div>
                          <div
                            className="text-xs text-gray-600 leading-relaxed overflow-hidden bg-gray-50 rounded-lg px-3 py-2"
                            style={{ maxHeight: '100px', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' }}
                            dangerouslySetInnerHTML={{ __html: pressKitOutputs[d.id] }}
                          />
                        </div>

                        {/* ── Extra sections ── */}
                        {extra && (
                          <>
                            {extra.quickSummary && (
                              <ExtraSection
                                label="Quick Summary"
                                field="quickSummary"
                                value={extra.quickSummary}
                                hint="2–3 sentences for email intros or press release openers"
                              />
                            )}
                            {/* ── Press Hook — multi-target AI ── */}
                            {extra.pressHook && (
                              <div className="border-t border-gray-100 px-4 py-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div>
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Press Hook</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Select target press types, then generate a tailored hook for each</p>
                                  </div>
                                  <button
                                    onClick={() => generateAiPressHooks(d.id)}
                                    disabled={dirPressTargets.length === 0 || anyPressHookLoading}
                                    className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                                      dirPressTargets.length === 0 || anyPressHookLoading
                                        ? 'bg-gray-50 text-gray-300 border-gray-200'
                                        : 'bg-green-50 hover:bg-green-100 text-green-800 border-green-200'
                                    }`}
                                  >
                                    {anyPressHookLoading ? '…' : '✦ AI Draft'}
                                  </button>
                                </div>

                                {/* Press target checkboxes */}
                                <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
                                  {PRESS_TARGET_OPTIONS.map(target => (
                                    <label key={target} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={dirPressTargets.includes(target)}
                                        onChange={e => {
                                          setPressTargets(prev => {
                                            const current = prev[d.id] ?? []
                                            return {
                                              ...prev,
                                              [d.id]: e.target.checked
                                                ? [...current, target]
                                                : current.filter(t => t !== target),
                                            }
                                          })
                                        }}
                                        className="rounded accent-green-700"
                                      />
                                      <span className="text-gray-600">{target}</span>
                                    </label>
                                  ))}
                                </div>

                                {/* Template hook (shown when no AI copies exist) */}
                                {!dirPressTargets.some(t => pressKitAiCopy[`${d.id}-pressHook-${t}`]) && (
                                  <p className="text-xs text-gray-400 leading-relaxed italic">{extra.pressHook}</p>
                                )}

                                {/* AI hooks — one per selected target */}
                                {dirPressTargets.length > 0 && (
                                  <div className="space-y-2 mt-2">
                                    {dirPressTargets.map(target => {
                                      const hookKey = `${d.id}-pressHook-${target}`
                                      const fieldKey = `pressHook-${target}`
                                      const aiHook = pressKitAiCopy[hookKey]
                                      const hookLoading = pressKitAiLoading[hookKey]
                                      const hookCopied = pressHookCopied[hookKey]
                                      const hookDraft = pressKitDrafts[`${d.id}-${fieldKey}`]
                                      const hookHasB = !!(hookDraft?.version_b)
                                      const hookHasC = !!(hookDraft?.version_c)
                                      const hookSelected = hookDraft?.selected ?? 'a'
                                      if (!aiHook && !hookLoading) return null
                                      return (
                                        <div key={target} className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                                          <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <p className="text-xs font-semibold text-green-800">{target} Press</p>
                                            {aiHook && (
                                              <button
                                                onClick={() => copyTextWithConfirm(hookKey, aiHook, setPressHookCopied)}
                                                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                                                  hookCopied ? 'bg-green-200 text-green-900' : 'bg-white hover:bg-green-100 text-green-800 border border-green-200'
                                                }`}
                                              >
                                                {hookCopied ? '✓ Copied!' : '📋 Copy'}
                                              </button>
                                            )}
                                          </div>
                                          {/* Version pills for press hooks */}
                                          {hookDraft && (hookHasB || hookHasC) && (
                                            <div className="flex items-center gap-1.5 mb-2">
                                              <span className="text-xs text-green-700 opacity-70 mr-0.5">Version:</span>
                                              {(['a', 'b', 'c'] as const).filter(v => v === 'a' || (v === 'b' && hookHasB) || (v === 'c' && hookHasC)).map(v => (
                                                <button
                                                  key={v}
                                                  onClick={() => selectPressKitVersion(d.id, fieldKey, v)}
                                                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                                    hookSelected === v
                                                      ? 'bg-green-700 text-white border-green-700'
                                                      : 'bg-white text-green-700 border-green-200 hover:bg-green-100'
                                                  }`}
                                                >
                                                  {v === 'a' ? 'Latest' : v === 'b' ? 'Previous' : 'Older'}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          {hookLoading
                                            ? <p className="text-xs text-gray-400 italic">Generating…</p>
                                            : <p className="text-xs text-gray-800 leading-relaxed">{aiHook}</p>
                                          }
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {extra.linkedinPost && (
                              <ExtraSection
                                label="LinkedIn Post"
                                field="linkedinPost"
                                value={extra.linkedinPost}
                                hint="Professional announcement — edit before posting"
                              />
                            )}
                            {extra.xPost && (
                              <ExtraSection
                                label="X / Twitter Post"
                                field="xPost"
                                value={extra.xPost}
                                hint={`${extra.xPost.length} / 280 characters`}
                              />
                            )}
                            {extra.instagramCaption && (
                              <ExtraSection
                                label="Instagram Caption"
                                field="instagramCaption"
                                value={extra.instagramCaption}
                                hint="Edit hashtags and emoji to suit your brand voice"
                              />
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Usage note */}
            <div className="mt-8 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-700">How to use Copy for Outlook:</strong> Click the button, then open a new email in Outlook and paste (Cmd/Ctrl+V). The formatted content will paste with styling intact. The grey placeholder sections show you where to add your personal introduction and sign-off before sending. All other sections copy as plain text.
              </p>
            </div>

          </div>
        )}

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
                      placeholder={categoriesForShow(quickEvalShow).length > 0 ? 'e.g. Seasonal Marketing, Film Craft, Creative Effectiveness…' : 'Type a category if you know it (optional)'}
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
