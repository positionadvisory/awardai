import { createClient } from 'npm:@supabase/supabase-js@2'

type Material = { name: string; extracted_text?: string }

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

// Asset mode guidance blocks injected into the system prompt
const ASSET_MODE_GUIDANCE = {
  best_possible: `ASSET MODE — BEST POSSIBLE:
Assume the production team has access to the best possible assets: high-quality hero footage of the campaign in action, cinematic B-roll, real customer reactions, event coverage, data visualisations, on-camera talent, and professional-grade photography. Write VISUAL descriptions that make full use of these rich assets — specific, evocative, and directionally useful to a top-tier director. Do not limit yourself to "what probably exists" — write the script that would win a Grand Prix if produced with a full budget and unlimited access.`,

  minimal: `ASSET MODE — MINIMAL:
Assume assets are limited: basic screen recordings or product demos, still photography, stock B-roll, talking-head footage (if any), and presentation-style slides. Write VISUAL descriptions that acknowledge this constraint while still making maximum jury impact. For each VISUAL line, call out exactly what to source (e.g., "VISUAL: Cut of the client's existing product launch TVC, overlaid with key metric text" or "VISUAL: Stock footage of commuters on phone — suggest Getty search: 'commuter smartphone urban'"). The script must be producible by a small team with limited budget. Every visual choice should earn its place.`
}

