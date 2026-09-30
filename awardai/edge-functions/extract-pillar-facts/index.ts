// extract-pillar-facts — AOY flow redesign, chunk 7 (2026-07-04)
// ─────────────────────────────────────────────────────────────────────────────
// Sibling of extract-agency-facts (S73), for the People and Brand AOY pillars.
// Deliberately a SEPARATE function, not an extension of extract-agency-facts:
// the two new pillars have different shapes and (per the chunk 7 write-pattern
// decision) a different, per-project-only persistence model, so keeping
// extraction separate too means this file can never accidentally touch the
// already-shipped, working Agency extraction path.
//
// PARSE-ONLY — NO DB WRITE, same discipline as extract-agency-facts. Wrong data
// = disqualification, so nothing is persisted from extraction. Returns the
// parsed facts to the client for mandatory point-by-point user review; only the
// service-role /api/pillar-facts route writes anything, and only after the user
// confirms every figure.
//
// JWT verification: ON (match extract-agency-facts's Supabase "Verify JWT"
// setting). Body (one of), PLUS a required pillar:
//   { pillar: 'people'|'brand', project_id: number }
//   { pillar: 'people'|'brand', credentials_text: string }
//   { pillar: 'people'|'brand', url: string }
// Response: { facts: PeopleFacts|BrandFacts, pillar, source: 'project'|'text'|'url' }
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from 'npm:@anthropic-ai/sdk@0.110.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000'

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.split(',').map(o => o.trim())
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0]
  return { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin }
}

// ── SSRF guard — byte-identical to extract-agency-facts. If this ever drifts,
// fix both copies (same parity-contract class as WIN_RATES/ENTRY_FEES). ────────
function isSafePublicUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host.endsWith('.internal') || host.endsWith('.local')) return false
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 127) return false
    if (a === 10) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
    if (a >= 224) return false
  }
  return true
}

async function fetchPublicPageText(rawUrl: string, timeoutMs: number): Promise<string> {
  let current = rawUrl
  for (let hop = 0; hop < 4; hop++) {
    if (!isSafePublicUrl(current)) throw new Error('blocked_url')
    const res = await fetch(current, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Shortlist/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('bad_redirect')
      current = new URL(loc, current).toString()
      continue
    }
    if (!res.ok) throw new Error('fetch_failed')
    return await res.text()
  }
  throw new Error('too_many_redirects')
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Numeric/string coercion helpers (defensive; never trust model shape) ──────
const numOrNull = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v)) ? v : null
const strOrNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim()) ? v.trim() : null

// ── Pillar-specific system prompts + normalisers ───────────────────────────────
const PEOPLE_SYSTEM = `You read nominee bios, agency credentials, award submissions and career documents and extract the STRUCTURED facts a Campaign Asia Agency of the Year (AOY) PEOPLE-pillar entry needs (e.g. Agency Head of the Year, Creative Leader of the Year, Young Achiever of the Year).

Return a SINGLE valid JSON object. No markdown, no prose outside the JSON, no explanation.

ACCURACY IS CRITICAL. These figures can be checked and wrong numbers cause disqualification. Extract ONLY what is genuinely present in the source. NEVER invent, infer, round, or fill a gap. If a figure is not stated, use null (or an empty array). It is far better to return null than a guessed number. The user will review and fill gaps manually.

Do NOT use em-dashes anywhere in any string you return. Use a comma, period, or colon.

FIELDS:
- nominee.full_name: the nominee's full name as stated, else null.
- nominee.current_title: current job title, else null.
- nominee.years_in_industry: total years in the industry as a number, else null.
- nominee.tenure_at_agency: how long at the current agency as stated (e.g. "since 2019", "6 years"), else null.
- career_highlights: array of UP TO 5 career highlights. Each: { title (short label, e.g. "Promoted to ECD"), year (number or null), description (or null) }.
- notable_campaigns: array of UP TO 5 campaigns the nominee led or was central to. Each: { name, brand (or null), year (number or null), result (or null, e.g. "Gold Lion", "+18% sales") }.
- backing_agency.name: the agency backing this nomination, else null.
- backing_agency.revenue: { amount (number or null), currency (or null), period (or null) } — the BACKING AGENCY's revenue, only if stated.
- backing_agency.headcount: { total (number or null), as_of (or null) } — the BACKING AGENCY's headcount, only if stated.
- notes: one short plain-text line on anything material that did not fit the fields, else null.`

