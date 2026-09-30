import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type EvaluationScores = {
  strategic_clarity?: number
  insight?: number
  idea?: number
  execution?: number
  results?: number
  jury_fit?: number
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

    // Phase 2: Accept only evaluation_id + message — chat history is loaded server-side
    // Never accept chat_history from the client (prevents prompt injection via fabricated history)
    const { evaluation_id, message } = await req.json()

    if (!evaluation_id || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'evaluation_id and message are required.' }),
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
    // Audit fix A-03: always pass the JWT explicitly — getUser() with no args
    // is the documented broken pattern in the Deno edge runtime.
    const { data: { user }, error: authError } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Phase 1: Fetch evaluation + user profile in parallel, verify org ownership ──
    const [{ data: evaluation, error: evalError }, { data: profile }] = await Promise.all([
      supabase.from('evaluations').select('*').eq('id', evaluation_id).single(),
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
    ])

    if (evalError || !evaluation) {
      return new Response(JSON.stringify({ error: 'Evaluation not found.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!profile?.org_id || evaluation.org_id !== profile.org_id) {
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

    // ── Rate limit (audit P-2): per-org hourly cap. trial_unlimited orgs are
    // exempt inside the RPC. Fails open on RPC error (documented trade-off).
    const CHAT_RATE_LIMIT_PER_HOUR = 60
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'chat_evaluation',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= CHAT_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached — please try again in a little while.',
        code: 'CHAT-RATE',
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── End rate limit ──────────────────────────────────────────────────────────

    // Phase 2: Load chat history from DB — never trust client-supplied history
    const chatHistory: ChatMessage[] = (evaluation.eval_chat_history as ChatMessage[]) ?? []

    // Resolve direction_id via the entry_draft
    const { data: seedDraft } = await supabase
      .from('entry_drafts')
      .select('direction_id')
      .eq('id', evaluation.entry_draft_id)
      .single()

    const directionId = seedDraft?.direction_id ?? null

    // Fetch all entry drafts for the direction to reconstruct the entry
    let entryContent = ''
    let directionRow: Record<string, unknown> | null = null

    if (directionId) {
      const [{ data: drafts }, { data: dir }] = await Promise.all([
        supabase
          .from('entry_drafts')
          .select('*')
          .eq('direction_id', directionId)
          .order('sort_order'),
        supabase
          .from('directions')
          .select('*')
          .eq('id', directionId)
          .single(),
      ])

      directionRow = dir ?? null

      if (drafts && drafts.length > 0) {
        entryContent = drafts
          .map((d: Record<string, unknown>) => {
            const content =
              (d.custom_text as string) ||
              (d.selected === 'c' ? (d.version_c as string) : d.selected === 'b' ? (d.version_b as string) : (d.version_a as string)) ||
              (d.version_a as string) ||
              ''
            return content.trim() ? `${d.field_label as string}:\n${content.trim()}` : ''
          })
          .filter(Boolean)
          .join('\n\n')
      }
    }

    // Fetch project for campaign context
    const { data: project } = await supabase
      .from('projects')
      .select('campaign_name, client_name')
      .eq('id', evaluation.project_id)
      .single()

    // org_id resolved during ownership check above
    const orgId = profile.org_id

    // Build the evaluation context string
    const scores = (evaluation.scores || {}) as EvaluationScores
    const scoreLine = [
      scores.strategic_clarity !== undefined ? `Strategic Clarity: ${scores.strategic_clarity}/10` : '',
      scores.insight !== undefined ? `Insight: ${scores.insight}/10` : '',
      scores.idea !== undefined ? `Idea: ${scores.idea}/10` : '',
      scores.execution !== undefined ? `Execution: ${scores.execution}/10` : '',
      scores.results !== undefined ? `Results: ${scores.results}/10` : '',
      scores.jury_fit !== undefined ? `Jury Fit: ${scores.jury_fit}/10` : '',
    ].filter(Boolean).join(' | ')

    const evalContext = [
      `CAMPAIGN: ${project?.campaign_name || 'Unknown'} by ${project?.client_name || 'Unknown client'}`,
      directionRow
        ? `TARGET SHOW: ${directionRow.best_show || 'N/A'}\nTARGET CATEGORY: ${directionRow.best_category || 'N/A'}`
        : '',
      '',
      `OVERALL SCORE: ${evaluation.overall_score}/10`,
      scoreLine ? `DIMENSION SCORES: ${scoreLine}` : '',
      '',
      evaluation.strengths?.length
        ? `STRENGTHS:\n${(evaluation.strengths as string[]).map((s: string) => `• ${s}`).join('\n')}`
        : '',
      evaluation.gaps?.length
        ? `GAPS:\n${(evaluation.gaps as string[]).map((g: string) => `• ${g}`).join('\n')}`
        : '',
      evaluation.recommendations
        ? `RECOMMENDATIONS:\n${evaluation.recommendations}`
        : '',
      entryContent ? `\nENTRY CONTENT (what was evaluated):\n${entryContent.slice(0, 6000)}` : '',
    ].filter(Boolean).join('\n')

    const systemPrompt = `You are a senior award entry strategist and jury coach with 20 years of experience evaluating, writing, and judging entries at Cannes Lions, D&AD, Effies, One Show, Clio Awards, and every major global award show. A user has received an AI evaluation of their award entry and wants to dig deeper into the feedback with you.

Your role is to:
- Explain any score or piece of feedback in depth when asked — be specific about what juries look for and why
- Give concrete, actionable advice on how to improve weak areas — tell them exactly what to change, add, or cut
- Reference what juries at this specific show and category tend to reward vs penalise
- Draw comparisons with what winning entries typically do differently
- Be direct, honest, and constructive — not falsely encouraging, but never demoralising
- Keep answers focused and practical — 2 to 4 sentences for simple questions, more depth for complex ones
- Never fabricate new scores or metrics — only reference and explain what's shown in the evaluation below

FORMATTING RULES — follow these exactly:
- Write in clear, well-punctuated prose. Every sentence must end with a full stop.
- Never use markdown symbols: no asterisks, no underscores, no hyphens as bullet points, no hash symbols.
- When listing multiple points, number them: "1. First point. 2. Second point." with each on its own line.
- Separate distinct topics or paragraphs with a blank line.
- Be concise. Avoid filler phrases like "Great question" or "Certainly".
- WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule with zero exceptions. Restructure any sentence that would use an em-dash by using a comma, colon, semicolon, or by splitting it into two sentences. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.

EVALUATION CONTEXT:
${evalContext}

If the user asks something outside the scope of this evaluation or award entry strategy, gently redirect them back to what you can help with.`

    // Messages array — built from server-side history, never client-supplied.
    // Session 51 (audit P-09): only the most recent window is sent to the API.
    // The FULL history is still persisted to eval_chat_history below (the UI
    // shows everything) — this only caps per-turn input tokens, which previously
    // grew unbounded as the conversation lengthened.
    const MAX_HISTORY_MESSAGES = 12 // 6 exchanges
    const recentHistory = chatHistory.slice(-MAX_HISTORY_MESSAGES)
    const messages = [
      ...recentHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message.trim() },
    ]

    const startTime = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Session 51 (audit P-09): Opus → Sonnet. Conversational Q&A over an
        // existing evaluation does not need Opus-level reasoning; the evaluation
        // itself (evaluate-entry) stays on Opus.
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })
    const latencyMs = Date.now() - startTime

    // Session 48 (audit A-10): surface Anthropic API errors instead of parsing them
    // as a fake "empty response" — a 429/529 previously fell through to the !reply branch.
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error(`chat-evaluation: Anthropic API error ${claudeRes.status}`, errBody.slice(0, 500))
      return new Response(JSON.stringify({
        error: 'The AI service returned an error — please try again in a moment.',
        code: `CHATEVAL-AI-${claudeRes.status}`,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeRes.json()
    const reply: string = claudeData.content?.[0]?.text?.trim() ?? ''
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0

    if (!reply) {
      return new Response(JSON.stringify({ error: 'AI returned an empty response.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build updated chat history from server-side base
    const updatedHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: message.trim() },
      { role: 'assistant', content: reply },
    ]

    // Persist chat history to evaluations table
    await supabase
      .from('evaluations')
      .update({ eval_chat_history: updatedHistory })
      .eq('id', evaluation_id)

    // Log usage
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: orgId,
      action: 'chat_evaluation',
      model: 'claude-sonnet-4-6',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      metadata: {
        evaluation_id,
        project_id: evaluation.project_id,
        direction_id: directionId,
      },
    })

    return new Response(
      JSON.stringify({ reply, chat_history: updatedHistory }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('chat-evaluation: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'CHATEVAL-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})