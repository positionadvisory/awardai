// segment-aoy-entry, AOY Phase 7 (Session 78; parallel-chunked S109)
// ─────────────────────────────────────────────────────────────────────────────
// Maps an UPLOADED, already-written AOY entry (a single document, e.g. a prior
// winning paper) onto the chosen category's WEIGHTED SECTIONS so the existing
// weight-aware jury (evaluate-aoy-entry) can score it. Writes one entry_drafts
// row per weighted section, each tagged with its authoritative section_weight,
// plus an executive-summary row and the CEO/CFO endorsement-gate row, in the
// SAME shape generate-aoy-draft produces. After this runs, an uploaded entry is
// a first-class AOY entry: scoreable, coachable, redraftable.
//
// EXTRACTIVE, NOT GENERATIVE. The model only LOCATES and lightly trims the parts
// of the uploaded entry that address each rubric section. It writes no new prose
// and invents no numbers. A section the entry does not address comes back empty
// and becomes a placeholder row (the jury then clamps that section to <=2, so an
// unaddressed weighted section correctly loses its weight). This is the opposite
// of generate-aoy-draft, which AUTHORS the entry from facts + materials.
//
// NEW, AOY-specific function. The campaign path and the drafter are untouched.
//
// S109 CHANGE (parallel-chunked extraction, fixes the 546 wall-clock kill):
//   Previously ONE non-streamed model call returned all sections at once. On a
//   full 10-page entry the extractive output ran up against max_tokens (8000)
//   and the generation time alone exceeded the Supabase edge wall-clock limit
//   (~150s), so the runtime KILLED the invocation before any handled response.
//   The client then showed its generic fallback: "Could not map ... (status 546)"
//   (a non-standard status with an empty body = a runtime kill, never one of this
//   function's own guard codes). Fix: the weighted sections are split into small
//   GROUPS and each group is extracted by its OWN concurrent model call, each
//   bounded (SUBCALL_MAX_TOKENS) and each with an AbortController deadline safely
//   under the edge limit. Wall clock is now ~the slowest single call regardless
//   of entry length. Extraction fidelity is unchanged (full text per section, no
//   truncation, no offset guessing). A stuck sub-call now returns a CLEAN mapped
//   error (AOYSEG-TIMEOUT, 504), never a silent runtime kill. NOTHING about
//   scoring changes: this function writes no score, so evaluate-entry.ts and
//   evaluate-aoy-entry.ts remain byte-frozen.
//
// AUTHORITATIVE SOURCES (never the model):
//   - section list + weights come from show_profiles.scoring_emphasis (the
//     official Entry Pack rubric), parsed here. The model only returns the
//     extracted text per section; the weight on each row is set from the rubric
//     by index, never from the model.
//   - the exact-key category lookup mirrors evaluate-entry byte-for-byte (parity
//     contract: normalizeAoyCategory + AOY_MARKET_PREFIXES + isAoyShow).
//
// GUARDS: the direction's show must be AOY (isAoyShow, NOTAOY guard). Requires
// the uploaded entry's text (passed by path; AOYSEG-NOTEXT if empty). Does NOT
// require agency_facts or entry_type='aoy' (it scores an existing document, not
// a generated one). Also requires a category-specific rubric row (the show-level
// NULL default has no weighted sections, so a generic AOY direction is rejected
// with a clear
// message).
//
// JWT verification: OFF (this function does its own auth, like generate-draft).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Campaign AOY exact-key rubric lookup (parity contract) ──────────────────
// MUST stay byte-for-byte equivalent to the copies in evaluate-entry.ts,
// detect-entry-context.ts and lib/aoy-taxonomy.ts. The node parity test asserts
// every picker output normalizes onto exactly one rubric key. Do not edit one
// copy without editing all and re-running the parity test.
const AOY_SHOW_NAME = 'Campaign Asia Agency of the Year'

const AOY_MARKET_PREFIXES = [
  'Cambodia, Laos, Myanmar', 'Cambodia-Laos-Myanmar',
  'Australia/New Zealand',
  'Rest of South Asia', 'Hong Kong SAR',
  'Greater China', 'Southeast Asia', 'South Asia', 'Japan/Korea', 'Australia/NZ',
  'New Zealand', 'Hong Kong', 'Philippines', 'Indonesia', 'Singapore',
  'Australia', 'Pakistan', 'Malaysia', 'Thailand', 'Vietnam', 'Taiwan',
  'China', 'India', 'Japan', 'Korea',
]