const BRAND_SYSTEM = `You read brand performance decks, marketing case studies, award submissions and partnership documents and extract the STRUCTURED facts a Campaign Asia Agency of the Year (AOY) BRAND-pillar entry needs (e.g. Brand of the Year, Marketer of the Year, AD Campaign of the Year).

Return a SINGLE valid JSON object. No markdown, no prose outside the JSON, no explanation.

ACCURACY IS CRITICAL. These figures can be checked and wrong numbers cause disqualification. Extract ONLY what is genuinely present in the source. NEVER invent, infer, round, or fill a gap. If a figure is not stated, use null (or an empty array). It is far better to return null than a guessed number. The user will review and fill gaps manually.

Do NOT use em-dashes anywhere in any string you return. Use a comma, period, or colon.

FIELDS:
- brand.name: the brand's name as stated, else null.
- brand.category: industry/category as stated (e.g. "FMCG - Beverages"), else null.
- brand.market_position: market position as stated (e.g. "#2 by market share, APAC"), else null.
- performance_metrics: array of UP TO 5 performance metrics stated (e.g. revenue growth, market share, brand awareness). Each: { metric (short label), value (number or null), unit (or null, e.g. "%", "USD"), period (or null) }.
- notable_campaigns: array of UP TO 5 campaigns for this brand. Each: { name, agency (or null), year (number or null), result (or null) }.
- endorsing_brand.name: a partner/endorsing/co-marketing brand named in the source, else null.
- endorsing_brand.relationship: the relationship as stated (e.g. "sponsorship", "co-branding", "celebrity endorsement"), else null.
- endorsing_brand.duration: how long the relationship has run as stated, else null.
- notes: one short plain-text line on anything material that did not fit the fields, else null.`

function normalisePeopleFacts(extracted: Record<string, unknown>) {
  const nom = (extracted.nominee ?? {}) as Record<string, unknown>
  const backing = (extracted.backing_agency ?? {}) as Record<string, unknown>
  const backingRev = (backing.revenue ?? {}) as Record<string, unknown>
  const backingHc = (backing.headcount ?? {}) as Record<string, unknown>
  const highlights = Array.isArray(extracted.career_highlights) ? extracted.career_highlights : []
  const campaigns = Array.isArray(extracted.notable_campaigns) ? extracted.notable_campaigns : []

  return {
    schema_version: 1,
    nominee: {
      full_name: strOrNull(nom.full_name),
      current_title: strOrNull(nom.current_title),
      years_in_industry: numOrNull(nom.years_in_industry),
      tenure_at_agency: strOrNull(nom.tenure_at_agency),
    },
    career_highlights: highlights.slice(0, 5).map((h: Record<string, unknown>) => ({
      title: strOrNull(h?.title) ?? '',
      year: numOrNull(h?.year),
      description: strOrNull(h?.description),
    })).filter((h: { title: string }) => h.title),
    notable_campaigns: campaigns.slice(0, 5).map((c: Record<string, unknown>) => ({
      name: strOrNull(c?.name) ?? '',
      brand: strOrNull(c?.brand),
      year: numOrNull(c?.year),
      result: strOrNull(c?.result),
    })).filter((c: { name: string }) => c.name),
    backing_agency: {
      name: strOrNull(backing.name),
      revenue: {
        amount: numOrNull(backingRev.amount),
        currency: strOrNull(backingRev.currency),
        period: strOrNull(backingRev.period),
      },
      headcount: {
        total: numOrNull(backingHc.total),
        as_of: strOrNull(backingHc.as_of),
      },
    },
    notes: strOrNull(extracted.notes),
  }
}

