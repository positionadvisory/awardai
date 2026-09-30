// segment-smarties-entry, SMARTIES Phase 3 (Session 95)
// ─────────────────────────────────────────────────────────────────────────────
// Maps an UPLOADED, already-written MMA SMARTIES entry (a single document, e.g. a
// prior winning case study) onto the FOUR FIXED sections of the official SMARTIES
// case-study form, so the existing qualitative jury (evaluate-smarties-entry) and
// coach (generate-smarties-coach) can score/coach it. Writes one entry_drafts row
// per fixed section (executive_summary / strategy / execution / business_impact,
// section_weight NULL, same shape as generate-smarties-draft), in FORM order.
// After this runs, an uploaded SMARTIES entry is a first-class SMARTIES entry:
// scoreable, coachable, redraftable.
//
// EXTRACTIVE, NOT GENERATIVE (mirrors segment-aoy-entry's load-bearing
// distinction from generate-aoy-draft). The model only LOCATES and lightly trims
// the parts of the uploaded entry that address each fixed section. It writes no
// new prose, invents or changes no number, and returns an EMPTY string for any
// section the entry does not address. Empty -> a placeholder row -> the jury
// scores that section 0-2 (is_placeholder detection in evaluate-smarties-entry
// matches on the same "[draft this section|insert" prefix used here). NEVER let
// this fn author content or borrow text across sections.
//
// SIMPLER THAN segment-aoy-entry BY DESIGN: SMARTIES has NO per-category weighted
// rubric to look up or parse (the four sections + word limits are FIXED in code,
// identical across all 25 categories and APAC/Global/Vietnam, per generate-
// smarties-draft.ts). So there is no rubric lookup, no weight parsing, no pillar
// classification, and no NOCAT/NORUBRIC guard: the SMARTIES_SECTIONS array below
// is the sole authority, byte-identical to the copy in generate-smarties-draft.ts.
//
// NEW, SMARTIES-specific function. generate-smarties-draft.ts, evaluate-smarties-
// entry.ts and generate-smarties-coach.ts are all untouched. The AOY segment path
// (segment-aoy-entry.ts) and the campaign path are untouched.
//
// AUTHORITATIVE SOURCES (never the model):
//   - the four sections, labels, word limits and sub-question briefs are fixed in
//     code (SMARTIES_SECTIONS), byte-identical to generate-smarties-draft.ts.
//   - the qualitative "what wins" emphasis is read from the show-level
//     show_profiles row (show_name ILIKE '%Smarties%', category_pattern NULL);
//     built-in defaults apply if it is absent (the framework does not depend on
//     the DB row, same as the drafter).
//
// GUARDS: the direction's show must be SMARTIES (isSmartiesShow, NOTSMARTIES
// guard). Requires the uploaded entry's text (passed by path; SMARTSEG-NOTEXT if
// empty). Does NOT require agency_facts or entry_type (SMARTIES never gated on
// either, unlike AOY): it scores an existing document, not a generated one.
//
// JWT verification: OFF (this function does its own auth, like the drafter/jury/
// coach).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── SMARTIES show detection (parity) ────────────────────────────────────────
// MUST stay byte-for-byte equivalent to the copies in the client
// (projects-[id]-page.tsx), generate-smarties-draft.ts, evaluate-smarties-
// entry.ts and generate-smarties-coach.ts. This is now the FIFTH copy of the
// isSmartiesShow parity surface. "smarties" is unique to MMA among all canonical
// show names, so the substring is the reliable signal. This is NOT part of the
// AOY parity set; do not fold it in.
function isSmartiesShow(showName: string | null | undefined): boolean {
  return (showName ?? '').trim().toLowerCase().includes('smarties')
}

// ─── Official SMARTIES case-study framework (2026 sample form) ────────────────
// Byte-identical to the SMARTIES_SECTIONS array in generate-smarties-draft.ts.
// sort_order 0..3. word_limit is the official per-section form limit, used here
// only as extraction guidance (extraction is not held to a word count the way
// generation is). brief holds the form's own sub-questions so the model knows
// what belongs in each section when mapping the uploaded document.
type SmartiesSection = {
  field_key: string
  field_label: string
  word_limit: number
  brief: string
}