function isAoyShow(showName: string): boolean {
  const s = (showName ?? '').trim().toLowerCase()
  return s.includes('campaign asia') && s.includes('agency of the year')
}

function normalizeAoyCategory(raw: string): string {
  let s = (raw ?? '').replace(/\[NEW\]/gi, '').replace(/\s+/g, ' ').trim()
  for (const p of AOY_MARKET_PREFIXES) {
    if (s.toLowerCase().startsWith(p.toLowerCase() + ' ')) {
      s = s.slice(p.length + 1).trim()
      break
    }
  }
  return s
}

// ─── Pillar classification (spec §4) ─────────────────────────────────────────
// Derived from lib/aoy-taxonomy.ts PEOPLE_STEMS / BRAND_STEMS. People and Brand
// stems can also appear with an 'Asia-Pacific ' prefix (kept by the normalizer),
// so strip that prefix for pillar lookup only. Everything else is Agency.
const AOY_PEOPLE_STEMS = new Set([
  'Account Person of the Year', 'Agency Growth Leader of the Year',
  'Agency Head of the Year', 'AI Person/Team of the Year',
  'Channel/Engagement Planner of the Year', 'Corporate Communications/Marketing Team of the Year',
  'Creative Leader of the Year', 'Most Innovative MarTech Team of the Year',
  'New Business Development Person/Team of the Year', 'Producer of the Year',
  'Strategic/Brand Planner of the Year', 'Young Achiever of the Year',
  'Young Business Leader of the Year', 'Young Creative Person of the Year',
  'Programmatic Person of the Year',
])

const AOY_BRAND_STEMS = new Set([
  'AD Campaign of the Year', 'AI AD Campaign of the Year',
  'Brand of the Year', 'Marketer of the Year',
])

type AoyPillar = 'agency' | 'people' | 'brand'

function pillarForKey(rubricKey: string): AoyPillar {
  const base = rubricKey.replace(/^Asia-Pacific\s+/i, '').trim()
  if (AOY_PEOPLE_STEMS.has(base)) return 'people'
  if (AOY_BRAND_STEMS.has(base)) return 'brand'
  return 'agency'
}

// ─── scoring_emphasis parser ─────────────────────────────────────────────────
// Format: "Weighted sections (total 100%): Name A 10%; Name B 15%; ...".
// Split on ';' (NOT ',', section names contain commas, e.g. "Strategy,
// Achievement against Objectives 25%"); each chunk ends with "NN%" or "NN.N%".
type WeightedSection = { name: string; weight: number }

function parseWeightedSections(scoringEmphasis: string | null | undefined): WeightedSection[] {
  if (!scoringEmphasis) return []
  const colon = scoringEmphasis.indexOf(':')
  const body = colon >= 0 ? scoringEmphasis.slice(colon + 1) : scoringEmphasis
  const out: WeightedSection[] = []
  for (const rawChunk of body.split(';')) {
    const chunk = rawChunk.trim()
    if (!chunk) continue
    const m = chunk.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*%\.?$/)
    if (!m) continue
    const name = m[1].trim()
    const weight = Number(m[2])
    if (name && Number.isFinite(weight)) out.push({ name, weight })
  }
  return out
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'section'
}

// ─── Page budget (Ben, S74): 10 A4 pages at ~500 words/page = 5,000 words.
// Reserve the exec summary (150) plus headings/charts/whitespace (~850); the
// remaining ~4,000 is split across sections by weight. Returned to the client so
// the draft canvas can show the budget meter.
const WORDS_PER_PAGE = 500
const MAX_PAGES = 10
const TOTAL_WORD_BUDGET = WORDS_PER_PAGE * MAX_PAGES   // 5000
const EXEC_SUMMARY_WORDS = 150
const OVERHEAD_WORDS = 850
const BODY_WORD_BUDGET = TOTAL_WORD_BUDGET - EXEC_SUMMARY_WORDS - OVERHEAD_WORDS // 4000

