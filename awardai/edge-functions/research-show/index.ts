import { createClient } from 'npm:@supabase/supabase-js@2'

// Deploy as: research-show
// JWT verification: OFF
//
// Called from the admin page when Ben clicks "Research" on a show request.
// Fetches the show's website, extracts structured show intelligence using
// Claude Sonnet, saves the research_result to show_requests, and returns
// a preview summary for Ben to review before adding the show to the system.
//
// Input:
//   { show_request_id: number, url: string, entry_kit_text?: string, market?: string }
//
// Output:
//   { result: ShowResearch }
//
// ShowResearch shape:
//   { show_name, show_url, deadline_date, deadline_label, entry_fee_range,
//     categories[], description, industry, judging_philosophy, scoring_emphasis,
//     language_guidance, common_mistakes, jury_composition_notes }

// ── SSRF guard (Session 59, audit C1 / S12) ─────────────────────────────────
// Admin-only function, but it fetches a supplied URL, so the same guard applies
// for defense-in-depth. Only public http(s) hosts; block loopback, link-local
// (incl. cloud metadata 169.254.169.254), RFC1918, IPv6 ULA/loopback, internal TLDs.
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
    // ── Auth — admin only ────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
    if (authError || !user || user.email !== 'ben@positionadvisory.com') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    const { show_request_id, url, entry_kit_text, market } = await req.json()

    if (!url?.trim()) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Fetch show website (SSRF-guarded, Session 59) ──────────────────────────
    let pageText = ''
    try {
      const html = await fetchPublicPageText(url.trim(), 10000)
      // Strip HTML tags — keep meaningful text, collapse whitespace
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 12000)
    } catch (fetchErr) {
      console.warn('research-show: could not fetch URL (or blocked):', fetchErr)
      // Continue — entry_kit_text or show name alone may be enough
    }

    // ── Compose context ───────────────────────────────────────────────────────
    const contextParts: string[] = []
    if (pageText) contextParts.push(`<website_content>\n${pageText}\n</website_content>`)
    if (entry_kit_text?.trim()) {
      contextParts.push(`<entry_kit>\n${entry_kit_text.trim().slice(0, 8000)}\n</entry_kit>`)
    }
    if (market?.trim()) contextParts.push(`Market/region: ${market.trim()}`)

    if (contextParts.length === 0) {
      return new Response(JSON.stringify({ error: 'No content could be retrieved from the URL.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Call Claude Sonnet ────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: `You are an awards industry researcher. Your job is to extract structured intelligence about an award show from its website and/or entry kit.

Return ONLY a valid JSON object — no markdown fences, no explanation. Use null for any field you cannot determine confidently.

Required JSON shape:
{
  "show_name": "Exact official show name",
  "show_url": "Official website URL",
  "deadline_date": "YYYY-MM-DD or null",
  "deadline_label": "e.g. Standard Entry, Late Entry, Final Deadline — or null",
  "entry_fee_range": "e.g. $500–$1,200 USD — or null",
  "categories": ["Category 1", "Category 2"],
  "description": "1–2 sentence plain-English description of what this show recognises and who enters it.",
  "industry": "marketing | architecture | legal | finance | technology | healthcare | other",
  "judging_philosophy": "How does this jury approach judging? What is their overall philosophy?",
  "scoring_emphasis": "What specific dimensions do they score on? What matters most to judges?",
  "language_guidance": "What language, tone, and framing tends to land well with this jury?",
  "common_mistakes": "What do entrants typically get wrong or miss?",
  "jury_composition_notes": "Who are the judges? What is their background and seniority level?"
}

Rules:
- show_name must be the exact official name, not an abbreviation
- categories: list up to 15 of the most common/prominent categories; omit granular sub-categories
- description: factual, no marketing language, no em-dashes
- For industry: choose the best fit from the list; use "other" only if none apply
- If deadline info is ambiguous or mentions multiple dates, use the most prominent standard deadline
- Be honest about what you cannot determine — use null rather than guess`,
        messages: [{
          role: 'user',
          content: `Please research this award show and return structured intelligence.\n\nURL: ${url.trim()}\n\n${contextParts.join('\n\n')}`,
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error(`research-show: Anthropic error ${claudeRes.status}:`, errBody.slice(0, 300))
      return new Response(JSON.stringify({ error: 'AI service error', status: claudeRes.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiData = await claudeRes.json()
    const rawText: string = aiData.content?.[0]?.text ?? ''

    // ── Parse response ────────────────────────────────────────────────────────
    let result: Record<string, unknown>
    try {
      const clean = rawText.replace(/```json?/g, '').replace(/```/g, '').trim()
      result = JSON.parse(clean)
    } catch {
      console.error('research-show: failed to parse AI response', rawText.slice(0, 300))
      return new Response(JSON.stringify({ error: 'Could not parse AI response. Try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Persist research_result to show_requests ──────────────────────────────
    if (show_request_id) {
      const { error: updateError } = await admin
        .from('show_requests')
        .update({ status: 'researched', research_result: result })
        .eq('id', show_request_id)

      if (updateError) {
        console.warn('research-show: failed to update show_request status:', updateError.message)
      }
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('research-show error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})