const SMARTIES_SECTIONS: SmartiesSection[] = [
  {
    field_key: 'executive_summary',
    field_label: 'Executive Summary',
    word_limit: 150,
    brief: 'Why should this case study win a SMARTIES award? A sharp, specific summary of the challenge, the strategy, the idea, and the headline MEASURABLE business outcome. This is the hook the judges read first.',
  },
  {
    field_key: 'strategy',
    field_label: 'Strategy',
    word_limit: 600,
    brief: 'Cover, in this order: (a) Objectives: the strategic objective (market share, awareness, engagement, sales, leads) and the specific, measurable KPIs you set, on a global or per-market basis as relevant, with the data source. (b) Context: is this the first year of the campaign, and if not how did the strategy adapt to previous results or new technology. (c) Target Audience: a clearly defined audience with real demographic and behavioural detail and how you defined it. (d) Creative Strategy: ONE sentence. (e) Media Strategy: ONE sentence. (f) How the creative and media strategies worked together to reach the audience, and why the channel choices were right. Lead with the human or business problem, not the tech stack.',
  },
  {
    field_key: 'execution',
    field_label: 'Execution / Use of Media',
    word_limit: 400,
    brief: 'Cover: (a) Overall campaign execution: how the execution or enabling technology helped achieve results, the total campaign budget, and what percent went to mobile / digital and why. (b) Execution detail: how the channel or enabling technology was integrated into the overall strategy, how creative or sophisticated the use of media was, what the channel or technology brought that other channels missed, how it was matched to specific markets and demographics, and how well technology (especially data and AI) was leveraged.',
  },
  {
    field_key: 'business_impact',
    field_label: 'Business Impact',
    word_limit: 450,
    brief: 'Cover: (a) Context: the state of the brand/client business and the category before the effort began. (b) Evaluation: did the campaign achieve its objectives and goals, with specific numerical results mapped objective by objective. (c) Market Impact: the impact on the market, how innovative the work was, how consumers received it, and planned future use. Then lay the results out in the SMARTIES metrics structure: BUSINESS IMPACT METRICS as lines of "Metric | Result | vs Competition or Category benchmark | Source", and CAMPAIGN METRICS as lines of "Platform/Media | Metric | Achievement | vs Benchmark | Source". State an ROI ratio if one can be supported (optional). Report every result against a benchmark, never a bare percentage.',
  },
]

