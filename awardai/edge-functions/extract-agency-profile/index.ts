// extract-agency-profile — Phase 6 rewrite
// Detects org_type (agency / brand / production_company / media_agency / consultancy)
// from uploaded credentials text or scraped website, then extracts structured profile
// fields and upserts to agency_profiles. Called from the profile panel on /projects.
//
// JWT verification: ON (user must be authenticated)
// Body: { credentials_text: string } | { url: string }
// Response: { profile: AgencyProfileRow }

import Anthropic from 'npm:@anthropic-ai/sdk'

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

// ── SSRF guard (Session 59, audit C1 / S12) ─────────────────────────────────
// This function fetches a URL supplied by an authenticated user. Without this
// guard a user could point it at internal services or the cloud metadata
// endpoint (169.254.169.254) and have the response laundered back through the
// extracted profile. Only allow public http(s) hosts; block loopback,
// link-local, RFC1918, IPv6 ULA/loopback, and internal TLDs.
// Note: hostname-based. A resolve-and-recheck would additionally defeat
// DNS-rebinding (residual risk, acceptable at current scale).
function isSafePublicUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host.endsWith('.internal') || host.endsWith('.local')) return false
  // IPv6 loopback / unique-local / link-local
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false
  // IPv4 literal ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 127) return false                 // 0.0.0.0/8, loopback
    if (a === 10) return false                             // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false      // RFC1918
    if (a === 192 && b === 168) return false               // RFC1918
    if (a === 169 && b === 254) return false               // link-local incl. metadata
    if (a >= 224) return false                             // multicast / reserved
  }
  return true
}

