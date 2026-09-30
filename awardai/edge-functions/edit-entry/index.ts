import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  version_created?: string // only on user messages — tracks which version this produced
  // P4 (S147) — tag on ASSISTANT turns only. 'discuss' = conversational reply,
  // nothing written to the draft. 'apply' = the existing refine (rewrite, new
  // revision). Untagged (undefined) = pre-P4 history, ALWAYS an apply-produced
  // rewrite (discuss did not exist yet) — the client backward-compat rule is
  // "no mode tag renders exactly like 'apply'".
  mode?: 'discuss' | 'apply'
}

type Material = { name: string; extracted_text?: string }

// Workbench P2 Chunk 4 (S143) — linear version history, AOY only. Mirrors the
// type in components/SectionWorkbench.tsx; keep both copies byte-identical if
// either changes (same parity-copy class as verifyDraft / WIN_RATES).
type SectionRevision = {
  ts: string
  source: 'draft' | 'manual' | 'refine' | 'restore'
  text: string
  instruction?: string
}

// ── P4 (S147) — mode resolution. Missing/unknown body.mode -> 'apply', so a
// pre-P4 client (or any caller that omits the field) behaves exactly as before.
function resolveMode(raw: unknown): 'discuss' | 'apply' {
  return raw === 'discuss' ? 'discuss' : 'apply'
}

