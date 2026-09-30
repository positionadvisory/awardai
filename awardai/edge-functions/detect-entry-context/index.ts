import { createClient } from 'npm:@supabase/supabase-js@2'

// Deploy as: detect-entry-context
// JWT verification: OFF
//
// TWO MODES (Session 52):
//
// 1. DETECT (default — original behavior, unchanged):
//    Accepts { text: string }
//    Returns { show: string|null, category: string|null, confidence: 'high'|'medium'|'low' }
//    Answers "what does this document SAY it is targeting?" — used by the Quick
//    Evaluate modal to pre-fill show + category on open.
//
// 2. SUGGEST_CATEGORY (Session 52 — "Suggest for me" in the Quick Eval modal):
//    Accepts { text: string, mode: 'suggest_category', show: string, candidate_categories?: string[] }
//    Returns { show: null, category: string|null, rationale: string|null, confidence: 'high'|'medium'|'low' }
//    Answers "what category SHOULD this entry target at {show}?" — a
//    recommendation for users who don't know the right category. When the
//    client knows the show's category list (SHOW_CATEGORIES) it sends it and
//    the model picks from it; otherwise the model proposes one and the
//    rationale says it is unverified. The user always confirms before
//    evaluating — this only fills the field.
//
// Both modes share the same paywall, rate limit, and usage_logs action name
// ('detect_entry_context') — the 60/hr cap covers the two combined.
//
// AOY AWARENESS (Session 72):
//   Campaign Asia-Pacific Agency of the Year categories are controlled and
//   market-scoped (tier -> track -> category), so they must NOT be free-text
//   guessed from a document. In DETECT mode, if the show resolves to AOY we
//   return { show: <canonical AOY name>, category: null, aoy: true } — the
//   signal for the frontend to open the AOY picker instead of pre-filling a
//   category. In SUGGEST_CATEGORY mode the picker passes the market-scoped
//   canonical category list as candidate_categories; the existing
//   list-constraint then guarantees the model can only return a real,
//   prefix-strippable value (the People category-fit seed, spec §5). The
//   `aoy` flag is echoed in both modes so the UI can branch.
//   isAoyShow() mirrors lib/aoy-taxonomy.ts / evaluate-entry.ts.
const AOY_SHOW_NAME = 'Campaign Asia Agency of the Year'
// ─── Show coverage resolution (v3, 31 Aug 2026) ──────────────────────────────
// detect-entry-context returned a model-detected `show` from an uploaded
// document with no known-set constraint and no coverage flag, so an uncarried,
// misread or invented show name was INDISTINGUISHABLE to the caller from a real
// one. `confidence` reports how clearly the DOCUMENT stated the name, never
// whether we hold the show, and the only recognition logic was the two-substring
// AOY test. Smaller blast radius than generate-directions (nothing persists) but
// more direct: this pre-fills the Quick Evaluate modal, which is the field the
// user is about to score against.
//
// Same design as generate-directions v33 and for the same reasons: the carried
// catalogue and alias table ride in on the request from lib/shows-data.ts (a
// Deno fn cannot import lib/, and no DB table equals that set), the exclusion
// floor is hardcoded so it cannot be widened by a caller, and an old client that
// sends no catalogue gets `carried: null` and today's behaviour exactly.
//
// PARITY PAIR (new 31 Aug 2026): EXCLUDED_SHOW_KEYS, normaliseShowName and
// resolveCarriedShow are byte-identical to the copies in
// generate-directions.ts. This is NOT part of the eight-file AOY contract and
// must not be folded into it. Edit one, edit both, re-run
// scripts/generate-directions-coverage-fixture.mjs. isAoyShow below is
// unchanged and stays strict: do NOT loosen it (S158b).