// Built-in fallback emphasis if the show_profiles row is ever missing. Byte-
// identical to the copy in generate-smarties-draft.ts / evaluate-smarties-entry.ts.
const DEFAULT_EMPHASIS = 'Business impact and results carry the most weight, well above craft. Strategy and creativity matter, but the case must prove measurable outcomes (sales, behaviour change, market share, ROI) and give benchmarks for context. Reach and engagement alone are insufficient as headline results.'
const DEFAULT_GUIDANCE = 'Frame entries around data and technology integration (particularly AI), audience precision, and demonstrable business impact across any channel. Lead with the human or business problem solved, not the tech stack. Report results with benchmarks, not bare percentages.'

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
      return new Response(JSON.stringify({ error: 'project_id, direction_id and material_path are required', code: 'SMARTSEG-400' }), {
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
        .select('id, org_id, campaign_name, client_name, materials')
        .eq('id', project_id).single(),
      supabase.from('directions').select('*').eq('id', direction_id).single(),
    ])
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (projError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'SMARTSEG-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (Number(project.org_id) !== Number(profile.org_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found', code: 'SMARTSEG-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Direction must belong to the same project + org (sequential bigint IDOR guard).
    if (Number(direction.org_id) !== Number(profile.org_id) || Number(direction.project_id) !== Number(project.id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── SMARTIES guard ──
    if (!isSmartiesShow(direction.best_show ?? '')) {
      return new Response(JSON.stringify({
        error: 'This direction is not an MMA SMARTIES entry. Use the standard evaluation for other campaign entries.',
        code: 'SMARTSEG-NOTSMARTIES',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // No agency_facts / entry_type gate: segmentation scores an EXISTING uploaded
    // entry, so the source of truth is the document itself, not validated facts
    // (SMARTIES never gates on agency_facts, unlike AOY). The uploaded text is
    // loaded below by material_path.

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
    const SMARTIES_SEGMENT_RATE_LIMIT_PER_HOUR = 20
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'segment_smarties_entry',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= SMARTIES_SEGMENT_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached, please try again in a little while.',
        code: 'SMARTSEG-RATE',
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Show-level emphasis (read-only; the four sections are fixed in code, so
    //    the framework does not depend on this row, same as the drafter). ──
    const { data: profileRow } = await supabase
      .from('show_profiles')
      .select('scoring_emphasis, language_guidance')
      .ilike('show_name', '%Smarties%')
      .is('category_pattern', null)
      .limit(1)
      .maybeSingle()
    const emphasis = profileRow?.scoring_emphasis || DEFAULT_EMPHASIS
    const guidance = profileRow?.language_guidance || DEFAULT_GUIDANCE

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
        code: 'SMARTSEG-NOTEXT',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── draft_generation: never delete, always append ──
    const { data: genRows } = await supabase
      .from('entry_drafts')
      .select('draft_generation')
      .eq('direction_id', direction_id)
      .order('draft_generation', { ascending: false })
      .limit(1)
    const nextGeneration: number = (genRows?.[0]?.draft_generation ?? 0) + 1

    const sectionSpec = SMARTIES_SECTIONS
      .map((s, i) => `${i + 1}. "${s.field_label}" (key: ${s.field_key}), official form limit ${s.word_limit} words.\n   ${s.brief}`)
      .join('\n')

    const systemPrompt = `You are mapping an EXISTING, already-written MMA SMARTIES case study onto the four FIXED sections of the official SMARTIES entry form, so the entry can be scored and coached section by section. The MMA is the Marketing + Media Alliance. SMARTIES is an EFFECTIVENESS and BUSINESS-IMPACT programme judged on a written case study, NOT a creative-craft show.

CATEGORY THIS ENTRY TARGETS: ${direction.best_category || 'not specified'}
WHAT WINS (judging emphasis): ${emphasis}
LANGUAGE / FRAMING GUIDANCE: ${guidance}

YOUR TASK: for each of the four fixed sections listed, find the part(s) of the uploaded entry that address it and return that content as the section text.

RULES:
- EXTRACTIVE ONLY. Return text drawn from the uploaded entry. Do NOT write new sentences, do NOT summarise into new claims, and do NOT add, round, or change any number. You may lightly trim and join the entry's own sentences; you may not invent.
- If the entry does not address a section, return an EMPTY STRING for it. Never fill a gap with content borrowed from another section or with anything invented. An empty section is the correct answer when the entry is silent: the scorer will penalise the gap, and that is intended.
- Do not place the same passage under multiple sections unless the entry genuinely makes that point in both places.
- WRITING STYLE, NON-NEGOTIABLE: never use em-dashes in any text you return, zero exceptions.
- Return ONLY a valid JSON object. No markdown fences, no preamble, no trailing prose.`

    const userPromptText = `UPLOADED SMARTIES ENTRY (the document to map onto the sections):
ENTRY: ${project.campaign_name ?? 'Untitled'}${project.client_name ? `\nCLIENT / BRAND: ${project.client_name}` : ''}
TARGET: ${direction.best_show}, ${direction.best_category}

<client_material>
${entryText.slice(0, 45000)}
</client_material>

Map it onto these four fixed sections, in this exact order:
${sectionSpec}

Return ONLY this JSON object:
{
  "executive_summary": "extracted text for the Executive Summary section; empty string if the entry does not address it",
  "strategy": "extracted text for the Strategy section; empty string if the entry does not address it",
  "execution": "extracted text for the Execution / Use of Media section; empty string if the entry does not address it",
  "business_impact": "extracted text for the Business Impact section; empty string if the entry does not address it"
}`

    const startTime = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        stream: false,
        system: systemPrompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: userPromptText }] }],
      }),
    })
    const latencyMs = Date.now() - startTime

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`segment-smarties-entry: Anthropic API error, status ${claudeRes.status}`, errorBody.slice(0, 500))
      return new Response(JSON.stringify({ error: 'AI service error.', code: `SMARTSEG-AI-${claudeRes.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeRes.json()
    const rawText: string = (Array.isArray(claudeData?.content) ? claudeData.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens

    let parsedObj: Record<string, unknown>
    try {
      const jsonStart = rawText.indexOf('{')
      const jsonEnd = rawText.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON object in response')
      parsedObj = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
    } catch {
      console.error('segment-smarties-entry: failed to parse AI response', rawText.slice(0, 500))
      return new Response(JSON.stringify({ error: 'Unexpected AI response.', code: 'SMARTSEG-PARSE' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Build rows. Section list + labels + word limits + sort order are fixed in
    //    code (byte-identical to generate-smarties-draft.ts); the model only
    //    supplies the extracted text per section. A section the uploaded entry
    //    does not address comes back empty and becomes a placeholder row, using
    //    the SAME "[draft this section: ...]" prefix the drafter uses, so the
    //    jury's is_placeholder regex (matches "draft this section|insert") clamps
    //    it to <=2 exactly like an unfilled drafted section. NO section_weight
    //    (SMARTIES publishes none; the sibling jury scores qualitatively). ──
    const baseRow = {
      project_id,
      direction_id,
      org_id: project.org_id,
      created_by: user.id,
      award_show: direction.best_show,
      category: direction.best_category,
      draft_generation: nextGeneration,
      model_used: 'claude-sonnet-4-6',
      tokens_used: Math.round(tokensUsed / SMARTIES_SECTIONS.length),
      status: 'draft',
    }

    let emptySectionCount = 0
    const rows = SMARTIES_SECTIONS.map((s, i) => {
      const text = parsedObj[s.field_key]
      const hasText = typeof text === 'string' && text.trim().length > 0
      if (!hasText) emptySectionCount += 1
      return {
        ...baseRow,
        field_key: s.field_key,
        field_label: `${s.field_label} (max ${s.word_limit} words)`,
        word_limit: s.word_limit,
        version_a: hasText
          ? (text as string)
          : `[Draft this section: ${s.field_label}. The uploaded entry does not address it. ${s.brief}]`,
        section_weight: null,
        sort_order: i,
      }
    })

    const { data: inserted, error: insertError } = await supabase
      .from('entry_drafts')
      .insert(rows)
      .select()
    if (insertError) {
      console.error('segment-smarties-entry: insert failed', insertError)
      return new Response(JSON.stringify({ error: 'Could not save the segmented entry. Please try again.', code: 'SMARTSEG-DB-500' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Usage: write usage_logs with the SAME action the rate limit counts (or the
    // cap is dead). No increment_usage here: segmentation maps an existing entry,
    // it does not generate a new one, so it must not inflate entries_generated
    // (same policy as segment-aoy-entry).
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: project.org_id,
      action: 'segment_smarties_entry',
      model: 'claude-sonnet-4-6',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      metadata: {
        project_id,
        direction_id,
        category: direction.best_category ?? null,
        section_count: SMARTIES_SECTIONS.length,
        empty_section_count: emptySectionCount,
        source_material_path: material_path,
        draft_generation: nextGeneration,
      },
    })

    return new Response(JSON.stringify({
      entry_drafts: inserted,
      draft_generation: nextGeneration,
      smarties: true,
      section_count: SMARTIES_SECTIONS.length,
      empty_section_count: emptySectionCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    console.error('segment-smarties-entry: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'SMARTSEG-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