// ─── Parallel-chunked extraction knobs (S109) ───────────────────────────────
// SECTION_GROUP_SIZE weighted sections are extracted per model call. Groups run
// concurrently, so total wall clock ~ the slowest single call, not the sum.
// SUBCALL_MAX_TOKENS bounds each call's output. SUBCALL_TIMEOUT_MS is the
// per-call AbortController deadline; it sits well under the Supabase edge
// wall-clock limit (~150s) so a stuck upstream call returns AOYSEG-TIMEOUT (504)
// with time to spare instead of being killed by the runtime with an empty body.
//
// GROUP SIZE 1 (measured, S109): the first cut used size 2 and still timed out.
// The DIAG logs showed WHY: parallelism was healthy (three groups finished in
// 6-34s at ~40-55 tok/s, no throughput throttling), but the ONE group that
// paired the two heaviest sections (Achievement against Objectives + The Work
// and Creativity) AND carried the executive-summary request ran to the full
// budget and hit the abort. Fix: one section per call so no call bundles two
// heavy sections, and the executive summary gets its OWN dedicated call
// (non-fatal, see below). The heaviest single section then finishes well inside
// the window and the light ones finish in seconds.
const SECTION_GROUP_SIZE = 1
const SUBCALL_MAX_TOKENS = 4000
const SUBCALL_TIMEOUT_MS = 100000
// The executive summary is short (~150 words). Its own call is capped hard so it
// finishes in seconds and never becomes the slowest call. (S109: reusing the
// section prompt with an empty section list made the exec call ramble to the
// token ceiling and run out the 100s clock, holding the whole response even
// after every section had returned. Fixed with a dedicated prompt + this cap.)
const EXEC_MAX_TOKENS = 600

const PILLAR_LENS: Record<AoyPillar, string> = {
  agency: 'This is an AGENCY-performance entry. Evaluate and write to the agency\'s year: business performance and growth, new-business wins, client retention, talent and culture, and contribution to the industry. The unit of the story is the agency.',
  people: 'This is a PEOPLE entry about a single named individual (or named team). Write to that person\'s impact, leadership, trajectory and the evidence behind it. Use the agency facts as the commercial backing for the individual\'s achievements. The unit of the story is the person, not the agency.',
  brand: 'This is a BRAND entry about a brand, marketer or campaign. Write to brand outcomes, marketer impact and results. The unit of the story is the brand and its results, with the agency facts as supporting context.',
}

