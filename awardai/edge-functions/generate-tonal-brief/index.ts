import { createClient } from 'npm:@supabase/supabase-js@2'

type Material = { name: string; extracted_text?: string }

type ColorSwatch = {
  hex: string
  name: string
  role: string
}

type TonalBrief = {
  mood: string
  color_palette: ColorSwatch[]
  typography: string
  vo_style: string
  music_style: string
  brand_notes: string
  summary: string
}

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
    const { project_id, script_text } = body

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'project_id is required.' }),
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

    // Fetch project and profile in parallel
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

    // ── Rate limit (audit S59 M2): hourly cap; matches the usage_logs action below ──
    const TONAL_RATE_LIMIT_PER_HOUR = 20
    {
      const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
        p_org_id: profile.org_id,
        p_action: 'generate_tonal_brief',
      })
      if (typeof usedLastHour === 'number' && usedLastHour >= TONAL_RATE_LIMIT_PER_HOUR) {
        return new Response(JSON.stringify({
          error: 'Hourly usage limit reached — please try again in a little while.',
          code: 'TONAL-RATE',
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Resolve the script text — prefer param, fall back to saved project.script_text
    const resolvedScript: string = (script_text as string | undefined)?.trim()
      || (project.script_text as string | undefined)?.trim()
      || ''

    if (!resolvedScript) {
      return new Response(
        JSON.stringify({ error: 'No script found. Generate a video script first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build campaign context (brief + brand info)
    const contextParts: string[] = []
    if ((project.combined_text as string)?.trim()) {
      contextParts.push(`CAMPAIGN BRIEF:\n${(project.combined_text as string).trim().slice(0, 3000)}`)
    }
    const materials = ((project.materials as Material[]) || [])
    const materialTexts = materials
      .filter(m => m.extracted_text?.trim())
      .slice(0, 2) // limit to 2 for brief generation — brand signals are what matters
      .map((m, i) => `MATERIAL ${i + 1} — ${m.name}:\n<client_material>\n${m.extracted_text!.slice(0, 3000)}\n</client_material>`)
    if (materialTexts.length > 0) {
      contextParts.push(...materialTexts)
    }
    const campaignContext = contextParts.join('\n\n---\n\n')

    const campaignName = (project.campaign_name as string) || 'this campaign'
    const brandName = (project.brand_name as string) || ''
    const targetShows: string[] = (project.target_shows as string[]) || []

    // ── System prompt ──────────────────────────────────────────────────────────
    const systemPrompt = `You are a senior creative director writing a one-page production brief. Be ruthlessly brief. Every field is ONE sentence: no exceptions, no elaboration.

WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule with zero exceptions. Restructure any sentence that would use an em-dash by using a comma, colon, semicolon, or by splitting it into two sentences. Em-dashes are an immediately recognisable AI writing marker.

Return a valid JSON object (no markdown fences, no preamble). Every string value must be a single sentence under 20 words:
{
  "summary": "One sentence naming the film's emotional tone and target feeling.",
  "mood": "One sentence. E.g. 'Restrained optimism — quiet confidence, warmth without sentimentality.'",
  "color_palette": [
    { "hex": "#RRGGBB", "name": "Color name", "role": "4–5 words max" },
    { "hex": "#RRGGBB", "name": "Color name", "role": "4–5 words max" },
    { "hex": "#RRGGBB", "name": "Color name", "role": "4–5 words max" },
    { "hex": "#RRGGBB", "name": "Color name", "role": "4–5 words max" },
    { "hex": "#RRGGBB", "name": "Color name", "role": "4–5 words max" }
  ],
  "typography": "One sentence: font name, weight, case. E.g. 'Helvetica Neue Light, tight tracking, sentence case.'",
  "vo_style": "One sentence: pace, register, one thing to avoid. E.g. 'Measured, warm, no hard sell.'",
  "music_style": "One sentence: genre + one reference artist or track.",
  "brand_notes": "One sentence: one thing this brand always does, one thing it never does."
}

Return only the JSON. No extra text. No padding.`

    const userPrompt = [
      campaignContext ? `CAMPAIGN CONTEXT:\n${campaignContext}` : '',
      brandName ? `BRAND: ${brandName}` : '',
      campaignName ? `CAMPAIGN: ${campaignName}` : '',
      targetShows.length > 0 ? `TARGET SHOWS: ${targetShows.join(', ')}` : '',
      `\nCASE STUDY FILM SCRIPT:\n${resolvedScript}`,
      '\nGenerate a Production Brief for this script. Return JSON only.',
    ].filter(Boolean).join('\n\n')

    // ── Call Claude ────────────────────────────────────────────────────────────
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
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    const latencyMs = Date.now() - startTime

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`generate-tonal-brief: Anthropic API error — status ${claudeRes.status}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error.', code: `TONAL-AI-${claudeRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const rawText: string = (Array.isArray(claudeData?.content) ? claudeData.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('').trim()
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Claude returned an empty response.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON response — robust extraction
    let brief: TonalBrief
    try {
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found')
      brief = JSON.parse(rawText.slice(firstBrace, lastBrace + 1))
    } catch (e) {
      console.error('generate-tonal-brief: failed to parse response', e instanceof Error ? e.message : String(e), rawText.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'Failed to generate production brief. Please try again.', code: 'TONAL-PARSE' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate color_palette (ensure 5 swatches with valid hex)
    if (!Array.isArray(brief.color_palette) || brief.color_palette.length === 0) {
      brief.color_palette = [
        { hex: '#1a1a1a', name: 'Near Black', role: 'Primary brand background' },
        { hex: '#f5f5f5', name: 'Off White', role: 'Clean negative space' },
        { hex: '#2d6a4f', name: 'Forest Green', role: 'Brand accent' },
        { hex: '#e9c46a', name: 'Warm Gold', role: 'Highlight and energy' },
        { hex: '#264653', name: 'Deep Teal', role: 'Depth and trust' },
      ]
    }
    // Normalise hex codes — ensure # prefix
    brief.color_palette = brief.color_palette.slice(0, 5).map(c => ({
      ...c,
      hex: c.hex.startsWith('#') ? c.hex : `#${c.hex}`,
    }))

    // Persist brief to projects.tonal_brief so it survives page reload and is available to chat-script
    await supabase
      .from('projects')
      .update({ tonal_brief: brief, updated_at: new Date().toISOString() })
      .eq('id', project_id)

    // Log usage
    const orgId = profile.org_id
    await supabase.from('usage_logs').insert({
      user_id: user.id, org_id: orgId, action: 'generate_tonal_brief', model: 'claude-sonnet-4-6',
      input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs,
      metadata: { project_id },
    })

    return new Response(
      JSON.stringify({ brief }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('generate-tonal-brief: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'TONAL-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})