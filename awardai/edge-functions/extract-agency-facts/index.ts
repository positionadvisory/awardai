// extract-agency-facts — AOY Phase 2 (Session 73)
// ─────────────────────────────────────────────────────────────────────────────
// Extracts the STRUCTURED, NUMERIC agency-facts record used by Campaign AOY
// entries: revenue + YoY %, top-5 new-business wins (with values), top-10 client
// retention, headcount, awards, and ownership % (for the market point system).
//
// This is a NEW, AOY-specific function. It deliberately does NOT touch
// extract-agency-profile (which extracts the QUALITATIVE org profile into
// agency_profiles and is consumed by the campaign path). Keeping them separate
// honours the "new AOY functions only / campaign path untouched" mandate and
// avoids changing a shared function's response shape.
//
// PARSE-ONLY — NO DB WRITE. Accuracy here is CFO-certifiable and wrong data = a
// disqualification, so nothing is persisted from extraction. The function returns
// the parsed facts to the client for a mandatory point-by-point user review; only
// the service-role /api/agency-facts route writes anything, and only after the
// user confirms every figure.
//
// JWT verification: ON (match extract-agency-profile's Supabase "Verify JWT"
// setting). Body (one of):
//   { project_id: number }   -> read that project's materials + brief server-side
//   { credentials_text: string }
//   { url: string }          -> SSRF-guarded fetch of a public page
// Response: { facts: AgencyFacts, source: 'project'|'text'|'url' }
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from 'npm:@anthropic-ai/sdk@0.106.0'

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