Deno.serve(async (req) => {
  // ── Dynamic CORS ──
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000').split(',').map(s => s.trim())
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { project_id, direction_id, material_path } = await req.json()
    if (!project_id || !direction_id || !material_path) {
      return new Response(JSON.stringify({ error: 'project_id, direction_id and material_path are required', code: 'AOYSEG-400' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Session 48: pass JWT explicitly, no-arg getUser() is unreliable in Deno.
    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch profile, project, direction; verify org ownership (IDOR) ──
    const [
      { data: profile },
      { data: project, error: projError },
      { data: direction, error: dirError },
    ] = await Promise.all([
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      supabase.from('projects')
        .select('id, org_id, campaign_name, client_name, combined_text, materials, entry_type, agency_facts')
        .eq('id', project_id).single(),
      supabase.from('directions').select('*').eq('id', direction_id).single(),
    ])
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (projError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'AOYSEG-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (Number(project.org_id) !== Number(profile.org_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found', code: 'AOYSEG-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Direction must belong to the same project + org (sequential bigint IDOR guard).
    if (Number(direction.org_id) !== Number(profile.org_id) || Number(direction.project_id) !== Number(project.id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── AOY guard ──
    if (!isAoyShow(direction.best_show ?? '')) {
      return new Response(JSON.stringify({
        error: 'This direction is not a Campaign Asia Agency of the Year entry. Use the standard evaluation for campaign entries.',
        code: 'AOYSEG-NOTAOY',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // No agency_facts / entry_type gate: segmentation scores an EXISTING uploaded
    // entry, so the source of truth is the document itself, not the validated
    // facts. The uploaded text is loaded below by material_path.

    // ── Paywall (fails open on lookup error, by design) ──
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, trial_unlimited')
      .eq('id', profile.org_id)
      .single()
    if (org && org.plan === 'free' && !org.trial_unlimited) {
      return new Response(JSON.stringify({
        error: 'subscription_required',
        message: 'An active Shortlist subscription is required to use this feature.',
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Rate limit (per-org hourly cap; trial_unlimited exempt in the RPC;
    //    fails open on RPC error). Uses the same usage_logs(org_id, action,
    //    created_at) scan as every other generator, no new index needed. ──
    const AOY_SEGMENT_RATE_LIMIT_PER_HOUR = 20
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'segment_aoy_entry',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= AOY_SEGMENT_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached, please try again in a little while.',
        code: 'AOYSEG-RATE',
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Exact-key rubric lookup (category-specific row REQUIRED) ──
    const rubricKey = normalizeAoyCategory(direction.best_category ?? '')
    if (!rubricKey) {
      return new Response(JSON.stringify({
        error: 'Pick a specific AOY category for this entry first. The market-scoped picker writes the category this needs.',
        code: 'AOYSEG-NOCAT',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: profileRow } = await supabase
      .from('show_profiles')
      .select('judging_philosophy, scoring_emphasis, language_guidance, common_mistakes')
      .eq('show_name', AOY_SHOW_NAME)
      .eq('category_pattern', rubricKey)
      .limit(1)
      .maybeSingle()

    const sections = parseWeightedSections(profileRow?.scoring_emphasis)
    if (!profileRow || sections.length === 0) {
      return new Response(JSON.stringify({
        error: 'No weighted rubric is on file for this exact category yet, so the entry cannot be mapped to weighted sections. Pick a category with a published rubric, or add the rubric first.',
        code: 'AOYSEG-NORUBRIC',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const pillar = pillarForKey(rubricKey)

    // ── Source: the uploaded entry text, read server-side from projects.materials
    //    by PATH (materials are addressed by path, never index). The DB JSONB row
    //    carries extracted_text (unlike the slim in-memory copy). Read-only. ──
    const materials: Array<{ path?: string; name?: string; extracted_text?: string }> =
      Array.isArray(project.materials) ? project.materials : []
    const sourceMaterial = materials.find(m => m && m.path === material_path)
    const entryText = (sourceMaterial?.extracted_text ?? '').trim()
    if (!entryText) {
      return new Response(JSON.stringify({
        error: 'Could not read the uploaded entry text. Re-upload the entry document, wait for text extraction to finish, then try again.',
        code: 'AOYSEG-NOTEXT',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Per-section word target, proportional to weight, against the body budget.
    // Used only for the row word_limit + the canvas budget meter; extraction is
    // not held to a word count.
    const weightSum = sections.reduce((acc, s) => acc + s.weight, 0) || 100
    const sectionTargets = sections.map(s => ({
      ...s,
      word_target: Math.max(50, Math.round((s.weight / weightSum) * BODY_WORD_BUDGET)),
    }))

    // ── draft_generation: never delete, always append ──
    const { data: genRows } = await supabase
      .from('entry_drafts')
      .select('draft_generation')
      .eq('direction_id', direction_id)
      .order('draft_generation', { ascending: false })
      .limit(1)
    const nextGeneration: number = (genRows?.[0]?.draft_generation ?? 0) + 1

    // ── System prompt (built once, reused for every group). Unchanged from the
    //    single-call version: the model is told to extract, per section, from the
    //    uploaded entry, and to return an empty string for any section the entry
    //    does not address. Only the SET of sections requested differs per call. ──
    const systemPrompt = `You are mapping an EXISTING, already-written Campaign Asia-Pacific Agency of the Year (AOY) entry onto the official weighted sections of one category, so the entry can be scored section by section. AOY is an AGENCY-PERFORMANCE programme judged by senior client marketers on a written paper.

${PILLAR_LENS[pillar]}

CATEGORY: ${rubricKey}
WHAT JURIES REWARD IN EACH SECTION: ${profileRow.scoring_emphasis ?? ''}

YOUR TASK: for each weighted section listed, find the part(s) of the uploaded entry that address it and return that content as the section text.

RULES:
- EXTRACTIVE ONLY. Return text drawn from the uploaded entry. Do NOT write new sentences, do NOT summarise into new claims, and do NOT add, round, or change any number. You may lightly trim and join the entry's own sentences; you may not invent.
- If the entry does not address a section, return an EMPTY STRING for it. Never fill a gap with content borrowed from another section or with anything invented. An empty section is the correct answer when the entry is silent: the scorer will penalise the gap, and that is intended.
- Do not place the same passage under multiple sections unless the entry genuinely makes that point in both places.
- WRITING STYLE, NON-NEGOTIABLE: never use em-dashes in any text you return, zero exceptions.
- Return ONLY a valid JSON object. No markdown fences, no preamble, no trailing prose.`

    // The <client_material> slice is IDENTICAL for every group (each call needs
    // the whole entry to locate its sections). This raises input tokens per call
    // but keeps output — the expensive, time-driving part — small per call.
    const materialBlock = `<client_material>
${entryText.slice(0, 45000)}
</client_material>`

    // Build groups of SECTION_GROUP_SIZE, preserving each section's GLOBAL index
    // so results map back onto the authoritative rubric order.
    type GroupItem = { globalIndex: number; name: string; weight: number }
    const groups: GroupItem[][] = []
    for (let i = 0; i < sectionTargets.length; i += SECTION_GROUP_SIZE) {
      groups.push(
        sectionTargets.slice(i, i + SECTION_GROUP_SIZE).map((s, j) => ({
          globalIndex: i + j, name: s.name, weight: s.weight,
        }))
      )
    }

    const buildUserPrompt = (group: GroupItem[], includeExec: boolean): string => {
      // Dedicated exec-summary prompt: asks ONLY for the summary, no sections
      // array, so the model returns a short string instead of rambling.
      if (includeExec && group.length === 0) {
        return `UPLOADED AOY ENTRY (extract the executive summary only):
ENTRY: ${project.campaign_name ?? 'Untitled'}${project.client_name ? `\nNAMED SUBJECT / CLIENT: ${project.client_name}` : ''}
TARGET: ${direction.best_show}, ${direction.best_category}

${materialBlock}

Return the entry's OWN executive summary or opening overview, drawn from the entry (you may lightly trim; do not invent, do not add or change numbers). Keep it to roughly 150 words. If the entry has no distinct executive summary, return an empty string.

Return ONLY this JSON object:
{
  "executive_summary": "..."
}`
      }
      const sectionSpec = group
        .map((s, i) => `${i + 1}. "${s.name}" (worth ${s.weight}% of the score)`)
        .join('\n')
      const execLine = includeExec
        ? `  "executive_summary": "the entry's own executive summary or opening overview if it has one, drawn from the entry; empty string if none",\n`
        : ''
      return `UPLOADED AOY ENTRY (the document to map onto the sections):
ENTRY: ${project.campaign_name ?? 'Untitled'}${project.client_name ? `\nNAMED SUBJECT / CLIENT: ${project.client_name}` : ''}
TARGET: ${direction.best_show}, ${direction.best_category}

${materialBlock}

Map it onto these weighted sections, in this exact order:
${sectionSpec}

Return ONLY this JSON object:
{
${execLine}  "sections": ["extracted text for section 1", "... one string per weighted section listed above, same order, empty string where the entry does not address it"]
}`
    }

    // ── One concurrent, bounded, time-limited model call per group ──
    type GroupOk = { ok: true; group: GroupItem[]; secs: string[]; exec: string; inTok: number; outTok: number }
    type GroupErr = { ok: false; kind: 'timeout' | 'ai' | 'parse' | 'network'; status?: number; detail?: string }
    type GroupResult = GroupOk | GroupErr

    const runGroup = async (group: GroupItem[], includeExec: boolean, maxTokens: number = SUBCALL_MAX_TOKENS): Promise<GroupResult> => {
      const label = group.length === 0 ? 'exec' : `g${group[0].globalIndex}[${group.map(x => x.globalIndex).join(',')}]`
      const t0 = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), SUBCALL_TIMEOUT_MS)
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            stream: false,
            system: systemPrompt,
            messages: [{ role: 'user', content: [{ type: 'text', text: buildUserPrompt(group, includeExec) }] }],
          }),
        })
        if (!res.ok) {
          const errorBody = await res.text()
          console.log(`segment-aoy-entry DIAG ${label}: HTTP ${res.status} after ${Date.now() - t0}ms :: ${errorBody.slice(0, 200)}`)
          return { ok: false, kind: 'ai', status: res.status, detail: errorBody.slice(0, 300) }
        }
        const data = await res.json()
        const rawText: string = (Array.isArray(data?.content) ? data.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
        const inTok: number = data.usage?.input_tokens ?? 0
        const outTok: number = data.usage?.output_tokens ?? 0
        const stopReason: string = data.stop_reason ?? '?'
        console.log(`segment-aoy-entry DIAG ${label}: OK ${Date.now() - t0}ms in=${inTok} out=${outTok} stop=${stopReason}`)
        const jsonStart = rawText.indexOf('{')
        const jsonEnd = rawText.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) {
          return { ok: false, kind: 'parse', detail: rawText.slice(0, 300) }
        }
        let parsed: { executive_summary?: unknown; sections?: unknown }
        try {
          parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
        } catch {
          return { ok: false, kind: 'parse', detail: rawText.slice(0, 300) }
        }
        const secs = Array.isArray(parsed.sections)
          ? parsed.sections.map((t: unknown) => (typeof t === 'string' ? t : ''))
          : []
        const exec = includeExec && typeof parsed.executive_summary === 'string' ? parsed.executive_summary : ''
        return { ok: true, group, secs, exec, inTok, outTok }
      } catch (err) {
        const aborted = (err as { name?: string })?.name === 'AbortError'
        console.log(`segment-aoy-entry DIAG ${label}: ${aborted ? 'TIMEOUT(abort)' : 'NETWORK-ERR'} after ${Date.now() - t0}ms`)
        return { ok: false, kind: aborted ? 'timeout' : 'network' }
      } finally {
        clearTimeout(timer)
      }
    }

    // Exec summary runs as its OWN call (empty section group, includeExec true),
    // so it never piles onto a heavy section's call. Section calls all run with
    // includeExec false. Everything fires concurrently.
    const startTime = Date.now()
    console.log(`segment-aoy-entry DIAG start: sections=${sectionTargets.length} sectionCalls=${groups.length} execCall=1 groupSize=${SECTION_GROUP_SIZE} maxTokens=${SUBCALL_MAX_TOKENS} entryChars=${entryText.length} sliceChars=${Math.min(entryText.length, 45000)}`)
    const [execResult, ...sectionResults] = await Promise.all([
      runGroup([], true, EXEC_MAX_TOKENS),
      ...groups.map(g => runGroup(g, false)),
    ])
    const latencyMs = Date.now() - startTime
    console.log(`segment-aoy-entry DIAG done: totalMs=${latencyMs}`)

    // ── Fail cleanly on any SECTION sub-call error (never a silent runtime kill).
    //    The exec call is NON-FATAL: if it fails or times out, the entry still
    //    maps and the executive-summary row falls back to its placeholder. ──
    const failure = sectionResults.find((r): r is GroupErr => !r.ok)
    if (failure) {
      if (failure.kind === 'timeout') {
        console.error('segment-aoy-entry: a section group timed out')
        return new Response(JSON.stringify({
          error: 'Mapping this entry took too long. It may be very long: try trimming it toward the ten-page entry limit, then run the jury read again.',
          code: 'AOYSEG-TIMEOUT',
        }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (failure.kind === 'ai') {
        console.error(`segment-aoy-entry: Anthropic API error, status ${failure.status}`, failure.detail ?? '')
        return new Response(JSON.stringify({ error: 'AI service error.', code: `AOYSEG-AI-${failure.status}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (failure.kind === 'network') {
        console.error('segment-aoy-entry: network error calling Anthropic')
        return new Response(JSON.stringify({ error: 'AI service error.', code: 'AOYSEG-AI-0' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.error('segment-aoy-entry: failed to parse AI response', failure.detail ?? '')
      return new Response(JSON.stringify({ error: 'Unexpected AI response.', code: 'AOYSEG-PARSE' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Assemble exec summary + per-section texts back into rubric order ──
    let execSummary = ''
    let inputTokens = 0
    let outputTokens = 0
    // Exec call is non-fatal: use its summary + tokens if it succeeded, else the
    // exec row falls back to its placeholder below.
    if (execResult.ok) {
      if (execResult.exec) execSummary = execResult.exec
      inputTokens += execResult.inTok
      outputTokens += execResult.outTok
    } else {
      console.error(`segment-aoy-entry: exec-summary call ${execResult.kind}, using placeholder`)
    }
    const sectionTexts: string[] = new Array(sectionTargets.length).fill('')
    for (const r of sectionResults) {
      if (!r.ok) continue // unreachable: any section failure returned above
      r.group.forEach((gs, i) => { sectionTexts[gs.globalIndex] = r.secs[i] ?? '' })
      inputTokens += r.inTok
      outputTokens += r.outTok
    }
    const tokensUsed = inputTokens + outputTokens

    // ── Build rows. section_weight is set from the RUBRIC by index, never the
    //    model. A section the uploaded entry does not address comes back empty and
    //    becomes a placeholder row, so every weighted section still gets a row with
    //    the correct weight and the jury can clamp the unaddressed ones. ──
    const baseRow = {
      project_id,
      direction_id,
      org_id: project.org_id,
      created_by: user.id,
      award_show: direction.best_show,
      category: direction.best_category,
      draft_generation: nextGeneration,
      model_used: 'claude-sonnet-4-6',
      tokens_used: Math.round(tokensUsed / (sectionTargets.length + 1)),
      status: 'draft',
    }

    const rows: Record<string, unknown>[] = []

    // sort_order 0, executive summary (not a scored weighted section)
    rows.push({
      ...baseRow,
      field_key: 'executive_summary',
      field_label: 'Executive Summary',
      word_limit: EXEC_SUMMARY_WORDS,
      version_a: execSummary || '[The uploaded entry has no distinct executive summary.]',
      section_weight: null,
      sort_order: 0,
    })

    // sort_order 1..N, weighted sections
    sectionTargets.forEach((s, i) => {
      rows.push({
        ...baseRow,
        field_key: slugify(s.name),
        field_label: s.name,
        word_limit: s.word_target,
        version_a: sectionTexts[i] && sectionTexts[i].trim()
          ? sectionTexts[i]
          : `[The uploaded entry does not address this section (${s.name}), worth ${s.weight}% of the score. Add this evidence to strengthen the entry.]`,
        section_weight: s.weight,
        sort_order: i + 1,
      })
    })

    // sort_order N+1, endorsement gate (no model text; a hard pre-submit gate)
    rows.push({
      ...baseRow,
      field_key: 'endorsement',
      field_label: 'CEO + CFO Endorsement (required)',
      word_limit: null,
      version_a: 'Auto-exclusion if missing. This entry needs a wet-signature Letter of Endorsement co-signed by your CEO and CFO, plus both names and titles. Every figure in this paper must be CFO-certifiable. Confirm the signed LOE is prepared before you submit.',
      section_weight: null,
      sort_order: sectionTargets.length + 1,
    })

    const { data: inserted, error: insertError } = await supabase
      .from('entry_drafts')
      .insert(rows)
      .select()
    if (insertError) {
      console.error('segment-aoy-entry: insert failed', insertError)
      return new Response(JSON.stringify({ error: 'Could not save the segmented entry. Please try again.', code: 'AOYSEG-DB-500' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Usage: write usage_logs with the SAME action the rate limit counts (or the
    // cap is dead). ONE row per segmentation (not per sub-call), so the hourly cap
    // still counts one segmentation as one action. No increment_usage here:
    // segmentation maps an existing entry, it does not generate a new one, so it
    // must not inflate entries_generated.
    const emptySections = sectionTexts.filter((t, i) => i < sectionTargets.length && !(t && t.trim())).length
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: project.org_id,
      action: 'segment_aoy_entry',
      model: 'claude-sonnet-4-6',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      metadata: {
        project_id,
        direction_id,
        category_key: rubricKey,
        pillar,
        section_count: sectionTargets.length,
        empty_section_count: emptySections,
        source_material_path: material_path,
        draft_generation: nextGeneration,
        group_count: groups.length,
      },
    })

    return new Response(JSON.stringify({
      entry_drafts: inserted,
      draft_generation: nextGeneration,
      pillar,
      category_key: rubricKey,
      section_count: sectionTargets.length,
      empty_section_count: emptySections,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    console.error('segment-aoy-entry: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'AOYSEG-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})