// Shared script format instructions used in both modes
const SCRIPT_FORMAT = `FORMAT YOUR SCRIPT EXACTLY LIKE THIS — one scene block per section:

[SCENE 1 — HOOK: 0:00–0:08]
VO: "Voiceover text goes here."
VISUAL: Description of what is on screen — be specific, cinematic, visual.
[ON-SCREEN TEXT: Any text overlays — omit this line if none]

[SCENE 2 — CHALLENGE: 0:08–0:25]
VO: "..."
VISUAL: ...

Continue for all scenes.

SCENE STRUCTURE (adapt timing to the story):
1. HOOK (0:00–0:08) — arresting opening: a statistic, a provocation, an image that stops scrolling
2. CHALLENGE (0:08–0:25) — the human or business problem; make it feel urgent and real
3. IDEA (0:25–0:45) — the creative idea in plain language; bold and memorable, one sentence if possible
4. EXECUTION (0:45–1:20) — how it came to life; concrete, specific, visual — show don't tell
5. RESULTS (1:20–1:50) — the numbers that prove it worked; specific metrics, scale, and cultural impact
6. CLOSE (1:50–2:05) — the resonant final thought; leave the jury with a feeling, not a fact

RULES:
- Total runtime: 1:45–2:10
- VO is conversational and precise — no jargon, no waffle, no passive voice
- Every second must earn its place — trim ruthlessly
- The best scripts make the jury FEEL before they think
- VISUAL descriptions should be genuinely useful to a director, not vague`

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

    const body = await req.json()
    const {
      project_id,
      mode, // 'generate' | 'review' | 'suggest_categories'
      direction_id,        // optional — legacy: used to target a specific show/category
      show,                // optional — award show name (replaces direction_id approach)
      category,            // optional — specific category within the show
      uploaded_script_text, // required for mode='review'
      context_override,    // optional — if provided, use this text as the script source instead of all materials
      evaluation_id,       // optional — include jury/coach eval insights in the script generation
      asset_mode,          // optional — 'best_possible' | 'minimal' (default: best_possible)
    } = body

    if (!project_id || !mode || !['generate', 'review', 'suggest_categories'].includes(mode)) {
      return new Response(
        JSON.stringify({ error: 'project_id and mode ("generate", "review", or "suggest_categories") are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (mode === 'review' && !uploaded_script_text?.trim()) {
      return new Response(
        JSON.stringify({ error: 'uploaded_script_text is required for review mode.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (mode === 'suggest_categories' && !show?.trim()) {
      return new Response(
        JSON.stringify({ error: 'show is required for suggest_categories mode.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service client for DB operations
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
    // Session 48: pass JWT explicitly — no-arg getUser() is unreliable in Deno (no local storage)
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch project (and direction if provided) in parallel
    const fetches: Promise<unknown>[] = [
      supabase.from('projects').select('*').eq('id', project_id).single(),
    ]
    if (direction_id) {
      fetches.push(supabase.from('directions').select('*').eq('id', direction_id).single())
    }

    // ── Phase 1: Resolve org + verify ownership ──
    const profileFetch = supabase.from('profiles').select('org_id').eq('id', user.id).single()
    fetches.push(profileFetch)

    const results = await Promise.all(fetches)
    const { data: project, error: projError } = results[0] as { data: Record<string, unknown> | null; error: unknown }
    const { data: direction } = (direction_id ? results[1] : { data: null }) as { data: Record<string, unknown> | null }
    const { data: profile } = results[direction_id ? 2 : 1] as { data: { org_id: string } | null }

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (projError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if ((project as Record<string, unknown>).org_id !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Session 59 (audit C2): direction_id is a client-supplied ID — verify it belongs to
    // the caller's org. Previously the direction was fetched with .eq('id', …) only, so a
    // user could read another org's direction (best_show/best_category) into their script.
    if (direction_id && (!direction || (direction as Record<string, unknown>).org_id !== profile.org_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Paywall check ─────────────────────────────────────────────────────────
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

    // ── Rate limit (audit S59 M2): per-mode hourly cap. review mode calls Opus
    //    (most expensive path in the codebase), so it gets the tightest cap. Each
    //    mode writes its matching usage_logs action below, so the counts line up. ──
    const VIDEO_RATE_LIMITS: Record<string, { action: string; cap: number }> = {
      review:             { action: 'review_video_script',   cap: 15 },
      generate:           { action: 'generate_video_script', cap: 20 },
      suggest_categories: { action: 'suggest_categories',    cap: 30 },
    }
    const vrl = VIDEO_RATE_LIMITS[mode as string]
    if (vrl) {
      const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
        p_org_id: profile.org_id,
        p_action: vrl.action,
      })
      if (typeof usedLastHour === 'number' && usedLastHour >= vrl.cap) {
        return new Response(JSON.stringify({
          error: 'Hourly usage limit reached — please try again in a little while.',
          code: 'SCRIPT-RATE',
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Build campaign context
    const contextParts: string[] = []
    if ((project.combined_text as string)?.trim()) {
      contextParts.push(`CAMPAIGN BRIEF:\n${(project.combined_text as string).trim().slice(0, 4000)}`)
    }
    const materials = ((project.materials as Material[]) || [])
    // Phase 2: XML delimiters on client-supplied materials
    const materialTexts = materials
      .filter(m => m.extracted_text?.trim())
      .map((m, i) => `MATERIAL ${i + 1} — ${m.name}:\n<client_material>\n${m.extracted_text!.slice(0, 8000)}\n</client_material>`)
    if (materialTexts.length > 0) {
      contextParts.push(...materialTexts)
    }

    // If context_override is provided (user selected a specific source), use it exclusively
    let campaignContext: string
    if (context_override?.trim()) {
      campaignContext = `CAMPAIGN CONTENT:\n${(context_override as string).trim().slice(0, 12000)}`
    } else {
      if (contextParts.length === 0 && mode !== 'review') {
        return new Response(
          JSON.stringify({ error: 'No campaign content found. Add a brief or upload materials before generating a script.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      campaignContext = contextParts.join('\n\n---\n\n')
    }

    // Award show / category context — prefer explicit show/category params over direction lookup
    const showName: string | null =
      show?.trim() ||
      (direction?.best_show as string) ||
      ((project.target_shows as string[])?.[0]) ||
      null
    const categoryName: string | null =
      (category && category !== 'suggest' ? category.trim() : null) ||
      (direction?.best_category as string) ||
      null

    const showContext = showName
      ? `TARGET AWARD SHOW: ${showName}${categoryName ? `\nTARGET CATEGORY: ${categoryName}` : ''}`
      : ''

    // Search KB for winning campaigns at this show for reference
    let kbContext = ''
    if (showName) {
      const { data: campaigns } = await supabase.rpc('search_campaigns', {
        query_text: `${project.campaign_name} ${showName} case study film`,
        show_filter: showName,
        year_from: null,
        year_to: null,
        result_limit: 5,
      })
      if (campaigns && campaigns.length > 0) {
        kbContext =
          `WINNING CAMPAIGNS AT ${showName.toUpperCase()} FOR REFERENCE:\n` +
          campaigns
            .map((c: Record<string, string>) =>
              `• "${c.campaign_name}" — ${c.what || 'N/A'} (${c.award_tier || 'N/A'})`
            )
            .join('\n')
      }
    }

    // org_id already resolved from profile fetch above (Phase 1 security)
    const orgId = profile?.org_id ?? null

    // ── Optional: fetch evaluation insights for eval-informed script generation ──
    let evalScriptContext = ''
    if (evaluation_id && mode === 'generate') {
      const { data: evalRow } = await supabase
        .from('evaluations')
        .select('overall_score, strengths, gaps, recommendations, output, evaluation_mode')
        .eq('id', evaluation_id)
        .eq('org_id', profile.org_id) // Session 59 (audit C2): scope to caller org — was a cross-tenant IDOR
        .single()
      if (evalRow) {
        const evalMode = evalRow.evaluation_mode === 'coach' ? 'Coach Review' : 'Jury Evaluation'
        const output = evalRow.output as Record<string, unknown> | null
        const lines: string[] = [`EVALUATION INSIGHTS (${evalMode}, ${evalRow.overall_score}/10 — use these to sharpen the script):`]

        if (output && Array.isArray(output['talks_up'])) {
          const j = output as { talks_up: string[]; kills_it: string[]; recommendations: string }
          if (j.talks_up?.length) lines.push(`What the jury loves about this campaign: ${j.talks_up.join(' | ')}`)
          if (j.kills_it?.length) lines.push(`What currently kills it with the jury: ${j.kills_it.join(' | ')}`)
          if (j.recommendations) lines.push(`What to fix: ${j.recommendations}`)
        } else if (output && typeof output['focus_point'] === 'string') {
          const c = output as { focus_point: string; priority_fixes: Array<{fix:string;action:string}>; cuts: string[] }
          if (c.focus_point) lines.push(`Core focus: ${c.focus_point}`)
          if (c.priority_fixes?.length) lines.push(`Priority improvements: ${c.priority_fixes.map(f => `${f.fix} → ${f.action}`).join(' | ')}`)
          if (c.cuts?.length) lines.push(`Remove or minimise: ${c.cuts.join(', ')}`)
        } else {
          if (evalRow.strengths) lines.push(`Strengths to amplify: ${evalRow.strengths}`)
          if (evalRow.gaps) lines.push(`Gaps to address: ${evalRow.gaps}`)
          if (evalRow.recommendations) lines.push(`Recommendations: ${evalRow.recommendations}`)
        }
        lines.push(`INSTRUCTION: The script MUST amplify the strengths identified above and directly address the gaps/recommendations. The evaluation's weaknesses are the script's opportunity.`)
        evalScriptContext = lines.join('\n')
      }
    }

    // ─── MODE: SUGGEST CATEGORIES ─────────────────────────────────────────────
    if (mode === 'suggest_categories') {
      const systemPrompt = `You are a senior award strategist with 20 years of experience entering and judging campaigns at ${show}. Your job is to review a campaign and recommend the top 3 most strategically appropriate categories to enter.

Return a valid JSON array with EXACTLY this structure (no markdown fences, no preamble):
[
  {
    "category": "exact category name as it appears in the show",
    "reasoning": "2–3 sentences explaining why this category is the best fit: what aspects of the campaign align with what juries in this category are looking for, and what competitive advantage the campaign has"
  }
]

Return only the top 3 best-fit categories, ranked from strongest to weakest fit.`

      const userPrompt = [
        campaignContext,
        `AWARD SHOW: ${show}`,
        kbContext ? '\n' + kbContext : '',
        `\nBased on this campaign, suggest the top 3 best-fit categories at ${show}. Return JSON only.`,
      ].filter(Boolean).join('\n\n')

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
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      const latencyMs = Date.now() - startTime
      if (!claudeRes.ok) {
        const errorBody = await claudeRes.text()
        console.error(`generate-video-script: Anthropic API error — status ${claudeRes.status} ${claudeRes.statusText}`, errorBody.slice(0, 500))
        return new Response(
          JSON.stringify({ error: 'AI service error.', code: `SCRIPT-AI-${claudeRes.status}`, status: claudeRes.status }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const claudeData = await claudeRes.json()
      const rawText: string = claudeData.content?.[0]?.text?.trim() ?? ''
      const inputTokens: number = claudeData.usage?.input_tokens ?? 0
      const outputTokens: number = claudeData.usage?.output_tokens ?? 0

      let suggestions: { category: string; reasoning: string }[] = []
      try {
        const firstBracket = rawText.indexOf('[')
        const lastBracket = rawText.lastIndexOf(']')
        if (firstBracket !== -1 && lastBracket !== -1) {
          suggestions = JSON.parse(rawText.slice(firstBracket, lastBracket + 1))
        }
      } catch (_) {
        console.error('generate-video-script: failed to parse category suggestions', rawText.slice(0, 300))
        return new Response(
          JSON.stringify({ error: 'Failed to generate category suggestions. Please try again.', code: 'PARSE_ERROR' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Log usage
      await supabase.from('usage_logs').insert({
        user_id: user.id, org_id: orgId, action: 'suggest_categories', model: 'claude-sonnet-4-6',
        input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
        metadata: { project_id, show, mode: 'suggest_categories' },
      })

      return new Response(
        JSON.stringify({ suggestions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let scriptText = ''
    let scriptAnalysis: ScriptAnalysis | null = null

    // ─── MODE: GENERATE ───────────────────────────────────────────────────────
    if (mode === 'generate') {
      const resolvedAssetMode = asset_mode === 'minimal' ? 'minimal' : 'best_possible'
      const assetGuidance = ASSET_MODE_GUIDANCE[resolvedAssetMode as keyof typeof ASSET_MODE_GUIDANCE]

      const systemPrompt = `You are an award-winning case study film director and scriptwriter. You have created case study films that won Grand Prix at Cannes Lions, Black Pencils at D&AD, and Gold Effies. You understand what makes award show juries react: what stops them, what moves them, what makes them vote.

Your task is to write a 2-minute case study film script for a real campaign.

WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule with zero exceptions. Restructure any sentence that would use an em-dash by using a comma, colon, semicolon, or by splitting it into two sentences. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.

${assetGuidance}

${SCRIPT_FORMAT}

Return ONLY the script. No preamble, no notes, no sign-off.`

      const userPrompt = [
        campaignContext,
        showContext,
        evalScriptContext ? '\n' + evalScriptContext : '',
        kbContext ? '\n' + kbContext : '',
        '\nWrite the case study film script for this campaign.',
      ].filter(Boolean).join('\n\n')

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
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      const latencyMs = Date.now() - startTime
      if (!claudeRes.ok) {
        const errorBody = await claudeRes.text()
        console.error(`generate-video-script: Anthropic API error — status ${claudeRes.status} ${claudeRes.statusText}`, errorBody.slice(0, 500))
        return new Response(
          JSON.stringify({ error: 'AI service error.', code: `SCRIPT-AI-${claudeRes.status}`, status: claudeRes.status }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const claudeData = await claudeRes.json()
      scriptText = claudeData.content?.[0]?.text?.trim() ?? ''

      const inputTokens: number = claudeData.usage?.input_tokens ?? 0
      const outputTokens: number = claudeData.usage?.output_tokens ?? 0

      if (!scriptText) {
        return new Response(JSON.stringify({ error: 'Claude returned an empty script.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Persist to projects.script_text
      await supabase
        .from('projects')
        .update({ script_text: scriptText, updated_at: new Date().toISOString() })
        .eq('id', project_id)

      // Log usage
      await supabase.rpc('increment_usage', { p_org_id: orgId, p_counter: 'video_scripts_generated', p_tokens: inputTokens + outputTokens })
      await supabase.from('usage_logs').insert({
        user_id: user.id, org_id: orgId, action: 'generate_video_script', model: 'claude-sonnet-4-6',
        input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
        metadata: { project_id, show: showName, category: categoryName, mode: 'generate', asset_mode: asset_mode ?? 'best_possible', evaluation_id: evaluation_id ?? null },
      })

      return new Response(
        JSON.stringify({ script: scriptText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── MODE: REVIEW ─────────────────────────────────────────────────────────
    const systemPrompt = `You are a senior case study film editor and creative director. You have judged and directed award show entries at Cannes Lions, D&AD, One Show, and Effies for 20 years. You are reviewing a client's existing video script and optimising it for maximum jury impact.

WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule with zero exceptions. Restructure any sentence that would use an em-dash by using a comma, colon, semicolon, or by splitting it into two sentences. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.

Your goals:
1. Rewrite the script to be tighter, more emotionally resonant, and better structured for award jury attention spans
2. Explain your reasoning clearly: every significant change should be justified in terms of what makes juries react

${SCRIPT_FORMAT}

Return a valid JSON object with EXACTLY this structure (no markdown fences, no preamble):
{
  "optimized_script": "the full revised script using the scene format above",
  "reasoning": {
    "summary": "2–3 sentences: your overall assessment of the original script and the most important things you changed",
    "key_improvements": ["one-sentence improvement 1", "one-sentence improvement 2", "...up to 5"],
    "changes": [
      {
        "section": "section name (e.g. Hook, Challenge, Idea, Execution, Results, Close)",
        "original": "brief quote or description of what was in the original",
        "reason": "why you changed it and what the change achieves with the jury"
      }
    ]
  }
}`

    const userPrompt = [
      campaignContext ? `CAMPAIGN CONTEXT:\n${campaignContext}` : '',
      showContext,
      `\nORIGINAL SCRIPT TO REVIEW:\n${uploaded_script_text.trim()}`,
      '\nReview and optimise this script. Return JSON only.',
    ].filter(Boolean).join('\n\n')

    const startTime = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    const latencyMs = Date.now() - startTime
    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`generate-video-script: Anthropic API error — status ${claudeRes.status} ${claudeRes.statusText}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error.', code: `SCRIPT-AI-${claudeRes.status}`, status: claudeRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text?.trim() ?? ''
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Claude returned an empty response.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON response — robust extraction
    let parsed: { optimized_script: string; reasoning: { summary: string; key_improvements: string[]; changes: ScriptChange[] } }
    try {
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found')
      parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1))
    } catch (e) {
      console.error('generate-video-script: failed to parse review response', e instanceof Error ? e.message : String(e), rawText.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'Failed to process script review. Please try again.', code: 'PARSE_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    scriptText = parsed.optimized_script?.trim() || ''
    scriptAnalysis = {
      mode: 'review',
      original_script: uploaded_script_text.trim(),
      summary: parsed.reasoning?.summary || '',
      key_improvements: parsed.reasoning?.key_improvements || [],
      changes: parsed.reasoning?.changes || [],
    }

    // Persist both to project
    await supabase
      .from('projects')
      .update({
        script_text: scriptText,
        script_analysis: scriptAnalysis,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project_id)

    // Log usage
    await supabase.rpc('increment_usage', { p_org_id: orgId, p_counter: 'video_scripts_generated', p_tokens: inputTokens + outputTokens })
    await supabase.from('usage_logs').insert({
      user_id: user.id, org_id: orgId, action: 'review_video_script', model: 'claude-opus-4-6',
      input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
      metadata: { project_id, show: showName, category: categoryName, mode: 'review' },
    })

    return new Response(
      JSON.stringify({ script: scriptText, analysis: scriptAnalysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('generate-video-script: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'SCRIPT-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})