// ── S149: apply-path guard against a conversational reply being committed
// into the draft as field content. When the user's apply "instruction" is
// really a question (or otherwise cannot be executed as a rewrite), the apply
// prompt tells the model to answer on a single line prefixed with this exact
// token instead of guessing a rewrite. The server then routes that reply into
// chat_history as a discuss-style turn and writes NO field content, closing
// the S148 hole where a clarifying question answered conversationally got
// silently written into version_b / custom_text. A genuine award-entry
// rewrite never begins with this token, so a false positive is effectively
// impossible: the trade is one-directional and safe (worst case, a real
// rewrite that somehow opened with the token is shown as a chat turn instead
// of being committed, which the user simply re-runs).
const CLARIFICATION_SENTINEL = 'NEEDS_CLARIFICATION:'
function detectClarification(replyText: string): { isClarification: boolean; message: string } {
  // Tolerate a leading quote, backtick, or whitespace the model might add
  // despite the "no quotation marks" rule, then require the token at the very
  // start. No unicode flag / property escapes (downlevel tsc target).
  const stripped = replyText.replace(/^["'`\s]+/, '')
  if (!stripped.startsWith(CLARIFICATION_SENTINEL)) {
    return { isClarification: false, message: '' }
  }
  return { isClarification: true, message: stripped.slice(CLARIFICATION_SENTINEL.length).trim() }
}

// ── P4 (S147) — per-mode usage action + hourly cap. Both actions get their OWN
// usage_logs insert with the SAME action name the rate check counts (dead-cap
// gotcha), so the two budgets are genuinely independent: heavy Discuss use
// never eats into Apply's budget or vice versa.
const RATE_LIMITS = {
  apply: { action: 'edit_entry', limitPerHour: 60, code: 'EDIT-RATE' },
  discuss: { action: 'discuss_entry', limitPerHour: 40, code: 'DISCUSS-RATE' },
} as const

// ── P4 (S147) — how many turns of chat_history go into the Anthropic API call.
// Full history always stays stored for the UI; only the OUTBOUND call windows.
// Discuss makes chat_history grow much faster than apply-only ever did (every
// back-and-forth appends), so this caps token cost on both modes rather than
// letting a long thread balloon every future call, discuss or apply.
const API_HISTORY_WINDOW = 12

// ── P4 (S147) — discuss-context-only AOY category/show helpers. COPIED from the
// normalizer family (lib/aoy-taxonomy.ts / evaluate-entry.ts / detect-entry-
// context.ts / generate-aoy-draft.ts / evaluate-aoy-section.ts), but this copy
// is NOT a scoring-parity surface and is deliberately excluded from the parity
// fixture: unlike evaluate-aoy-section's byte-copy (which must match because
// score comparability is the product), a drift here only means the discuss
// system prompt falls back to generic framing instead of the exact category
// rubric — it never touches a score, a write, or the official evaluation. Kept
// local so discuss can resolve the right show_profiles row without a client
// round trip. If the real normalizer family changes shape, this MAY go stale;
// that degrades gracefully (fail-soft to no-rubric-context), so it is not held
// to the same "update in lockstep" rule as the frozen-scorer copies.
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

// ── P4 (S147) — best-effort attribution of entry-level gap strings to THIS
// section, for discuss context only. Deliberately simpler than the canonical
// lib/aoy-eval-map.ts fold (which the client uses for the real gaps UI): this
// only needs to hand a juror-advisor a plausible short list to talk about, not
// produce the UI's authoritative per-section gap set. Matches on any
// significant (>=4 char) word from the field label appearing in the gap text.
function significantWords(label: string): string[] {
  return (label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
}
function gapsForSection(allGaps: string[], fieldLabel: string): string[] {
  const words = significantWords(fieldLabel)
  if (words.length === 0) return []
  return allGaps
    .filter(g => {
      const gLower = (g ?? '').toLowerCase()
      return words.some(w => gLower.includes(w))
    })
    .slice(0, 3)
}

Deno.serve(async (req) => {
  // ── Phase 1: Dynamic CORS ──
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000').split(',').map(s => s.trim())
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const jwt = authHeader.replace('Bearer ', '')

    const { project_id, direction_id, entry_draft_id, message, mode: rawMode } = await req.json()
    const mode = resolveMode(rawMode) // P4 (S147): missing/unknown -> 'apply'
    const isDiscuss = mode === 'discuss'

    if (!project_id || !direction_id || !entry_draft_id || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'project_id, direction_id, entry_draft_id, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service client for all DB operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify user (JWT OFF pattern)
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

    // ── Phase 1: Fetch all resources + profile in parallel, verify org ownership ──
    const [
      { data: profile },
      { data: draft, error: draftError },
      { data: direction, error: dirError },
      { data: project, error: projError },
    ] = await Promise.all([
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      supabase.from('entry_drafts').select('*').eq('id', entry_draft_id).single(),
      supabase.from('directions').select('*').eq('id', direction_id).single(),
      supabase.from('projects').select('*').eq('id', project_id).single(),
    ])

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (draftError || !draft) {
      return new Response(JSON.stringify({ error: 'Entry draft not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (projError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (project.org_id !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── Audit fix S2: the draft and direction must belong to this org AND this
    // project. Previously only project.org_id was verified, so a caller with a
    // valid project of their own could read/overwrite ANY org's entry_draft by
    // passing a foreign entry_draft_id (sequential bigint — enumerable).
    // Number() coercion: the frontend sends project_id as a string (useParams).
    if (
      draft.org_id !== profile.org_id ||
      Number(draft.project_id) !== Number(project_id) ||
      Number(draft.direction_id) !== Number(direction_id)
    ) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (direction.org_id !== profile.org_id || Number(direction.project_id) !== Number(project_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Paywall check ─────────────────────────────────────────────────────────
    // P4 (S147): unchanged, applies to BOTH modes. "Rollout: straight to all pro
    // orgs, no feature gate" (brief) means no plan-level gate; the EXISTING
    // subscription paywall still applies to discuss exactly like apply.
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, trial_unlimited')
      .eq('id', profile.org_id)
      .single()

    if (org && org.plan === 'free' && !org.trial_unlimited) {
      return new Response(JSON.stringify({
        error: 'subscription_required',
        message: 'An active Shortlist subscription is required to use this feature.',
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── End paywall check ──────────────────────────────────────────────────────

    // ── Rate limit (audit P-2): per-org hourly cap, keyed by mode (P4, S147).
    // trial_unlimited orgs are exempt inside the RPC. Fails open on RPC error
    // (documented trade-off).
    const rl = RATE_LIMITS[mode]
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: rl.action,
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= rl.limitPerHour) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached — please try again in a little while.',
        code: rl.code,
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── End rate limit ──────────────────────────────────────────────────────────

    // ── P0 fix (S137): read what the user actually SEES. custom_text (manual
    // edit) outranks the selected version, matching resolveFieldContent on the
    // client and the section resolution in evaluate-aoy-entry. Before this fix
    // a refine ran against stale pre-manual-edit text and its output was then
    // masked by custom_text in the display.
    const selectedVersion = (draft.selected || 'a') as 'a' | 'b' | 'c'
    const manualEdit: string =
      typeof draft.custom_text === 'string' ? draft.custom_text.trim() : ''
    const currentContent: string =
      manualEdit ||
      (draft[`version_${selectedVersion}` as keyof typeof draft] as string) ||
      draft.version_a ||
      ''

    // P4 (S147): the "nothing to refine" guard is APPLY-ONLY. Discuss is a
    // conversation about the section, including "how should I even start
    // this" on an empty one — it never needs existing text to run.
    if (!isDiscuss && !currentContent.trim()) {
      return new Response(JSON.stringify({ error: 'Field has no content to refine.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Workbench P2 Chunk 4 (S143): AOY entries cut over to linear version
    // history and stop touching version_a/b/c/selected entirely. Campaign
    // entries are UNTOUCHED (Ben's scope call, 10 Jul 2026: branch on
    // entry_type rather than retire the A/B/C model globally, since campaign
    // refine still depends on it and has no History-control replacement yet;
    // revisit after AOY ships). isAoy is the only fork point below; nothing
    // else in this function differs between the two paths.
    //
    // S148 fix: entry_type alone under-detects. It is set ONLY by the
    // /api/agency-facts "Verify Facts" step, so a freshly created AOY project
    // reads as 'campaign' (still its DB default) until a user happens to run
    // that unrelated step — the exact bug Ben hit testing P4 on new AOY
    // entries. The client's projectIsAoy (page.tsx ~L5188 and the same-shape
    // check at ~L4319) already treats this as OR logic across three signals;
    // mirrored here so the edge fn agrees with the UI it's serving instead of
    // silently reverting a P4 AOY entry to the campaign version_a/b/c path.
    const isAoy =
      (project.target_shows ?? []).some(isAoyShow) ||
      project.entry_type === 'aoy' ||
      isAoyShow(direction.best_show ?? '')

    // ── P0 write rule (S137, deterministic — see Workbench-P0-P1 brief),
    // CAMPAIGN ONLY as of Chunk 4, APPLY ONLY as of P4 (discuss never writes a
    // version letter — there is nothing to displace):
    // version_a = original draft, never overwritten.
    // No manual edit: revised → version_b if free, else version_c (overwrite).
    // Manual edit present: manual edit → version_b (overwrite), revised →
    // version_c (overwrite), custom_text = null. The revised output and the
    // manual edit can never be lost; only a prior AI refinement is displaced,
    // and after every refine the user sees the refine output.
    let targetVersion: 'b' | 'c' | null = null
    const preserveWrites: Record<string, unknown> = {}
    if (!isDiscuss && !isAoy) {
      if (manualEdit) {
        preserveWrites.version_b = manualEdit
        preserveWrites.custom_text = null
        targetVersion = 'c'
      } else if (!draft.version_b) {
        targetVersion = 'b'
      } else {
        targetVersion = 'c' // free, or overwrite the oldest non-original refinement
      }
    }

    // Build campaign context from brief + materials
    const contextParts: string[] = []
    if (project.combined_text?.trim()) {
      contextParts.push(`CAMPAIGN BRIEF:\n${project.combined_text.trim().slice(0, 3000)}`)
    }
    const materials = (project.materials || []) as Material[]
    // Phase 2: XML delimiters on all client-supplied material text
    const materialTexts = materials
      .filter((m) => m.extracted_text?.trim())
      .map((m, i) => `MATERIAL ${i + 1} — ${m.name}:\n<client_material>\n${m.extracted_text!.slice(0, 5000)}\n</client_material>`)
    if (materialTexts.length > 0) {
      contextParts.push(...materialTexts)
    }
    const campaignContext = contextParts.join('\n\n---\n\n')

    // ── P4 (S147) — discuss-only jury/rubric context. Best-effort, fail-soft:
    // any missing piece (no evaluation yet, no show_profiles row, non-AOY show)
    // just narrows the prompt, never blocks the reply ("chat works before any
    // evaluation exists", brief). Only fetched for AOY (isAoy): evaluations.
    // scores is a section-keyed object ONLY for AOY entries — for campaign
    // entries scores is the fixed 6-dim object and keying it by field_key would
    // silently read garbage, so this stays gated on isAoy rather than
    // guessing at a shape.
    let discussJuryContext = ''
    if (isDiscuss && isAoy) {
      const { data: directionDrafts } = await supabase
        .from('entry_drafts')
        .select('id')
        .eq('direction_id', direction_id)
        .eq('project_id', project_id)
      const draftIds = (directionDrafts ?? []).map((d: { id: number }) => d.id)

      let latestEvaluation: {
        scores?: Record<string, number>
        output?: { sections?: Array<{ key?: string; rationale?: string }> } | null
        gaps?: string[] | null
      } | null = null
      if (draftIds.length > 0) {
        const { data: evalRows } = await supabase
          .from('evaluations')
          .select('scores, output, gaps')
          .in('entry_draft_id', draftIds)
          .eq('org_id', profile.org_id)
          .eq('project_id', project_id)
          .order('created_at', { ascending: false })
          .limit(1)
        latestEvaluation = evalRows?.[0] ?? null
      }

      const sectionScore = typeof latestEvaluation?.scores?.[draft.field_key] === 'number'
        ? latestEvaluation!.scores![draft.field_key]
        : null
      const sectionRationale = Array.isArray(latestEvaluation?.output?.sections)
        ? latestEvaluation!.output!.sections!.find(s => s.key === draft.field_key)?.rationale ?? ''
        : ''
      const sectionGaps = Array.isArray(latestEvaluation?.gaps)
        ? gapsForSection(latestEvaluation!.gaps as string[], draft.field_label || draft.field_key)
        : []

      let rubricText = ''
      if (isAoyShow(direction.best_show ?? '')) {
        const rubricKey = normalizeAoyCategory(direction.best_category ?? '')
        if (rubricKey) {
          const { data: profileRow } = await supabase
            .from('show_profiles')
            .select('judging_philosophy, scoring_emphasis, common_mistakes, jury_composition_notes')
            .eq('show_name', AOY_SHOW_NAME)
            .eq('category_pattern', rubricKey)
            .limit(1)
            .maybeSingle()
          if (profileRow) {
            const rubricParts: string[] = []
            if (profileRow.judging_philosophy) rubricParts.push(`JUDGING PHILOSOPHY FOR THIS CATEGORY: ${profileRow.judging_philosophy}`)
            if (profileRow.scoring_emphasis) rubricParts.push(`WHAT THIS CATEGORY REWARDS (the weighted rubric): ${profileRow.scoring_emphasis}`)
            if (profileRow.common_mistakes) rubricParts.push(`COMMON MISTAKES THAT LOSE MARKS: ${profileRow.common_mistakes}`)
            if (profileRow.jury_composition_notes) rubricParts.push(`JURY: ${profileRow.jury_composition_notes}`)
            rubricText = rubricParts.join('\n')
          }
        }
      }

      const juryParts: string[] = []
      if (rubricText) juryParts.push(rubricText)
      if (draft.section_weight != null) juryParts.push(`THIS SECTION'S WEIGHT: ${draft.section_weight}% of the entry score.`)
      if (sectionScore != null) {
        juryParts.push(`THIS SECTION'S CURRENT JURY SCORE: ${sectionScore}/10.${sectionRationale ? ` Jury read: ${sectionRationale}` : ''}`)
      }
      if (sectionGaps.length > 0) {
        juryParts.push(`TRACKED GAPS FOR THIS SECTION:\n${sectionGaps.map(g => `- ${g}`).join('\n')}`)
      }
      discussJuryContext = juryParts.join('\n\n')
    }

    // System prompt — branches on mode (P4, S147). Apply keeps the exact prior
    // prompt (byte-for-byte, backward compatible). Discuss gets its own framing:
    // a senior AOY juror discussing THIS section, never rewriting it.
    const systemPrompt = isDiscuss
      ? `You are a senior AOY juror discussing ONE section of an award entry with the person writing it. This is a working conversation, not a scoring pass and not a rewrite.

POSITIONING (follow this exactly): you cannot beat a general-purpose AI assistant at broad reasoning, and you must not try. You win on context the user cannot easily paste elsewhere: the category's judging philosophy, scoring emphasis, common mistakes, jury composition, this section's weight, its current jury score and rationale, and this section's tracked gaps. Stay narrow to this entry and this section. If asked something unrelated to this entry, say so plainly and suggest a fresh conversation for that, in your own natural words — do not answer as a general-purpose assistant.

AWARD SHOW: ${direction.best_show || 'Unknown'}
CATEGORY: ${direction.best_category || 'Unknown'}
ENTRY ANGLE: ${direction.angle || 'N/A'}
SECTION: ${draft.field_label || draft.field_key}${draft.word_limit ? ` (word limit: ${draft.word_limit} words)` : ''}

${discussJuryContext ? `${discussJuryContext}\n\n` : ''}${campaignContext ? `CAMPAIGN CONTEXT:\n${campaignContext}\n\n` : ''}CURRENT SECTION TEXT:
${currentContent || '(nothing written yet)'}

Reply conversationally to the user's message below. Do NOT rewrite the section here; a rewrite only happens when the user chooses "Apply changes", a separate action with its own turn.

RULES:
- Never use em-dashes anywhere in your output, zero exceptions. Use a comma, colon, semicolon, or two sentences instead.
- Be specific to this section and this rubric, not generic writing advice.

NON-NEGOTIABLE INTEGRITY RULES (apply even in discussion):
- NEVER MOVE A NUMBER: never reassign a metric from one channel, product, campaign, or period to another, even as a suggestion.
- NO INVENTED SOURCING: never propose a source, study, methodology, or provenance that is not explicitly present in the original text or campaign context.
- PRESERVE EVERY CAVEAT: do not suggest resolving a hedge ("estimated", "check with brand", "directional") by simply removing it.
- DISCUSS-SPECIFIC: when you suggest content the user could add, explicitly mark which claims need data the user must supply. Never draft an unverifiable specific (a number, a named study, a named client result) as if it were already true.`
      : `You are a world-class award entry writer and editor, specialising in global advertising awards including Cannes Lions, D&AD, Effies, One Show, Clio Awards, and more. You are helping refine a specific field of an award entry.

AWARD SHOW: ${direction.best_show || 'Unknown'}
CATEGORY: ${direction.best_category || 'Unknown'}
ENTRY ANGLE: ${direction.angle || 'N/A'}
FIELD: ${draft.field_label || draft.field_key}${draft.word_limit ? ` (word limit: ${draft.word_limit} words)` : ''}

${campaignContext ? `CAMPAIGN CONTEXT:\n${campaignContext}\n\n` : ''}CURRENT FIELD CONTENT:
${currentContent}

The user will give you a refinement instruction. Your job is to rewrite the field content following that instruction precisely.

RULES:
- Return ONLY the revised field text. No preamble, no explanation, no "Here is the revised version:", no quotation marks around your response.
- If the user's message is a QUESTION, a request for advice, or anything that cannot be carried out as a rewrite of the field text, do NOT guess or invent a rewrite. Reply with a single line beginning EXACTLY with the token NEEDS_CLARIFICATION: followed by your short question or answer, and nothing else. Use this token ONLY when there is genuinely no rewrite to produce. Whenever the message is a real rewrite instruction, return only the revised field text with no token.
- Preserve the professional award entry tone — confident, specific, evidence-driven.
- If a word limit is specified, respect it strictly.
- Do not add information not present in the original or campaign context.
- Make meaningful changes that genuinely improve the text — do not return the same content reworded superficially.
- Never use em-dashes anywhere in your output, zero exceptions. Use a comma, colon, semicolon, or two sentences instead.

NON-NEGOTIABLE INTEGRITY RULES:
- NEVER MOVE A NUMBER: every figure must keep its exact value AND its original attribution. Never reassign a metric from one channel, product, campaign, or period to another.
- NO INVENTED SOURCING: never add a source, study, methodology, or provenance that is not explicitly present in the original text or campaign context.
- PRESERVE EVERY CAVEAT: hedges and qualifiers (such as "estimated", "check with brand", "directional") must survive the rewrite attached to the same claims they qualify. Address a gap ONLY with evidence already present in the original or campaign context; a gap the materials cannot fill stays a gap.`

    // Build messages array for Claude — pass prior chat history so refinements/
    // discussion are cumulative. P4 (S147): windowed to the last
    // API_HISTORY_WINDOW turns for the OUTBOUND call only; the full array is
    // still what gets stored below. Discuss and apply share ONE thread per
    // section by design (brief: "apply what we just discussed" needs the
    // discussion in context), so a discuss turn can appear in an apply call's
    // window and vice versa — intentional, not a bug.
    const existingHistory: ChatMessage[] = (draft.chat_history || []) as ChatMessage[]
    const windowedHistory = existingHistory.slice(-API_HISTORY_WINDOW)

    // Strip any custom version_created/mode metadata before sending to Claude API
    const claudeMessages = [
      ...windowedHistory.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content: message.trim() },
    ]

    // Call Claude
    const startTime = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Session 51 (audit P-10): Opus → Sonnet for apply. P4 (S147): discuss
        // stays on sonnet-4-6 too (brief: "discuss does not need Opus").
        model: 'claude-sonnet-4-6',
        max_tokens: isDiscuss ? 1500 : 4096, // P4 (S147): discuss is advice, not a rewrite
        system: systemPrompt,
        messages: claudeMessages,
      }),
    })
    const latencyMs = Date.now() - startTime

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`edit-entry: Anthropic API error — status ${claudeRes.status}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error — please try again.', code: `EDIT-AI-${claudeRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const replyText: string = claudeData.content?.[0]?.text?.trim() ?? ''
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens

    if (!replyText) {
      return new Response(JSON.stringify({ error: 'Claude returned an empty response.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // org_id already resolved from the Promise.all profile fetch above
    const orgId = profile?.org_id ?? null

    // ═══════════════════════════════════════════════════════════════════════
    // P4 (S147) — DISCUSS branch: conversational reply, NO version/revision
    // write, NO custom_text write. Appends {role:'user'} + {role:'assistant',
    // mode:'discuss'} to chat_history only (brief).
    // ═══════════════════════════════════════════════════════════════════════
    if (isDiscuss) {
      const updatedHistory: ChatMessage[] = [
        ...existingHistory,
        { role: 'user', content: message.trim() },
        { role: 'assistant', content: replyText, mode: 'discuss' },
      ]

      const { data: updatedRows, error: updateError } = await supabase
        .from('entry_drafts')
        .update({ chat_history: updatedHistory, updated_at: new Date().toISOString() })
        .eq('id', entry_draft_id)
        .eq('org_id', profile.org_id) // defense in depth on the write, same as apply
        .select('id, chat_history')

      if (updateError || !updatedRows || updatedRows.length === 0) {
        console.error('edit-entry (discuss): failed to save chat turn', updateError)
        return new Response(JSON.stringify({ error: 'Failed to save the reply. Please try again.', code: 'EDIT-DB-500' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Usage: discuss_entry, the SAME action name the rate check above counts.
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        org_id: orgId,
        action: 'discuss_entry',
        model: 'claude-sonnet-4-6',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        metadata: {
          project_id,
          direction_id,
          entry_draft_id,
          field_key: draft.field_key,
        },
      })

      return new Response(
        JSON.stringify({ chat_history: updatedHistory, mode: 'discuss' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // ═══════════════════════════════════════════════════════════════════════
    // End DISCUSS branch — everything below is the APPLY path, unchanged
    // except: the mode tag on the new assistant turn, and the windowed
    // history built above.
    // ═══════════════════════════════════════════════════════════════════════

    // ── S149: clarification guard (APPLY path only; discuss returned above).
    // If the model judged the message was not an executable rewrite it prefixed
    // its reply with CLARIFICATION_SENTINEL. Route it into chat_history as a
    // discuss turn (so the UI shows a conversational bubble) and write NO field
    // content. This never touches the version/revision write logic below.
    const { isClarification, message: clarificationMessage } = detectClarification(replyText)
    if (isClarification) {
      const clarificationReply = clarificationMessage ||
        'That reads as a question rather than a rewrite instruction. Tell me how you would like the section changed and I will revise it.'
      const clarifiedHistory: ChatMessage[] = [
        ...existingHistory,
        { role: 'user', content: message.trim() },
        { role: 'assistant', content: clarificationReply, mode: 'discuss' },
      ]
      const { data: clarifiedDraft, error: clarifyErr } = await supabase
        .from('entry_drafts')
        .update({ chat_history: clarifiedHistory, updated_at: new Date().toISOString() })
        .eq('id', entry_draft_id)
        .eq('org_id', profile.org_id) // defense in depth on the write, same as apply
        .select()
        .single()
      if (clarifyErr || !clarifiedDraft) {
        console.error('edit-entry (apply/clarification): failed to save chat turn', clarifyErr)
        return new Response(JSON.stringify({ error: 'Failed to save the reply. Please try again.', code: 'EDIT-DB-500' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // This call spent an Anthropic request and an apply-budget slot, so log it
      // under the SAME action the apply rate check counts (dead-cap gotcha),
      // plus the edits_run counter, exactly like a normal apply below.
      await supabase.rpc('increment_usage', { p_org_id: orgId, p_counter: 'edits_run', p_tokens: tokensUsed })
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        org_id: orgId,
        action: 'edit_entry',
        model: 'claude-sonnet-4-6',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        metadata: { project_id, direction_id, entry_draft_id, field_key: draft.field_key, clarification: true },
      })
      return new Response(
        JSON.stringify({ type: 'clarification', message: clarificationReply, chat_history: clarifiedHistory, updated_draft: clarifiedDraft }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Append to chat history. version_created stays undefined for AOY (Chunk
    // 4): there is no version letter to point to any more, and the workbench's
    // History control (not this chat thread) is the source of truth for what
    // changed and when.
    const updatedHistory: ChatMessage[] = [
      ...existingHistory,
      { role: 'user', content: message.trim(), ...(targetVersion ? { version_created: targetVersion } : {}) },
      { role: 'assistant', content: replyText, mode: 'apply' },
    ]

    // Update entry_draft. Two disjoint write shapes:
    //  - AOY (Chunk 4): custom_text + an appended revisions entry, nothing
    //    else. Never writes version_a/b/c/selected -- brief's "display
    //    precedence simplifies to custom_text > version_a" only holds if
    //    nothing keeps writing the old slots for AOY going forward.
    //  - Campaign (untouched): preserveWrites (P0) carries the manual-edit
    //    preservation into version_b and nulls custom_text when a manual edit
    //    was the refine base, new version_b/c, selected flips to point at it.
    const updatePayload: Record<string, unknown> = isAoy
      ? {
          custom_text: replyText,
          revisions: [
            ...((Array.isArray(draft.revisions) ? draft.revisions : []) as SectionRevision[]),
            { ts: new Date().toISOString(), source: 'refine', text: replyText, instruction: message.trim() } as SectionRevision,
          ],
          chat_history: updatedHistory,
          updated_at: new Date().toISOString(),
        }
      : {
          ...preserveWrites,
          [`version_${targetVersion}`]: replyText,
          selected: targetVersion,
          chat_history: updatedHistory,
          updated_at: new Date().toISOString(),
        }

    const { data: updatedDraft, error: updateError } = await supabase
      .from('entry_drafts')
      .update(updatePayload)
      .eq('id', entry_draft_id)
      .eq('org_id', profile.org_id) // audit fix S2: defense in depth on the write
      .select()
      .single()

    if (updateError || !updatedDraft) {
      console.error('edit-entry: failed to save refinement', updateError)
      return new Response(JSON.stringify({ error: 'Failed to save refinement. Please try again.', code: 'EDIT-DB-500' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log usage
    await supabase.rpc('increment_usage', {
      p_org_id: orgId,
      p_counter: 'edits_run',
      p_tokens: tokensUsed,
    })

    await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: orgId,
      action: 'edit_entry',
      model: 'claude-sonnet-4-6',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      metadata: {
        project_id,
        direction_id,
        entry_draft_id,
        field_key: draft.field_key,
        version_written: targetVersion,
      },
    })

    return new Response(
      JSON.stringify({ updated_draft: updatedDraft, version_written: targetVersion }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('edit-entry: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'EDIT-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})