// Hardcoded floor: shows we have deliberately decided not to carry. Mirrors the
// null-valued entries in KB_SHOW_ALIASES. This is a decisions list, not a
// catalogue: it is short, it is stable, and it is the half that must not be
// widenable by a caller. Two of these were recommended to real orgs.
//
// KNOWN CONTRADICTION, surfaced by this floor on 31 Aug 2026 and left standing
// deliberately: 'Cristal Festival' is BOTH a DEADLINES_2026 row (so it is in
// CANONICAL_SHOWS and the Brief-tab picker offers it) and a KB_SHOW_ALIASES
// null (so the alias map hides it). Its own ENTRY_FEES note reads "N/A, show
// structure changed. See NYF Advertising Awards (Cristal Village) and African
// Cristal Festival". The hide wins here, which is the point of a decisions
// floor: a user who deliberately picks it as a target show is unaffected, but
// the model may not RECOMMEND a programme whose structure we have recorded as
// gone. Tangrams is the same shape one step short (in DEADLINES, note reads
// "N/A, integrated into Spikes Asia", not on the hide list). Both are dead rows
// still offered in a live picker; removing them is a data decision, queued in
// the Backlog, not a call to make inside this function.
const EXCLUDED_SHOW_KEYS = [
  'cristal festival',
  'global cristal awards',
  'mindshare china',
  'asian marketing effectiveness & strategy awards (ames)',
  'asian marketing effectiveness',
  'asian marketing effectiveness awards',
  'mma smarties china',
  'cmo power list',
]

type ShowResolution = {
  raw: string
  resolved: string | null
  reason: 'carried' | 'not_carried' | 'excluded' | 'unconstrained'
}

// Behavioural copy of normaliseKbShow's algorithm. Returns the canonical name,
// or null when the name is hidden or unresolvable. Never invents a mapping.
function normaliseShowName(raw: string, aliases: Record<string, string | null>): string | null {
  if (!raw) return null
  const firstSegment = raw.split(/\s*\|\s*/)[0].trim()
  const yearStripped = firstSegment.replace(/\s+20\d{2}(\s.*)?$/, '').trim()
  const preSepLower = yearStripped.toLowerCase()
  if (preSepLower in aliases) return aliases[preSepLower]
  const cleaned = yearStripped.replace(/\s*[-–—:\/]\s*.*$/, '').trim()
  if (cleaned.length <= 3 || cleaned.includes('{') || cleaned.includes('}')) return null
  const lower = cleaned.toLowerCase()
  if (lower in aliases) return aliases[lower]
  return cleaned
}

// Resolve a model-written show name against the carried set. The exclusion floor
// is applied FIRST and unconditionally, so it holds even with no carried list.
function resolveCarriedShow(
  raw: string,
  carried: string[],
  aliases: Record<string, string | null>,
): ShowResolution {
  const trimmed = (raw ?? '').trim()
  const lower = trimmed.toLowerCase()
  if (EXCLUDED_SHOW_KEYS.includes(lower)) {
    return { raw: trimmed, resolved: null, reason: 'excluded' }
  }
  const normalised = normaliseShowName(trimmed, aliases)
  if (normalised === null && trimmed) {
    // Only the alias table can return null, and it means deliberately hidden.
    const wasAliased = lower in aliases || trimmed.toLowerCase() in aliases
    if (wasAliased) return { raw: trimmed, resolved: null, reason: 'excluded' }
  }
  if (carried.length === 0) {
    return { raw: trimmed, resolved: null, reason: 'unconstrained' }
  }
  const byLower = new Map<string, string>()
  for (const c of carried) byLower.set(c.trim().toLowerCase(), c.trim())
  const direct = byLower.get(lower)
  if (direct) return { raw: trimmed, resolved: direct, reason: 'carried' }
  if (normalised) {
    const viaAlias = byLower.get(normalised.trim().toLowerCase())
    if (viaAlias) return { raw: trimmed, resolved: viaAlias, reason: 'carried' }
  }
  return { raw: trimmed, resolved: null, reason: 'not_carried' }
}

