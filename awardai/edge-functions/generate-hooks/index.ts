import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
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

    const { direction_id } = await req.json()
    if (!direction_id) {
      return new Response(JSON.stringify({ error: 'direction_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Fetch direction ───────────────────────────────────────────────────────
    const { data: direction, error: dirError } = await supabase
      .from('directions')
      .select('name, best_show, best_category, angle, hook, strengths, project_id, org_id')
      .eq('id', direction_id)
      .single()

    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Verify org membership ────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.org_id !== direction.org_id) {
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

    // ── Rate limit (audit S59 M2): hourly cap; the matching usage_logs row is
    //    written below, which is what org_usage_last_hour counts. ──────────────────
    const HOOKS_RATE_LIMIT_PER_HOUR = 30
    {
      const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
        p_org_id: profile.org_id,
        p_action: 'generate_hooks',
      })
      if (typeof usedLastHour === 'number' && usedLastHour >= HOOKS_RATE_LIMIT_PER_HOUR) {
        return new Response(JSON.stringify({
          error: 'Hourly usage limit reached — please try again in a little while.',
          code: 'HOOKS-RATE',
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── Fetch project for campaign name + brief ───────────────────────────────
    const { data: project } = await supabase
      .from('projects')
      .select('campaign_name, combined_text')
      .eq('id', direction.project_id)
      .single()

    // ── Build prompt ─────────────────────────────────────────────────────────
    const prompt = `You are a senior awards writer known for jury-stopping entry openers. Your job is to generate 10 alternative opening lines for an award entry.

ENTRY CONTEXT:
Campaign: ${project?.campaign_name || 'Unknown'}
Show & Category: ${direction.best_show} — ${direction.best_category}
Strategic angle: ${direction.angle || 'N/A'}
Current opener: "${direction.hook || 'none yet'}"
Strengths: ${direction.strengths || 'N/A'}
${project?.combined_text?.trim() ? `Brief context: ${project.combined_text.trim().slice(0, 600)}` : ''}

RULES:
- Maximum 10 words each (shorter is usually better)
- Vary the approach across the 10: some provocative, some data-led, some poetic, some cultural tension, some simple and declarative
- Each must be able to stand as the literal first line of the entry: a jury reads this and decides whether to keep reading
- Never start with "We", "Our", or "This campaign"
- Do not reuse the current opener
- Do not use quotation marks inside the lines themselves
- WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) in any hook. This is an absolute rule. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.
- Return ONLY a valid JSON array of exactly 10 strings. No markdown fences, no preamble, no explanation.

["Opening line one", "Opening line two", ...]`

    // ── Call Claude ───────────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`generate-hooks: Anthropic API error — status ${claudeRes.status}`, errorBody.slice(0, 300))
      return new Response(
        JSON.stringify({ error: 'AI service error.', code: `HOOKS-AI-${claudeRes.status}`, status: claudeRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text ?? ''

    // ── Parse response ────────────────────────────────────────────────────────
    let hooks: string[]
    try {
      const firstBracket = rawText.indexOf('[')
      const lastBracket = rawText.lastIndexOf(']')
      if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
        throw new Error('No JSON array found')
      }
      hooks = JSON.parse(rawText.slice(firstBracket, lastBracket + 1))
      if (!Array.isArray(hooks) || hooks.length === 0) throw new Error('Empty or invalid array')
      // Sanitise — keep only non-empty strings
      hooks = hooks.filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    } catch {
      console.error('generate-hooks: failed to parse response', rawText.slice(0, 300))
      return new Response(
        JSON.stringify({ error: 'Unexpected AI response.', code: 'HOOKS-PARSE' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log usage (audit S59 M2) — required for the hourly cap above to count.
    try {
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        org_id: profile.org_id,
        action: 'generate_hooks',
        model: 'claude-sonnet-4-6',
        input_tokens: claudeData.usage?.input_tokens ?? 0,
        output_tokens: claudeData.usage?.output_tokens ?? 0,
        metadata: { direction_id },
      })
    } catch (logErr) {
      console.error('generate-hooks: usage log failed', logErr)
    }

    return new Response(JSON.stringify({ hooks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('generate-hooks: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'HOOKS-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})