function normaliseBrandFacts(extracted: Record<string, unknown>) {
  const brand = (extracted.brand ?? {}) as Record<string, unknown>
  const endorsing = (extracted.endorsing_brand ?? {}) as Record<string, unknown>
  const metrics = Array.isArray(extracted.performance_metrics) ? extracted.performance_metrics : []
  const campaigns = Array.isArray(extracted.notable_campaigns) ? extracted.notable_campaigns : []

  return {
    schema_version: 1,
    brand: {
      name: strOrNull(brand.name),
      category: strOrNull(brand.category),
      market_position: strOrNull(brand.market_position),
    },
    performance_metrics: metrics.slice(0, 5).map((m: Record<string, unknown>) => ({
      metric: strOrNull(m?.metric) ?? '',
      value: numOrNull(m?.value),
      unit: strOrNull(m?.unit),
      period: strOrNull(m?.period),
    })).filter((m: { metric: string }) => m.metric),
    notable_campaigns: campaigns.slice(0, 5).map((c: Record<string, unknown>) => ({
      name: strOrNull(c?.name) ?? '',
      agency: strOrNull(c?.agency),
      year: numOrNull(c?.year),
      result: strOrNull(c?.result),
    })).filter((c: { name: string }) => c.name),
    endorsing_brand: {
      name: strOrNull(endorsing.name),
      relationship: strOrNull(endorsing.relationship),
      duration: strOrNull(endorsing.duration),
    },
    notes: strOrNull(extracted.notes),
  }
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const { createClient } = await import('npm:@supabase/supabase-js')

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('org_id')
    .eq('id', userData.user.id)
    .single()

  if (!profile?.org_id) {
    return new Response(JSON.stringify({ error: 'Forbidden — no org' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const orgId: number = profile.org_id

  // ── Paywall (mirror extract-agency-facts; fails open on lookup error) ───────
  const { data: orgData } = await serviceClient
    .from('organizations')
    .select('plan, trial_unlimited')
    .eq('id', orgId)
    .single()

  if (orgData && orgData.plan === 'free' && !orgData.trial_unlimited) {
    return new Response(JSON.stringify({
      error: 'subscription_required',
      message: 'An active Shortlist subscription is required to use this feature.',
    }), {
      status: 402, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Body + pillar validation ─────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const pillar = body.pillar === 'people' || body.pillar === 'brand' ? body.pillar : null
  if (!pillar) {
    return new Response(JSON.stringify({ error: 'pillar must be "people" or "brand"', code: 'EPF-400' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Rate limit (shared cap across both pillars — same sibling-parity pattern
  //    as extract-agency-facts/extract-agency-profile, S80). ──────────────────
  const EPF_RATE_LIMIT_PER_HOUR = 20
  const { data: usedLastHour } = await serviceClient.rpc('org_usage_last_hour', {
    p_org_id: orgId,
    p_action: 'extract_pillar_facts',
  })
  if (typeof usedLastHour === 'number' && usedLastHour >= EPF_RATE_LIMIT_PER_HOUR) {
    return new Response(JSON.stringify({
      error: 'Hourly usage limit reached, please try again in a little while.',
      code: 'EPF-RATE',
    }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Resolve the source corpus (byte-identical shape to extract-agency-facts) ─
  let corpus = ''
  let source: 'project' | 'text' | 'url' = 'text'

  if (body.project_id != null) {
    const pid = Number(body.project_id)
    if (!Number.isFinite(pid)) {
      return new Response(JSON.stringify({ error: 'Invalid project_id', code: 'EPF-400' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const { data: proj, error: projErr } = await serviceClient
      .from('projects')
      .select('id, org_id, combined_text, materials')
      .eq('id', pid)
      .single()
    if (projErr || !proj) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'EPF-404' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (Number(proj.org_id) !== Number(orgId)) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'EPF-404' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const parts: string[] = []
    if (proj.combined_text) parts.push(`PROJECT BRIEF:\n${proj.combined_text}`)
    const mats = Array.isArray(proj.materials) ? proj.materials : []
    for (const m of mats) {
      const t = (m && typeof m === 'object' ? (m as Record<string, unknown>).extracted_text : '') as string
      if (t && typeof t === 'string') {
        const name = (m as Record<string, unknown>).name ?? 'material'
        parts.push(`MATERIAL — ${name}:\n${t}`)
      }
    }
    corpus = parts.join('\n\n---\n\n')
    source = 'project'
  } else if (body.credentials_text) {
    corpus = String(body.credentials_text)
    source = 'text'
  } else if (body.url) {
    if (!isSafePublicUrl(String(body.url))) {
      return new Response(JSON.stringify({ error: 'That URL is not allowed. Provide a public website address (https), or paste text instead.', code: 'EPF-422' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    try {
      corpus = stripHtml(await fetchPublicPageText(String(body.url), 12000)).slice(0, 15000)
      source = 'url'
    } catch {
      return new Response(JSON.stringify({ error: 'Could not fetch that URL. Paste the text instead.', code: 'EPF-422' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  if (!corpus || corpus.trim().length < 80) {
    return new Response(JSON.stringify({ error: 'Not enough source text to extract facts from. Add materials to the project, paste text, or give a URL.', code: 'EPF-422' }), {
      status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Claude extraction ─────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
  const systemPrompt = pillar === 'people' ? PEOPLE_SYSTEM : BRAND_SYSTEM

  let extracted: Record<string, unknown>
  let inputTokens = 0
  let outputTokens = 0
  const t0 = Date.now()
  try {
    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `Extract the AOY ${pillar} facts from the source below. Return ONLY the JSON object described in the system prompt.\n\nSOURCE:\n---\n${corpus.slice(0, 16000)}\n---` }],
      system: systemPrompt,
    })
    inputTokens = claudeRes.usage?.input_tokens ?? 0
    outputTokens = claudeRes.usage?.output_tokens ?? 0
    const rawText = (Array.isArray(claudeRes?.content) ? claudeRes.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
    const jsonStart = rawText.indexOf('{')
    const jsonEnd = rawText.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in response')
    extracted = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
  } catch {
    return new Response(JSON.stringify({ error: 'Could not extract facts from this source. Try a cleaner document or paste the key details as text.', code: 'EPF-AI-500' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const facts = pillar === 'people' ? normalisePeopleFacts(extracted) : normaliseBrandFacts(extracted)

  // Usage: writes the SAME action the rate limit counts. Parse-only: NO
  // increment_usage (nothing persisted, not a generated/scored entry).
  await serviceClient.from('usage_logs').insert({
    user_id: userData.user.id,
    org_id: orgId,
    action: 'extract_pillar_facts',
    model: 'claude-sonnet-4-6',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Date.now() - t0,
    metadata: { source, pillar },
  })

  return new Response(JSON.stringify({ facts, pillar, source }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  })
})