// ── SSRF guard (mirror of extract-agency-profile, audit C1 / S12) ────────────
// Identical hostname-based allowlist. A user-supplied URL must resolve to a
// public http(s) host; loopback, link-local (incl. 169.254.169.254 metadata),
// RFC1918, IPv6 ULA/loopback and internal TLDs are blocked, and every redirect
// hop is re-validated.
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

  // Session 48: pass JWT explicitly — no-arg getUser() is unreliable in Deno.
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

  // ── Paywall (mirror extract-agency-profile; fails open on lookup error) ─────
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

  // ── Rate limit (per-org hourly cap; trial_unlimited exempt in the RPC; fails
  //    open on RPC error). Reuses the shared usage_logs(org_id, action,
  //    created_at) scan; the usage_logs insert before the 200 return below writes
  //    the SAME action, so the cap is live (an uncounted cap is a dead cap). No
  //    new index needed. Added S80 alongside the matching cap on
  //    extract-agency-profile, so the two sibling extractors stay at parity
  //    (both were uncapped; both are now capped). ──
  const EAF_RATE_LIMIT_PER_HOUR = 20
  const { data: usedLastHour } = await serviceClient.rpc('org_usage_last_hour', {
    p_org_id: orgId,
    p_action: 'extract_agency_facts',
  })
  if (typeof usedLastHour === 'number' && usedLastHour >= EAF_RATE_LIMIT_PER_HOUR) {
    return new Response(JSON.stringify({
      error: 'Hourly usage limit reached, please try again in a little while.',
      code: 'EAF-RATE',
    }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Resolve the source corpus ───────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  let corpus = ''
  let source: 'project' | 'text' | 'url' = 'text'

  if (body.project_id != null) {
    // Pull the project's own materials + brief (Ben: "in many cases they'll have
    // the data in the entry already"). Service-role read, but TENANT-SCOPED: the
    // project must belong to the caller's org (IDOR guard — sequential bigint ids).
    const pid = Number(body.project_id)
    if (!Number.isFinite(pid)) {
      return new Response(JSON.stringify({ error: 'Invalid project_id', code: 'EAF-400' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const { data: proj, error: projErr } = await serviceClient
      .from('projects')
      .select('id, org_id, combined_text, materials')
      .eq('id', pid)
      .single()
    if (projErr || !proj) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'EAF-404' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (Number(proj.org_id) !== Number(orgId)) {
      // Never reveal existence cross-tenant.
      return new Response(JSON.stringify({ error: 'Project not found', code: 'EAF-404' }), {
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
      return new Response(JSON.stringify({ error: 'That URL is not allowed. Provide a public website address (https), or paste text instead.', code: 'EAF-422' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    try {
      corpus = stripHtml(await fetchPublicPageText(String(body.url), 12000)).slice(0, 15000)
      source = 'url'
    } catch {
      return new Response(JSON.stringify({ error: 'Could not fetch that URL. Paste the text instead.', code: 'EAF-422' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  if (!corpus || corpus.trim().length < 80) {
    return new Response(JSON.stringify({ error: 'Not enough source text to extract agency facts from. Add materials to the project, paste text, or give a URL.', code: 'EAF-422' }), {
      status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Claude extraction ─────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

  const systemPrompt = `You read agency credentials decks, financial summaries, award submissions and company documents and extract the STRUCTURED, NUMERIC facts a Campaign Asia Agency of the Year (AOY) entry needs.

Return a SINGLE valid JSON object. No markdown, no prose outside the JSON, no explanation.

ACCURACY IS CRITICAL. These figures are CFO-certified and wrong numbers cause disqualification. Extract ONLY what is genuinely present in the source. NEVER invent, infer, round, or fill a gap. If a figure is not stated, use null (or an empty array). It is far better to return null than a guessed number. The user will review and fill gaps manually.

Do NOT use em-dashes anywhere in any string you return. Use a comma, period, or colon.

FIELDS:
- revenue.amount: most recent annual revenue/billings as a number (digits only, no currency symbol or commas), else null.
- revenue.currency: ISO-ish code or symbol as stated (e.g. "USD", "SGD", "HKD"), else null.
- revenue.period: the period the revenue covers as stated (e.g. "FY2025", "2025", "year to Dec 2025"), else null.
- revenue.yoy_pct: year-on-year growth as a number of percent (e.g. 12.5 for +12.5%, -4 for a decline), ONLY if stated or directly computable from two stated figures, else null.
- headcount.total: total staff as a number, else null.
- headcount.as_of: the date/period the headcount is stated as of, else null.
- ownership.independent_pct: percent of the agency that is independently owned (relevant to the AOY market point system), as a number, else null.
- ownership.structure: short description of ownership/structure if stated (e.g. "founder-owned independent", "majority owned by X Holdings"), else null.
- new_business_wins: array of UP TO 5 of the most significant new-business wins. Each: { client, value (number or null), currency (or null), period (or null) }. Include only wins actually named in the source.
- client_retention: array of UP TO 10 retained/long-standing clients. Each: { client, tenure (string as stated, e.g. "since 2018", "7 years", or null) }.
- awards: array of notable awards/wins stated. Each: { show, category (or null), result (or null, e.g. "Gold", "Grand Prix", "Shortlist"), year (number or null) }.
- notes: one short plain-text line on anything material that did not fit the fields, else null.`

  const userMessage = `Extract the AOY agency facts from the source below. Return ONLY the JSON object with exactly these keys:
{
  "revenue": { "amount": number|null, "currency": string|null, "period": string|null, "yoy_pct": number|null },
  "headcount": { "total": number|null, "as_of": string|null },
  "ownership": { "independent_pct": number|null, "structure": string|null },
  "new_business_wins": [ { "client": string, "value": number|null, "currency": string|null, "period": string|null } ],
  "client_retention": [ { "client": string, "tenure": string|null } ],
  "awards": [ { "show": string, "category": string|null, "result": string|null, "year": number|null } ],
  "notes": string|null
}

SOURCE:
---
${corpus.slice(0, 16000)}
---`

  let extracted: Record<string, unknown>
  let inputTokens = 0
  let outputTokens = 0
  const t0 = Date.now()
  try {
    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userMessage }],
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
    return new Response(JSON.stringify({ error: 'Could not extract agency facts from this source. Try a cleaner document or paste the key figures as text.', code: 'EAF-AI-500' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Normalise into the canonical shape (defensive; never trust model shape) ──
  const numOrNull = (v: unknown): number | null =>
    (typeof v === 'number' && Number.isFinite(v)) ? v : null
  const strOrNull = (v: unknown): string | null =>
    (typeof v === 'string' && v.trim()) ? v.trim() : null

  const rev = (extracted.revenue ?? {}) as Record<string, unknown>
  const hc = (extracted.headcount ?? {}) as Record<string, unknown>
  const own = (extracted.ownership ?? {}) as Record<string, unknown>

  const wins = Array.isArray(extracted.new_business_wins) ? extracted.new_business_wins : []
  const retention = Array.isArray(extracted.client_retention) ? extracted.client_retention : []
  const awards = Array.isArray(extracted.awards) ? extracted.awards : []

  const facts = {
    schema_version: 1,
    revenue: {
      amount: numOrNull(rev.amount),
      currency: strOrNull(rev.currency),
      period: strOrNull(rev.period),
      yoy_pct: numOrNull(rev.yoy_pct),
    },
    headcount: {
      total: numOrNull(hc.total),
      as_of: strOrNull(hc.as_of),
    },
    ownership: {
      independent_pct: numOrNull(own.independent_pct),
      structure: strOrNull(own.structure),
    },
    new_business_wins: wins.slice(0, 5).map((w: Record<string, unknown>) => ({
      client: strOrNull(w?.client) ?? '',
      value: numOrNull(w?.value),
      currency: strOrNull(w?.currency),
      period: strOrNull(w?.period),
    })).filter((w: { client: string }) => w.client),
    client_retention: retention.slice(0, 10).map((c: Record<string, unknown>) => ({
      client: strOrNull(c?.client) ?? '',
      tenure: strOrNull(c?.tenure),
    })).filter((c: { client: string }) => c.client),
    awards: awards.slice(0, 25).map((a: Record<string, unknown>) => ({
      show: strOrNull(a?.show) ?? '',
      category: strOrNull(a?.category),
      result: strOrNull(a?.result),
      year: numOrNull(a?.year),
    })).filter((a: { show: string }) => a.show),
    notes: strOrNull(extracted.notes),
  }

  // Usage: write usage_logs with the SAME action the rate limit counts (or the
  // cap is dead). Parse-only extraction: NO increment_usage (nothing is persisted
  // and this is not a generated/scored entry, so it must not inflate
  // entries_generated). Fire-and-forget; a logging failure never blocks the result.
  await serviceClient.from('usage_logs').insert({
    user_id: userData.user.id,
    org_id: orgId,
    action: 'extract_agency_facts',
    model: 'claude-sonnet-4-6',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Date.now() - t0,
    metadata: { source },
  })

  return new Response(JSON.stringify({ facts, source }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