// Fetch a public page, re-validating on every redirect hop so an attacker
// cannot 302 from a public host to an internal one. Throws on any unsafe URL.
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
      current = new URL(loc, current).toString() // resolve relative redirects
      continue
    }
    if (!res.ok) throw new Error('fetch_failed')
    return await res.text()
  }
  throw new Error('too_many_redirects')
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── Auth ─────────────────────────────────────────────────────────────────
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

  // userClient for org_id lookup (respects RLS)
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  // Session 48: pass JWT explicitly — no-arg getUser() is unreliable in Deno (no local storage)
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

  // ── Paywall check ─────────────────────────────────────────────────────────
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
      status: 402,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // ── End paywall check ──────────────────────────────────────────────────────

  // ── Rate limit (per-org hourly cap; trial_unlimited exempt in the RPC; fails
  //    open on RPC error). Reuses the shared usage_logs(org_id, action,
  //    created_at) scan; the usage_logs insert after the upsert below writes the
  //    SAME action, so the cap is live (an uncounted cap is a dead cap). No new
  //    index needed. Added S80 alongside the matching cap on extract-agency-facts,
  //    so the two sibling extractors stay at parity (both were uncapped; both are
  //    now capped). ──
  const EAP_RATE_LIMIT_PER_HOUR = 20
  const { data: usedLastHour } = await serviceClient.rpc('org_usage_last_hour', {
    p_org_id: orgId,
    p_action: 'extract_agency_profile',
  })
  if (typeof usedLastHour === 'number' && usedLastHour >= EAP_RATE_LIMIT_PER_HOUR) {
    return new Response(JSON.stringify({
      error: 'Hourly usage limit reached, please try again in a little while.',
      code: 'EXTRACT-RATE',
    }), {
      status: 429, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const body = await req.json()
  let credentialsText: string = body.credentials_text ?? ''

  // If URL provided, fetch the page text server-side (avoids CORS from browser).
  // Session 59 (audit C1): SSRF-guarded — only public http(s) hosts, redirects re-validated.
  if (!credentialsText && body.url) {
    if (!isSafePublicUrl(String(body.url))) {
      return new Response(JSON.stringify({ error: 'That URL is not allowed. Provide a public website address (https), or upload a PDF instead.' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    try {
      const html = await fetchPublicPageText(String(body.url), 12000)
      // Strip HTML tags — keep readable text
      credentialsText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 15000)
    } catch {
      return new Response(JSON.stringify({ error: 'Could not fetch that URL. Try uploading a PDF instead.' }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  if (!credentialsText || credentialsText.length < 80) {
    return new Response(JSON.stringify({ error: 'Not enough text to extract a profile from.' }), {
      status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Claude extraction ─────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

  const systemPrompt = `You are an expert at reading agency credentials decks, brand documents, and company websites and extracting structured profile information for use in award entry AI systems.

You must return a single valid JSON object. No markdown, no explanation — only the raw JSON object.

DETECTING ORG TYPE:
Read the document carefully and determine which type of organisation this is:
- "agency" — an independent creative, PR, or full-service advertising agency that creates work for clients
- "brand" — a brand or company that commissions creative work, which may have an in-house creative team
- "media_agency" — a specialist media planning and buying agency
- "production_company" — a production house, film company, or content studio
- "consultancy" — a strategy, design, or innovation consultancy (e.g. McKinsey Design, IDEO, Accenture Song)

KEY EXTRACTION RULES:
- Extract only what is genuinely present in the document. Do not fabricate or hallucinate.
- For agencies: focus on their creative positioning, sector strengths, and results language style.
- For brands: focus on their in-house team name (if any), the kind of work they produce, their category, and which agencies they tend to partner with.
- agency_name: for agencies this is the agency name. For brands this is the brand/company name.
- in_house_team_name: only for brands — the name of their internal creative unit if mentioned (e.g. "The Coca-Cola Studio", "Nike Brand Design").
- agency_partner_names: only for brands — any external creative, media, or production partners named in the document.
- tagline: the organisation's positioning line or strapline, if present (not a campaign tagline).
- website_url: the primary website URL if mentioned.
- pr_contact_name / pr_contact_email: extract from any contact/credits section if present.
- sector_focus: primary industries or categories the org works in, as an array of short strings.
- office_locations: cities or countries where they have offices, as an array of "City, Country" strings.
- credentials_summary: 3–5 sentences in plain prose summarising who they are, what makes them distinct, and what types of work they are known for. Write this in third person.
- strategic_approach: 2–3 sentences on how they tend to frame strategy or approach creative problems.
- results_language_notes: 1–2 sentences on the results language or proof points they emphasise (e.g. "Leads with commercial results over vanity metrics. Frequently cites brand tracking data.").
- awards_heritage: any significant awards history, show preferences, or past wins mentioned.
- typical_clients: for agencies, a short description of their typical client types or named clients.`

  const userMessage = `Extract the organisation profile from this credentials document:

---
${credentialsText.slice(0, 14000)}
---

Return a single JSON object with these exact keys:
{
  "org_type": "agency" | "brand" | "production_company" | "media_agency" | "consultancy",
  "agency_name": string,
  "agency_city": string | null,
  "tagline": string | null,
  "website_url": string | null,
  "pr_contact_name": string | null,
  "pr_contact_email": string | null,
  "credentials_summary": string,
  "strategic_approach": string | null,
  "sector_focus": string[],
  "results_language_notes": string | null,
  "typical_clients": string | null,
  "awards_heritage": string | null,
  "office_locations": string[] | null,
  "in_house_team_name": string | null,
  "agency_partner_names": string[] | null
}`

  let extracted: Record<string, unknown>
  let inputTokens = 0
  let outputTokens = 0
  const t0 = Date.now()
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    })

    inputTokens = message.usage?.input_tokens ?? 0
    outputTokens = message.usage?.output_tokens ?? 0
    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonStart = rawText.indexOf('{')
    const jsonEnd = rawText.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in response')
    extracted = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
  } catch {
    return new Response(JSON.stringify({ error: 'Profile extraction failed — the AI could not parse this document. Try a different file.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ── Validate org_type ────────────────────────────────────────────────────
  const validOrgTypes = ['agency', 'brand', 'production_company', 'media_agency', 'consultancy']
  const orgType = validOrgTypes.includes(extracted.org_type as string)
    ? (extracted.org_type as string)
    : 'agency'

  // ── Upsert to agency_profiles ────────────────────────────────────────────
  const upsertPayload = {
    org_id:                 orgId,
    org_type:               orgType,
    agency_name:            extracted.agency_name ?? null,
    agency_city:            extracted.agency_city ?? null,
    tagline:                extracted.tagline ?? null,
    website_url:            extracted.website_url ?? null,
    pr_contact_name:        extracted.pr_contact_name ?? null,
    pr_contact_email:       extracted.pr_contact_email ?? null,
    credentials_summary:    extracted.credentials_summary ?? null,
    strategic_approach:     extracted.strategic_approach ?? null,
    sector_focus:           Array.isArray(extracted.sector_focus) ? extracted.sector_focus : [],
    results_language_notes: extracted.results_language_notes ?? null,
    typical_clients:        extracted.typical_clients ?? null,
    awards_heritage:        extracted.awards_heritage ?? null,
    office_locations:       Array.isArray(extracted.office_locations) ? extracted.office_locations : null,
    in_house_team_name:     extracted.in_house_team_name ?? null,
    agency_partner_names:   Array.isArray(extracted.agency_partner_names) ? extracted.agency_partner_names : null,
    raw_credentials_text:   credentialsText.slice(0, 12000),
    profile_version:        1,
    generated_at:           new Date().toISOString(),
    updated_at:             new Date().toISOString(),
  }

  const { data: savedProfile, error: upsertError } = await serviceClient
    .from('agency_profiles')
    .upsert(upsertPayload, { onConflict: 'org_id' })
    .select()
    .single()

  if (upsertError) {
    console.error('extract-agency-profile: failed to save profile', upsertError)
    return new Response(JSON.stringify({ error: 'Could not save the agency profile. Please try again.', code: 'EXTRACT-DB-500' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Usage: write usage_logs with the SAME action the rate limit counts (or the
  // cap is dead). No increment_usage: this is profile extraction, not a
  // generated/scored entry. Fire-and-forget; a logging failure never blocks the
  // result.
  await serviceClient.from('usage_logs').insert({
    user_id: userData.user.id,
    org_id: orgId,
    action: 'extract_agency_profile',
    model: 'claude-sonnet-4-6',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Date.now() - t0,
    metadata: { source: body.url ? 'url' : 'text' },
  })

  return new Response(JSON.stringify({ profile: savedProfile }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