function isAoyShow(showName: string): boolean {
  const s = (showName ?? '').trim().toLowerCase()
  return s.includes('campaign asia') && s.includes('agency of the year')
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

  const emptyResult = { show: null, category: null, confidence: 'low', carried: null, carried_show: null, coverage_reason: null }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
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
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Paywall + rate limit (Session 47 audit fix P-3) ──────────────────────
    // This function was the only authenticated AI spender with no paywall —
    // free/churned accounts could hammer Haiku at will, untracked.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
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
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const DETECT_RATE_LIMIT_PER_HOUR = 60
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'detect_entry_context',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= DETECT_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ── End paywall + rate limit ─────────────────────────────────────────────

    // ── Input ─────────────────────────────────────────────────────────────────
    const body = await req.json()
    const text: string = typeof body?.text === 'string' ? body.text : ''
    const mode: string = body?.mode === 'suggest_category' ? 'suggest_category' : 'detect'
    const suggestShow: string = typeof body?.show === 'string' ? body.show.trim().slice(0, 200) : ''
    // v3: carried-show catalogue + alias table, supplied by the client. Absent
    // = old client = carried is reported as null, never as false. Reporting an
    // unknown as "not carried" would be the same unearned assurance in the
    // opposite direction.
    const carriedShows: string[] = Array.isArray(body?.canonical_shows)
      ? (body.canonical_shows as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim())
      : []
    const showAliases: Record<string, string | null> =
      body?.show_aliases && typeof body.show_aliases === 'object' && !Array.isArray(body.show_aliases)
        ? (body.show_aliases as Record<string, string | null>)
        : {}
    const coverageKnown = carriedShows.length > 0
    // Returns the three coverage fields every response below carries.
    // `carried: null` means we were not told the catalogue, NOT that the show
    // is uncarried.
    const coverageFor = (name: string | null) => {
      if (!name || !coverageKnown) return { carried: null, carried_show: null, coverage_reason: null }
      const r = resolveCarriedShow(name, carriedShows, showAliases)
      return { carried: r.reason === 'carried', carried_show: r.resolved, coverage_reason: r.reason }
    }

    const candidateCategories: string[] = Array.isArray(body?.candidate_categories)
      ? body.candidate_categories
          .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c: string) => c.trim().slice(0, 200))
          .slice(0, 60)
      : []
    if (!text.trim() || (mode === 'suggest_category' && !suggestShow)) {
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Detect: first 4,000 chars + middle window — show/category live in headers.
    // Suggest: bigger excerpt — the RIGHT category depends on the idea and the
    // results, which sit in the body of the entry, not the header.
    const startLen = mode === 'suggest_category' ? 6000 : 4000
    const start = text.slice(0, startLen)
    const mid = text.length > startLen * 2
      ? text.slice(Math.floor(text.length / 2) - 1000, Math.floor(text.length / 2) + 1000)
      : ''
    const excerpt = mid ? `${start}\n...\n${mid}` : start

    // ── Prompts per mode ──────────────────────────────────────────────────────
    const detectSystem = `You are analysing an awards entry document to detect which award show and category it was submitted to.

The document may begin with a "=== Form Fields ===" block containing extracted PDF form field values as "fieldName: value" pairs. These are the most reliable signal — trust them completely.

Return ONLY valid JSON — no markdown fences, no preamble, no explanation:
{"show": "<show name or null>", "category": "<category name or null>", "confidence": "<high|medium|low>"}

Confidence rules:
- high: show and/or category appear in a Form Fields block, a clearly labelled field, a form header, or the document title
- medium: show or category name appears anywhere in the text and is a plausible match
- low: genuinely cannot determine — return null for that field

Always return what you find. Use null only when there is truly no signal at all.`

    const detectUser = `<entry_document>\n${excerpt}\n</entry_document>\n\nExtract the award show name and entry category. If a Form Fields block is present, use it as the primary source.`

    const suggestSystem = `You are an awards strategist recommending the single best-fit entry category for a campaign at a specific award show.

Judge the fit on what the entry actually demonstrates: the nature of the idea, the channels used, and the strength of the results. Do not simply echo a category name mentioned in the document.

${candidateCategories.length > 0
  ? `You MUST choose from the provided candidate category list. Pick the one category this entry has the strongest case in. Set confidence high only when one category is a clearly stronger fit than the rest.`
  : `No category list is available for this show. Propose the most plausible category using this show's standard naming conventions, set confidence to low, and note in the rationale that the category name should be checked against the show's entry kit.`}

Return ONLY valid JSON. No markdown fences, no preamble, no explanation:
{"category": "<category name or null>", "rationale": "<one sentence, max 25 words, explaining why this entry fits that category>", "confidence": "<high|medium|low>"}

The rationale must be plain prose. Never use em-dashes anywhere in your output.`

    const suggestUser = `<entry_document>\n${excerpt}\n</entry_document>\n\nAward show: ${suggestShow}${candidateCategories.length > 0 ? `\n\nCandidate categories (choose exactly one):\n${candidateCategories.map(c => `- ${c}`).join('\n')}` : ''}\n\nRecommend the single best-fit category for this entry.`

    // ── Call Haiku ────────────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: mode === 'suggest_category' ? suggestSystem : detectSystem,
        messages: [{
          role: 'user',
          content: mode === 'suggest_category' ? suggestUser : detectUser,
        }],
      }),
    })

    if (!claudeRes.ok) {
      console.error(`detect-entry-context: Anthropic error ${claudeRes.status}`)
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiData = await claudeRes.json()
    const rawText: string = aiData.content?.[0]?.text ?? ''

    // Usage log (Session 47): required for the rate limit above to count calls,
    // and gives cost telemetry this function never had. Non-blocking.
    try {
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        org_id: profile.org_id,
        action: 'detect_entry_context',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: aiData.usage?.input_tokens ?? 0,
        output_tokens: aiData.usage?.output_tokens ?? 0,
      })
    } catch (logErr) {
      console.error('detect-entry-context: usage log failed', logErr)
    }

    // ── Parse JSON response ───────────────────────────────────────────────────
    try {
      // Strip any accidental markdown fences
      const clean = rawText.replace(/```json?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(clean)

      if (mode === 'suggest_category') {
        // Defence in depth: if candidates were supplied, only return a category
        // from that list (case-insensitive match, canonical casing restored).
        let category: string | null = typeof parsed.category === 'string' ? parsed.category.trim() : null
        if (category && candidateCategories.length > 0) {
          const match = candidateCategories.find(c => c.toLowerCase() === category!.toLowerCase())
          category = match ?? null
        }
        return new Response(JSON.stringify({
          ...coverageFor(suggestShow),
          show: null,
          category,
          rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim().slice(0, 300) : null,
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
          aoy: isAoyShow(suggestShow),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ── Detect mode ──────────────────────────────────────────────────────────
      const detectedShowRaw = typeof parsed.show === 'string' ? parsed.show.trim() : null
      // AOY categories are controlled + market-scoped: never free-text a category.
      // Signal the UI to open the picker (category null, aoy true).
      if (detectedShowRaw && isAoyShow(detectedShowRaw)) {
        return new Response(JSON.stringify({
          // Computed, not assumed: AOY is in the catalogue today, but a response
          // that hardcoded carried:true here would keep saying so if it stopped
          // being carried.
          ...coverageFor(AOY_SHOW_NAME),
          show: AOY_SHOW_NAME,
          category: null,
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
          aoy: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Canonicalise on a carried hit, the same posture as the AOY branch above
      // (which has rewritten a non-canonical AOY name to AOY_SHOW_NAME since v2)
      // and as generate-directions v33's resolve half: rewrite ONLY on a
      // canonical hit, never invent a mapping. Without this, a document reading
      // "The One Show" pre-fills a string that resolves no entry form, no
      // show_profiles row, no deadline and no fee. `detected_show_raw` always
      // carries what the DOCUMENT said, so the UI can be honest about both.
      const coverage = coverageFor(detectedShowRaw)
      return new Response(JSON.stringify({
        ...coverage,
        show:       coverage.carried && coverage.carried_show ? coverage.carried_show : detectedShowRaw,
        detected_show_raw: detectedShowRaw,
        category:   typeof parsed.category === 'string' ? parsed.category.trim() : null,
        // NOTE: `confidence` is how clearly the DOCUMENT stated the show and
        // category. It says nothing about whether we hold the show. Read
        // `carried` for that, and never treat a high confidence as coverage.
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
        aoy: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch {
      console.error('detect-entry-context: failed to parse AI response', rawText.slice(0, 200))
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('detect-entry-context error:', message)
    return new Response(JSON.stringify(emptyResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})