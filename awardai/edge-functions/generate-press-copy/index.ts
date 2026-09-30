// generate-press-copy — JWT OFF (gateway), user auth enforced in-function (Session 47 audit fix S1)
// Generates AI-drafted social copy (LinkedIn / X / Instagram) for a press kit direction.
// Called per-format so users can generate only the sections they want.
// AUDIT FIX S1 (Session 47): this function previously had NO user authentication
// and no org-ownership check — any holder of the anon key could enumerate
// direction_ids and read any org's entry content. It now requires a valid user
// JWT and verifies the project belongs to the caller's org. The frontend call
// sites in projects/[id]/page.tsx now send the session access token.

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // Dynamic CORS (standardised — was wildcard '*')
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
    // ── Auth (audit fix S1) ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const jwt = authHeader.replace('Bearer ', '')

    const { direction_id, format, project_id, press_target } = await req.json()

    if (!direction_id || !format || !project_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: direction_id, format, project_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Resolve caller's org + fetch resources in parallel ──────────────────
    const [{ data: profile }, { data: direction, error: dirError }, { data: project, error: projError }] = await Promise.all([
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      supabase.from('directions').select('id, name, angle, best_show, best_category, hook, project_id, org_id').eq('id', direction_id).single(),
      supabase.from('projects').select('campaign_name, client_name, org_id').eq('id', project_id).single(),
    ])

    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    // Tenant isolation: project and direction must both belong to the caller's
    // org, and the direction must belong to the named project.
    // Number() coercion: the frontend sends project_id as a string (useParams).
    if (
      project.org_id !== profile.org_id ||
      direction.org_id !== profile.org_id ||
      Number(direction.project_id) !== Number(project_id)
    ) {
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
    const PRESS_RATE_LIMIT_PER_HOUR = 30
    {
      const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
        p_org_id: profile.org_id,
        p_action: 'generate_press_copy',
      })
      if (typeof usedLastHour === 'number' && usedLastHour >= PRESS_RATE_LIMIT_PER_HOUR) {
        return new Response(JSON.stringify({
          error: 'Hourly usage limit reached — please try again in a little while.',
          code: 'PRESS-RATE',
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── Fetch current entry drafts for this direction ────────────────────────
    const { data: allDrafts } = await supabase
      .from('entry_drafts')
      .select('field_label, custom_text, version_a, version_b, version_c, selected, draft_generation, sort_order, field_key')
      .eq('direction_id', direction_id)
      .neq('field_key', 'entry')
      .order('sort_order', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolveField = (d: any): string => {
      if (d.custom_text?.trim()) return d.custom_text.trim()
      if (d.selected === 'b' && d.version_b?.trim()) return d.version_b.trim()
      if (d.selected === 'c' && d.version_c?.trim()) return d.version_c.trim()
      return d.version_a?.trim() || ''
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentDrafts: any[] = []
    if (allDrafts && allDrafts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maxGen = Math.max(...allDrafts.map((d: any) => d.draft_generation ?? 0))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentDrafts = allDrafts.filter((d: any) => (d.draft_generation ?? 0) === maxGen)
    }

    // ── Fetch org profile ────────────────────────────────────────────────────
    let orgName = ''
    if (project?.org_id) {
      const { data: orgProfile } = await supabase
        .from('agency_profiles')
        .select('org_type, agency_name, in_house_team_name, tagline')
        .eq('org_id', project.org_id)
        .maybeSingle()
      if (orgProfile) {
        orgName = orgProfile.org_type === 'brand'
          ? (orgProfile.in_house_team_name || orgProfile.agency_name || '')
          : (orgProfile.agency_name || '')
      }
    }

    // ── Build context strings ────────────────────────────────────────────────
    const show     = direction.best_show     || ''
    const category = direction.best_category || ''
    const showCategory = [category, show].filter(Boolean).join(' at ')
    const campaign = project?.campaign_name || ''
    const client   = project?.client_name   || ''
    const hook     = direction.hook || direction.angle || ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldContent = currentDrafts
      .map((d: any) => {
        const content = resolveField(d)
        return content ? `${d.field_label}:\n${content}` : ''
      })
      .filter(Boolean)
      .join('\n\n')

    // ── Format-specific instructions ─────────────────────────────────────────
    const pressTargetContext = (target: string): string => {
      const map: Record<string, string> = {
        'Local':            'local city or country-level press and journalists who care about work made in or relevant to their specific market',
        'Regional':         'regional trade and general press covering a multi-country area (e.g. Southeast Asia, MENA, Latin America)',
        'Global':           'global advertising and marketing trade press (e.g. Campaign, Ad Age, The Drum, Contagious)',
        'Trade / Industry': 'advertising and marketing industry trade media — editors who follow award shows closely and want the strategic story behind the work',
        'Consumer':         'mainstream consumer and lifestyle editorial — journalists who need to understand why the work matters to a general audience, not just the industry',
        'Broadcast':        'broadcast and video media — journalists interested in the production, visual craft, or cultural impact of the work',
      }
      return map[target] || `${target} press and media`
    }

    const formatInstructions: Record<string, string> = {
      linkedin: `Write a professional LinkedIn post announcing this award entry. Tone: industry-confident, genuine, not boastful. Start with a strong opening line about the work — not "We entered" or "We're thrilled to announce". Include the show and category context, a compelling line about what makes the work distinctive, and 3–4 relevant hashtags at the end on their own line. Length: 120–180 words.`,
      x: `Write a single X (Twitter) post announcing this award entry. Tone: direct and punchy — reads like it was written by a human, not a PR team. Include the campaign name, show/category, and one strong insight about the work. Must be 260 characters or fewer. No hashtags needed.`,
      instagram: `Write an Instagram caption announcing this award entry. Tone: warm, visual, confident. Lead with the work, not the award. Include a natural reference to the show/category. End with 5–7 relevant hashtags on a new line. Length: 80–130 words.`,
      quicksummary: `Write a 2–3 sentence summary of this award entry suitable for press release openers and email introductions. Tone: professional, clear, factual — no hype or superlatives. First sentence: what the campaign is and who made it. Second sentence: what makes it distinctive or what it achieved. Third sentence (optional): the show/category context. Do not start with the organisation name.`,
      presshook: `Write a single punchy press hook — one or two sentences maximum — for ${press_target ? pressTargetContext(press_target) : 'industry press'}. This is the lead sentence that would open a press release or a pitch email to a journalist. It must be immediately newsworthy and written for the specific audience. The hook should not start with the campaign name. Make it feel like something an editor would actually want to run — specific, confident, and non-generic.`,
    }

    const instruction = formatInstructions[format] ?? formatInstructions.linkedin

    const audienceNote = format === 'presshook' && press_target
      ? ` You are writing specifically for ${press_target.toLowerCase()} press — calibrate the angle, language, and framing accordingly.`
      : ''
    const systemPrompt = `You are a communications specialist writing award entry announcements for the advertising and marketing industry. You write in the voice of ${orgName || 'the submitting organisation'} — professional, confident, and industry-fluent.${audienceNote} Write only the copy itself with no preamble, no explanation, and no quotation marks wrapping the whole output.`

    const userPrompt = [
      instruction,
      '',
      `Campaign: ${campaign}`,
      client   ? `Client: ${client}`              : null,
      orgName  ? `Organisation: ${orgName}`        : null,
      showCategory ? `Entered in: ${showCategory}` : null,
      hook     ? `Hook / key idea: ${hook}`         : null,
      fieldContent ? `\nEntry content:\n${fieldContent}` : null,
    ].filter(s => s !== null).join('\n')

    // ── Call Claude ──────────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    // Audit fix A-10: surface Anthropic API errors instead of returning an
    // empty 200 (previously a 429/529 produced { copy: '' } silently).
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`generate-press-copy: Anthropic API error — status ${response.status}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error — please try again.', code: `PRESS-AI-${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiData = await response.json()
    const copy = aiData.content?.[0]?.text?.trim() ?? ''

    // Audit fix A-13: this function previously spent Haiku tokens with zero
    // cost telemetry. Log usage (non-blocking — failure must not break copy).
    try {
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        org_id: profile.org_id,
        action: 'generate_press_copy',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: aiData.usage?.input_tokens ?? 0,
        output_tokens: aiData.usage?.output_tokens ?? 0,
        metadata: { project_id, direction_id, format, press_target: press_target ?? null },
      })
    } catch (logErr) {
      console.error('generate-press-copy: usage log failed', logErr)
    }

    return new Response(JSON.stringify({ copy }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('generate-press-copy: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong generating press copy.', code: 'PRESS-500' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})