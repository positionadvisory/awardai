import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const { project_id, direction_id, evaluation_id, focus_items } = await req.json()
    if (!project_id || !direction_id) {
      return new Response(JSON.stringify({ error: 'project_id and direction_id are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service client for all DB operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify user via anon client with passed auth header
    // BUG FIX: getUser() with no args always returns null in Deno edge runtime.
    // Must pass JWT extracted from Authorization header explicitly.
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

    // ── Phase 1: Fetch project, direction, and profile in parallel, verify org ownership ──
    const [
      { data: profile },
      { data: project, error: projError },
      { data: direction, error: dirError },
    ] = await Promise.all([
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      supabase.from('projects').select('*').eq('id', project_id).single(),
      supabase.from('directions').select('*').eq('id', direction_id).single(),
    ])
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    const DRAFT_RATE_LIMIT_PER_HOUR = 20
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'generate_draft',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= DRAFT_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached — please try again in a little while.',
        code: 'DRAFT-RATE',
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── End rate limit ──────────────────────────────────────────────────────────

    // ── Fetch org profile (non-blocking — missing profile degrades gracefully) ──
    const { data: orgProfile } = await supabase
      .from('agency_profiles')
      .select('org_type, agency_name, in_house_team_name, agency_partner_names, credentials_summary, strategic_approach, results_language_notes, awards_heritage, typical_clients')
      .eq('org_id', profile.org_id)
      .maybeSingle()

    const orgType = orgProfile?.org_type ?? 'agency'
    const orgDisplayName =
      orgType === 'brand' && orgProfile?.in_house_team_name
        ? orgProfile.in_house_team_name
        : (orgProfile?.agency_name ?? null)

    let orgContextBlock = ''
    if (orgProfile) {
      const lines: string[] = ['SUBMITTING ORGANISATION:']
      if (orgDisplayName) lines.push(`Name: ${orgDisplayName}`)
      lines.push(`Type: ${orgType.replace(/_/g, ' ')}`)
      if (orgProfile.credentials_summary) lines.push(`About: ${orgProfile.credentials_summary}`)
      if (orgProfile.strategic_approach) lines.push(`Strategic approach: ${orgProfile.strategic_approach}`)
      if (orgProfile.results_language_notes) lines.push(`Results language style: ${orgProfile.results_language_notes}`)
      if (orgType === 'brand' && Array.isArray(orgProfile.agency_partner_names) && orgProfile.agency_partner_names.length > 0) {
        lines.push(`Agency partners on this campaign: ${(orgProfile.agency_partner_names as string[]).join(', ')}`)
      }
      if (orgType !== 'brand' && orgProfile.typical_clients) {
        lines.push(`Typical clients: ${orgProfile.typical_clients}`)
      }
      orgContextBlock = lines.join('\n')
    }

    // Org-type-specific framing for the system prompt
    const orgTypeFraming =
      orgType === 'brand'
        ? `\n\nYou are writing on behalf of a brand with an in-house creative team${orgDisplayName ? ` (${orgDisplayName})` : ''}. Write in the voice of the brand as the primary entry credit. Use "the brand" or "the in-house team" rather than "the agency" unless named external partners are specifically relevant to this direction.`
        : orgType === 'production_company'
        ? `\n\nYou are writing on behalf of a production company${orgDisplayName ? ` (${orgDisplayName})` : ''}. Write from the perspective of the production entity as the primary credit. Lead with craft, production innovation, and creative execution.`
        : orgType === 'media_agency'
        ? `\n\nYou are writing on behalf of a media agency${orgDisplayName ? ` (${orgDisplayName})` : ''}. Foreground the media strategy, channel choices, and measurable effectiveness. Attribute results to the media thinking specifically.`
        : orgType === 'consultancy'
        ? `\n\nYou are writing on behalf of a strategy or design consultancy${orgDisplayName ? ` (${orgDisplayName})` : ''}. Foreground the strategic framing, the problem redefinition, and the business impact of the work.`
        : '' // 'agency' — existing framing is correct

    // ── Find the current max draft_generation for this direction ──────────────
    // We never delete old drafts — each generation is preserved for comparison.
    const { data: genRows } = await supabase
      .from('entry_drafts')
      .select('draft_generation')
      .eq('direction_id', direction_id)
      .order('draft_generation', { ascending: false })
      .limit(1)
    const currentMaxGen: number = genRows?.[0]?.draft_generation ?? 0
    const nextGeneration = currentMaxGen + 1

    // ── Optionally fetch evaluation for improvement-guided regeneration ───────
    // When evaluation_id is provided the prompt is seeded with the previous
    // evaluation's output so the new draft directly addresses all identified issues.
    let evaluationContext = ''
    if (evaluation_id) {
      const { data: evaluation } = await supabase
        .from('evaluations')
        .select('overall_score, scores, gaps, recommendations, evaluation_mode, output')
        .eq('id', evaluation_id)
        .eq('org_id', profile.org_id) // audit fix S5: never read another org's evaluation
        .single()

      if (evaluation) {
        const modeLabel = evaluation.evaluation_mode === 'coach' ? 'Coach Review' : 'Jury Evaluation'
        const scores = evaluation.scores as Record<string, number>
        const scoreSummary = Object.entries(scores)
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}/10`)
          .join(' | ')

        // Identify high-scoring dimensions (≥ 7.5) — these sections are already working.
        // We must tell Claude to preserve them rather than rewriting the whole entry.
        const DIMENSION_LABELS: Record<string, string> = {
          strategic_clarity: 'Strategic Clarity',
          insight: 'Insight',
          idea: 'Idea / Creative Concept',
          execution: 'Execution',
          results: 'Results',
          jury_fit: 'Jury Fit / Tone',
          brief_alignment: 'Brief Alignment',
        }
        const highScoreDimensions = Object.entries(scores)
          .filter(([, v]) => v >= 7.5)
          .map(([k]) => DIMENSION_LABELS[k] ?? k.replace(/_/g, ' '))

        const preserveSection = highScoreDimensions.length > 0
          ? `
PRESERVE THESE STRENGTHS — DO NOT REWRITE SECTIONS THAT PRODUCED THESE SCORES:
The following dimensions already scored 7.5 or above. The content responsible for these scores is working. Preserve the substance, evidence, and framing of these sections. Improve them only if a specific kill-factor or priority fix directly requires it — and even then, retain what was strong:
${highScoreDimensions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
          : ''

        // Pull rich v3 output fields if available, otherwise fall back to legacy gaps
        type EvalOutput = {
          kills_it?: string[]
          priority_fixes?: Array<{ fix: string; why: string; action: string }>
          cuts?: string[]
          recommendations?: string
          focus_point?: string
        }
        const output = evaluation.output as EvalOutput | null | undefined

        let juryKillersSection = ''
        let coachFixesSection = ''
        let legacyGapsSection = ''

        if (evaluation.evaluation_mode === 'judge' && output?.kills_it?.length) {
          // Judge mode: the kills_it items are the jury's most damaging objections.
          // The rewrite MUST neutralise each one — these are the primary kill risks.
          juryKillersSection = `
JURY KILL-FACTORS — THE BIGGEST ROOM OBJECTIONS (MUST BE NEUTRALISED IN THE NEW DRAFT):
These are the exact objections a jury member at ${direction?.best_show ?? 'this show'} would voice to eliminate the entry. Every one must be directly addressed by the revised entry:
${output.kills_it.map((k, i) => `${i + 1}. ${k}`).join('\n')}`
        }

        if (evaluation.evaluation_mode === 'coach') {
          if (output?.priority_fixes?.length) {
            coachFixesSection = `
PRIORITY FIXES — HIGHEST IMPACT IMPROVEMENTS (IMPLEMENT EVERY ONE):
${output.priority_fixes.map((f, i) => `${i + 1}. ${f.fix}\n   Why it matters: ${f.why}\n   What to do: ${f.action}`).join('\n')}`
          }
          if (output?.cuts?.length) {
            coachFixesSection += `

THINGS TO CUT OR REFRAME (REMOVE OR REWORK THESE IN THE NEW DRAFT):
${output.cuts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
          }
        }

        // Fall back to legacy gaps if no v3 output
        const gapsList = Array.isArray(evaluation.gaps) && evaluation.gaps.length > 0
          ? evaluation.gaps.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n')
          : ''
        if (gapsList && !juryKillersSection && !coachFixesSection) {
          legacyGapsSection = `
GAPS IDENTIFIED — ADDRESS EVERY ONE IN THE NEW DRAFT:
${gapsList}`
        }

        evaluationContext = `
PREVIOUS ${modeLabel.toUpperCase()} RESULTS (Overall: ${evaluation.overall_score}/10):
${scoreSummary}
${preserveSection}
${juryKillersSection}${coachFixesSection}${legacyGapsSection}

IMPROVEMENT RECOMMENDATIONS — FOLLOW THESE PRECISELY:
${evaluation.recommendations || (output?.recommendations ?? 'None provided.')}

USER PRIORITY FOCUS — THE USER HAS SPECIFICALLY FLAGGED THESE ISSUES TO ADDRESS FIRST:
${Array.isArray(focus_items) && focus_items.length > 0 ? focus_items.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n') : '(None specified — address all issues equally.)'}

INSTRUCTION: This is a targeted improvement draft — not a blank-page rewrite. Preserve sections that are working (listed above). Fix sections that are failing (kill-factors and priority fixes listed above). For any section scored below 7, the new version must be substantively stronger, not cosmetically different. If the evaluation says a section was vague, add specific data. If results were weak, find stronger metrics from the materials. If execution lacked craft detail, add precise descriptions of how things were made and delivered. If jury objections are listed above, the new draft must contain evidence or framing that directly counters each one. The goal is a better entry — not a different one.`
      }
    }

    // ── Build document context from materials ─────────────────────────────────
    const materials: Array<{
      name: string
      extracted_text?: string
      chart_image_paths?: string[]
    }> = project.materials || []

    let documentContext = ''
    const imageBlocks: Array<Record<string, unknown>> = []

    for (const material of materials) {
      if (material.extracted_text) {
        // Phase 2: XML delimiters — treat materials as data, not instructions
        documentContext += `\n\n[Document: ${material.name}]\n<client_material>\n${material.extracted_text.slice(0, 4000)}\n</client_material>`
      }
      if (material.chart_image_paths?.length && imageBlocks.length < 8) {
        for (const imagePath of material.chart_image_paths.slice(0, 4)) {
          try {
            const { data: imageData } = await supabase.storage
              .from('project-materials')
              .download(imagePath)
            if (imageData) {
              const arrayBuffer = await imageData.arrayBuffer()
              const uint8Array = new Uint8Array(arrayBuffer)
              let binary = ''
              for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i])
              }
              const base64 = btoa(binary)
              imageBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
              })
            }
          } catch {
            // Skip failed image — non-fatal
          }
        }
      }
    }

    const isImprovement = Boolean(evaluation_id && evaluationContext)

    const systemPrompt = `You are an expert award entry copywriter with deep knowledge of advertising award shows including Cannes Lions, D&AD, Clio Awards, One Show, Effies, Spikes Asia, Dubai Lynx, London International Awards, WARC Awards, Eurobest, and others.${orgTypeFraming}

Your task is to write a compelling, specific entry draft for a real campaign.${isImprovement ? ' This is an improvement pass — you are rewriting a draft to directly address specific evaluation feedback.' : ''}

RULES:
- CRITICAL — NO FABRICATION: Every statistic, result, metric, percentage, award win, reach figure, sales uplift, or specific claim in the draft MUST be drawn verbatim or directly paraphrased from the provided <client_material> context. Do NOT invent, extrapolate, round up, or estimate any number — even plausibly. Do NOT combine two separate figures to create a new one. If a specific result is not present in the source material, write around it qualitatively ("the campaign delivered measurable uplift in brand consideration") or use an explicit placeholder like [INSERT RESULT]. A clearly flagged gap is far less damaging than a fabricated statistic, which disqualifies entries and destroys credibility with juries who verify claims.
- Use the EXACT field names and structure that the specified award show uses for entries in that category. You know these intimately.
- Write in a confident, active, third-person voice appropriate for award entries.
- Be specific and concrete. Avoid marketing clichés, vague claims, and unsupported superlatives.
- Stay within the word limit for each field (within 10%).${isImprovement ? '\n- Every gap identified in the evaluation MUST be addressed. Every recommendation MUST be implemented. Do not produce a cosmetically different draft: produce a substantively better one.' : ''}
- WRITING STYLE (NON-NEGOTIABLE): Never use em-dashes (—) anywhere in your output. This is an absolute rule with zero exceptions. Restructure any sentence that would use an em-dash by using a comma, colon, semicolon, or by splitting it into two sentences. Em-dashes are an immediately recognisable AI writing marker that undermines entry credibility.
- JURY READING PATTERNS, DRAFT CRAFT RULES: The opening sentence is the single highest-leverage element. It must be specific, concrete, and immediately engaging. It cannot start with "We", "Our", or "This campaign". It cannot be a generic market observation. Juries decide whether to keep reading within three seconds. For structure, follow this sequence without deviations: specific insight (the human or cultural truth), specific idea (what was done and why it was the only right response), specific execution (how), specific results (what changed, with real numbers and attribution). For results: include exactly one headline result stated with full specificity, naming the metric, the number, the timeframe, and ideally a comparison baseline. Never use "significant results" or "strong performance" without an immediate specific number. Argue one angle completely; do not introduce multiple angles even if the brief suggests them. If the draft references local platforms, cultural events, or market conditions that an international jury would not recognise, add one brief contextualising clause. Every sentence must earn its place: a shorter entry that is completely clear outperforms a longer entry that explains everything.
- Return ONLY a valid JSON array. No markdown fences, no explanation, no preamble.

Each object in the array must have exactly these fields:
{
  "field_key": "snake_case_identifier",
  "field_label": "Exact Field Name as Used by This Award Show",
  "word_limit": 150,
  "version_a": "The fully written draft content for this field"
}`

    const campaignContext = `CAMPAIGN: ${project.campaign_name}
CLIENT: ${project.client_name || 'Not specified'}
BRIEF:
${project.combined_text || 'No brief provided — draft based on campaign name and direction only.'}${
      documentContext ? `\n\nSUPPORTING DOCUMENTS:${documentContext}` : ''
    }`

    const directionContext = `TARGET SHOW: ${direction.best_show}
CATEGORY: ${direction.best_category}
ENTRY ANGLE: ${direction.angle || 'Not specified'}
HOOK: ${direction.hook || 'Not specified'}
STRENGTHS TO LEVERAGE: ${direction.strengths || 'Not specified'}
RISKS TO ADDRESS: ${direction.risks || 'Not specified'}`

    const userPromptText = `${isImprovement ? 'Rewrite and substantially improve' : 'Write'} a complete entry draft for the following:

${orgContextBlock ? orgContextBlock + '\n\n' : ''}${campaignContext}

ENTRY STRATEGY:
${directionContext}
${evaluationContext}

Generate all required fields using the exact field structure that ${direction.best_show} uses for ${direction.best_category} entries. Base every claim strictly on the campaign information provided above.`

    const contentBlocks: Array<Record<string, unknown>> = []
    if (imageBlocks.length > 0) {
      contentBlocks.push({
        type: 'text',
        text: 'The following images are chart/graph pages extracted from campaign documents. Use any data, metrics, or results visible in them to support and strengthen the entry:\n',
      })
      contentBlocks.push(...imageBlocks)
      contentBlocks.push({ type: 'text', text: '\n' + userPromptText })
    } else {
      contentBlocks.push({ type: 'text', text: userPromptText })
    }

    const startTime = Date.now()
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: isImprovement ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
        max_tokens: isImprovement ? 8000 : 6000,
        stream: false,
        system: systemPrompt,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    })
    const latencyMs = Date.now() - startTime

    if (!claudeRes.ok) {
      const errorBody = await claudeRes.text()
      console.error(`generate-draft: Anthropic API error — status ${claudeRes.status} ${claudeRes.statusText}`, errorBody.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'AI service error.', code: `DRAFT-AI-${claudeRes.status}`, status: claudeRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text ?? ''
    const inputTokens: number = claudeData.usage?.input_tokens ?? 0
    const outputTokens: number = claudeData.usage?.output_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens

    let parsed: Array<Record<string, unknown>>
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()
      parsed = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) throw new Error('Response was not an array')
    } catch {
      console.error('generate-draft: failed to parse AI response', rawText.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'Unexpected AI response.', code: 'DRAFT-PARSE' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Insert new generation — old drafts are PRESERVED, never deleted ───────
    const rows = parsed.map((field, i) => ({
      project_id,
      direction_id,
      org_id: project.org_id,
      created_by: user.id,
      field_key: typeof field.field_key === 'string' ? field.field_key : `field_${i}`,
      field_label: typeof field.field_label === 'string' ? field.field_label : `Field ${i + 1}`,
      word_limit: typeof field.word_limit === 'number' ? field.word_limit : null,
      version_a: typeof field.version_a === 'string' ? field.version_a : null,
      award_show: direction.best_show,
      category: direction.best_category,
      sort_order: i,
      draft_generation: nextGeneration,
      model_used: isImprovement ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      tokens_used: Math.round(tokensUsed / parsed.length),
      status: 'draft',
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('entry_drafts')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('generate-draft: failed to insert drafts', insertError)
      return new Response(JSON.stringify({ error: 'Could not save the draft. Please try again.', code: 'DRAFT-DB-500' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log usage
    await supabase.rpc('increment_usage', {
      p_org_id: project.org_id,
      p_counter: 'entries_generated',
      p_tokens: tokensUsed,
    })

    await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: project.org_id,
      action: 'generate_draft',
      model: isImprovement ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      metadata: {
        project_id,
        direction_id,
        field_count: parsed.length,
        draft_generation: nextGeneration,
        evaluation_guided: Boolean(evaluation_id),
        evaluation_id: evaluation_id ?? null,
        org_type: orgType,
      },
    })

    return new Response(JSON.stringify({
      entry_drafts: inserted,
      draft_generation: nextGeneration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    // Audit S59 H2: log detail server-side, return a generic message + code.
    console.error('generate-draft: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'DRAFT-500' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})