import { createClient } from 'npm:@supabase/supabase-js@2'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type ColorSwatch = { hex: string; name: string; role: string }
type TonalBrief = {
  summary: string
  mood: string
  color_palette: ColorSwatch[]
  typography: string
  vo_style: string
  music_style: string
  brand_notes: string
}

type Material = { name: string; extracted_text?: string }

Deno.serve(async (req) => {
  // ── Dynamic CORS ──
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
      message,
      target,         // 'script' | 'brief'
      chat_history,   // ChatMessage[] from client state — accepted but structurally sanitized
      current_brief,  // TonalBrief from client state — fallback if DB column not yet migrated
    } = body

    if (!project_id || !message?.trim() || !['script', 'brief'].includes(target)) {
      return new Response(
        JSON.stringify({ error: 'project_id, message, and target ("script" or "brief") are required.' }),
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

    // Fetch project + profile in parallel
    const [{ data: project, error: projError }, { data: profile }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', project_id).single(),
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
    ])

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

    // Sanitize chat history — only trust structure, ignore claimed provenance.
    // Audit S59 M5: the role check was missing parentheses, so the && / || bound as
    // (object && nonnull && role==='user') || (role==='assistant'). A null entry hit
    // the second clause and threw on `.role`, and the object/null guard was bypassed
    // for any 'assistant'-claimed value. Parenthesised so both roles require a valid
    // object first.
    const sanitizedHistory: ChatMessage[] = Array.isArray(chat_history)
      ? (chat_history as unknown[])
          .filter((m): m is ChatMessage =>
            typeof m === 'object' && m !== null &&
            ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant')
          )
          .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
          .slice(-10) // keep last 10 turns max
      : []

    const campaignName = (project.campaign_name as string) || 'this campaign'
    const orgId = profile.org_id

    // ─── TARGET: SCRIPT ───────────────────────────────────────────────────────
    if (target === 'script') {
      const currentScript = (project.script_text as string | undefined)?.trim() || ''
      if (!currentScript) {
        return new Response(
          JSON.stringify({ error: 'No script found. Generate a video script first.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const systemPrompt = `You are a creative director making targeted edits to a case study film script for ${campaignName}. The user gives you a specific instruction: apply it precisely to the relevant scene(s) and keep everything else identical. Do not rewrite scenes the user did not ask you to change.

Formatting rules for your reply:
- No markdown symbols. Every sentence ends with a full stop.
- Be specific about what changed and why it works better. 1–2 sentences maximum.
- WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.

Return a valid JSON object (no markdown fences, no preamble):
{
  "reply": "1–2 sentences confirming exactly what you changed and why",
  "script": "the complete updated script — same format as the original, all scenes present"
}

CURRENT SCRIPT:
${currentScript}`

      const messages = [
        ...sanitizedHistory.map(m => ({ role: m.role, content: m.content })),
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
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        }),
      })
      const latencyMs = Date.now() - startTime

      if (!claudeRes.ok) {
        const errorBody = await claudeRes.text()
        console.error(`chat-script: Anthropic API error — ${claudeRes.status}`, errorBody.slice(0, 500))
        return new Response(
          JSON.stringify({ error: 'AI service error.', code: `CHAT-SCRIPT-AI-${claudeRes.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const claudeData = await claudeRes.json()
      const rawText: string = claudeData.content?.[0]?.text?.trim() ?? ''
      const inputTokens: number = claudeData.usage?.input_tokens ?? 0
      const outputTokens: number = claudeData.usage?.output_tokens ?? 0

      if (!rawText) {
        return new Response(JSON.stringify({ error: 'AI returned an empty response.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Parse JSON
      let parsed: { reply: string; script: string }
      try {
        const firstBrace = rawText.indexOf('{')
        const lastBrace = rawText.lastIndexOf('}')
        if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON found')
        parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1))
      } catch (e) {
        console.error('chat-script: failed to parse script edit response', e instanceof Error ? e.message : String(e), rawText.slice(0, 300))
        return new Response(
          JSON.stringify({ error: 'Failed to parse edit response. Please try again.', code: 'CHAT-SCRIPT-PARSE' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const updatedScript = parsed.script?.trim() || currentScript
      const reply = parsed.reply?.trim() || 'Script updated.'

      // Save updated script to DB
      await supabase
        .from('projects')
        .update({ script_text: updatedScript, updated_at: new Date().toISOString() })
        .eq('id', project_id)

      // Log usage
      await supabase.from('usage_logs').insert({
        user_id: user.id, org_id: orgId, action: 'chat_script', model: 'claude-sonnet-4-6',
        input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
        metadata: { project_id, target: 'script' },
      })

      return new Response(
        JSON.stringify({ reply, script: updatedScript }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── TARGET: BRIEF ────────────────────────────────────────────────────────
    // Use DB value if available, fall back to client-supplied brief (covers the case where
    // the tonal_brief column migration hasn't been run yet but the brief is live in client state)
    const currentBrief: TonalBrief | null =
      (project.tonal_brief as TonalBrief | undefined | null) ??
      (current_brief as TonalBrief | undefined | null) ??
      null
    if (!currentBrief) {
      return new Response(
        JSON.stringify({ error: 'No production brief found. Generate a script first to create the brief.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Brief editing — Claude returns the full updated brief JSON + reply
    const systemPrompt = `You are a production strategist making targeted edits to a production brief for ${campaignName}. The user gives you a specific instruction about one or more fields. Apply it precisely: leave all other fields identical.

Formatting rules for your reply:
- No markdown symbols. Every sentence ends with a full stop.
- Confirm what changed in 1–2 sentences maximum.
- WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.

Return a valid JSON object (no markdown fences, no preamble):
{
  "reply": "1–2 sentences confirming what you changed",
  "summary": "...",
  "mood": "...",
  "color_palette": [{ "hex": "#RRGGBB", "name": "...", "role": "..." }, ...5 items],
  "typography": "...",
  "vo_style": "...",
  "music_style": "...",
  "brand_notes": "..."
}

CURRENT BRIEF:
${JSON.stringify(currentBrief, null, 2)}`

    const messages = [
      ...sanitizedHistory.map(m => ({ role: m.role, content: m.content })),
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }),
    })
    const latencyMs = Date.now() - startTime

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`chat-script: Anthropic API error (brief) — ${claudeRes.status}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error.', code: `CHAT-BRIEF-AI-${claudeRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text?.trim() ?? ''
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'AI returned an empty response.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON
    let parsed: { reply: string } & TonalBrief
    try {
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON found')
      parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1))
    } catch (e) {
      console.error('chat-script: failed to parse brief edit response', e instanceof Error ? e.message : String(e), rawText.slice(0, 300))
      return new Response(
        JSON.stringify({ error: 'Failed to parse brief edit response. Please try again.', code: 'CHAT-BRIEF-PARSE' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const reply = parsed.reply?.trim() || 'Brief updated.'

    // Build updated brief — merge with original to fill any missing fields
    const updatedBrief: TonalBrief = {
      summary: parsed.summary || currentBrief.summary,
      mood: parsed.mood || currentBrief.mood,
      color_palette: (Array.isArray(parsed.color_palette) && parsed.color_palette.length > 0)
        ? parsed.color_palette.slice(0, 5).map((c: ColorSwatch) => ({
            ...c,
            hex: (c.hex || '#000000').startsWith('#') ? c.hex : `#${c.hex}`,
          }))
        : currentBrief.color_palette,
      typography: parsed.typography || currentBrief.typography,
      vo_style: parsed.vo_style || currentBrief.vo_style,
      music_style: parsed.music_style || currentBrief.music_style,
      brand_notes: parsed.brand_notes || currentBrief.brand_notes,
    }

    // Save updated brief to DB
    await supabase
      .from('projects')
      .update({ tonal_brief: updatedBrief, updated_at: new Date().toISOString() })
      .eq('id', project_id)

    // Log usage
    await supabase.from('usage_logs').insert({
      user_id: user.id, org_id: orgId, action: 'chat_script', model: 'claude-sonnet-4-6',
      input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
      metadata: { project_id, target: 'brief' },
    })

    return new Response(
      JSON.stringify({ reply, brief: updatedBrief }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('chat-script: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'CHATSCRIPT-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})