// segment-entry-generic, Upload Segmentation P1 (Session 22 Jul 2026 — Lorenz-triggered gap)
// ─────────────────────────────────────────────────────────────────────────────
// GENERIC, FORM-LESS verbatim segmenter for the entire creative track (Cannes
// Lions, D&AD, LIA, Eurobest, Epica, One Show, Clios...) — any show WITHOUT a
// structured entry_form in show_profiles. Route A per
// Upload-Segmentation-BUILD-PLAN-2026-07-22.md §2: a model pass reads the
// uploaded doc, finds the entry's OWN section structure (its own headings /
// questions / word limits), and splits the VERBATIM answer text into the same
// multi-row entry_drafts shape segment-entry-config / segment-aoy-entry /
// segment-smarties-entry already write (field_label, word_limit, sort_order,
// version_a, draft_generation). Zero display changes, zero eval changes:
// evaluate-entry already assembles every row of the latest generation.
//
// THIS IS NOT segment-entry-config. That function maps an upload onto a
// SHOW'S OWN config entry_form.sections (a fixed spec). This function has NO
// show_profiles / entry_form dependency at all — it segments purely from the
// document's own structure, which is the whole point: creative-track shows
// have no seeded entry_form and Cannes alone has dozens of category forms
// that change yearly (Route B, rejected as primary, see build plan §2).
//
// EXTRACTION, NOT GENERATION (same discipline as every sibling segmenter, S126/
// S127 fabrication guard). The model never rewrites. It returns text that must
// be a VERBATIM (whitespace-normalized) substring of the source. Any doubt ->
// {segmented:false}, existing single-blob path untouched. NEVER let this
// function author content.
//
// COVERAGE + VERBATIM VALIDATION IS CODE-SIDE, NOT TRUSTED (build plan §2):
// after the model returns, every non-empty section body must verbatim-match
// the source (whitespace-normalized substring check) and the concatenated
// section bodies must cover >= COVERAGE_THRESHOLD of the source's estimated
// non-boilerplate ("answer") content. Both checks are pure functions
// (validateSegmentation + friends below) — PARITY CONTRACT with
// scripts/segment-entry-generic-fixture.mjs, keep byte-identical.
//
// CONFIDENCE GATE: the model itself returns {confident: boolean}. Unstructured
// docs (video scripts like W4W, decks, press releases) have no entry-form
// shape to find; the model is instructed to say so, and confident:false short-
// circuits to {segmented:false} before any coverage math runs.
//
// CHECKBOX / MULTI-SELECT BLOCKS (build plan §2): plain-text extraction from a
// docx checkbox list carries no reliable checked/unchecked marker (verified on
// the real TPU doc — "Objective(s)" renders as six option lines with zero
// selection indicator). The model is instructed to keep the WHOLE block as
// ONE section, word_limit: null, never split into per-option fragments and
// never silently dropped. This mirrors the junk-176-char-section bug in draft
// 1534 (build plan §1) that this function must not repeat.
//
// BOUNDED RUNTIME (S108/S109 lesson, build plan §2): one model call, deadline
// well under the ~150s edge function ceiling, for docs <= SINGLE_PASS_WORD_LIMIT
// words. Longer docs go two-pass: (1) a cheap structure-only call gets the
// section/word-limit map, (2) a second call extracts verbatim bodies against
// that map. Both calls are wrapped in their own AbortController deadline.
// Timeout is an INFRASTRUCTURE failure, not a business-logic "doesn't
// segment" outcome, so it returns 504 SEG-TIMEOUT rather than a graceful
// 200 {segmented:false} — the client still falls back to the blob path on
// any non-2xx, so this does not block the eval either way.
//
// draft_generation DIVERGENCE FROM segment-entry-config (deliberate, build
// plan §3 P1): the config segmenter always APPENDS a new generation (it can
// run after an eval already exists). This function runs immediately after
// upload, before any eval, to upgrade the SAME generation-1 blob the upload
// flow already wrote (field_key='entry') into sectioned rows. On a validated
// pass it DELETES that gen-1 blob row and inserts the sectioned rows at
// draft_generation 1 — it does not create generation 2. If P2's "Re-segment"
// affordance later calls this on a project with real eval history, revisit
// this (see the P1 session's closing prompt for P2).
//
// USAGE: rate action `segment_entry_generic`, 20/hr (matches segment-entry-
// config's cap), WITH the matching usage_logs insert (an uncounted cap is
// dead, per Schema §6). NO increment_usage: segmentation maps an existing
// entry, it does not generate a new one (same policy as every sibling
// segmenter).
//
// JWT verification: OFF (this function does its own auth, like every sibling).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════════
// PURE VALIDATION LOGIC — PARITY CONTRACT with
// scripts/segment-entry-generic-fixture.mjs. Keep byte-identical; re-run the
// fixture after touching anything below.
// ═══════════════════════════════════════════════════════════════════════════

/** Collapse whitespace + lowercase, for substring/coverage comparison only
 * (never used for what gets STORED — version_a keeps the model's returned
 * text as-is, just trimmed). */
function normalizeForMatch(s: string): string {
  // Punctuation-variant folding (live-smoke fix, 22 Jul 2026, SEGGEN-VERBATIM
  // on the real TPU doc at coverage 0.93): docx extraction carries curly
  // quotes and typographic dashes; the model returns straight equivalents.
  // Folding BOTH sides keeps the fabrication guard intact (a fabricated
  // sentence still cannot match) while not failing verbatim extraction over
  // a quote glyph.
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Heuristic: is this line/paragraph of the SOURCE document itself boilerplate
 * (the entry form's own question copy / word-limit footer / instruction
 * bullets) rather than the entrant's answer? Used ONLY to size the coverage
 * denominator (an estimate of how much of the source is real answer content),
 * never to decide what the model may extract. Verified against the real TPU
 * CL26 doc: classifies ~35% of the doc as boilerplate, leaving ~65% as
 * estimated answer content, matching the doc's actual question/answer split
 * paragraph-for-paragraph (see fixture). A prompt+answer merged into one
 * paragraph (seen once in the TPU doc, the Sustainability benchmarks line)
 * will mis-classify as boilerplate and undercount the denominator slightly —
 * accepted: it only makes the coverage ratio MORE forgiving, never less, so
 * it cannot false-negative a real extraction. The verbatim substring check
 * below is the load-bearing anti-fabrication guard; this is only a sizing
 * estimate for the coverage floor. */
function isBoilerplateLine(line: string): boolean {
  const l = line.trim()
  if (!l) return false
  if (/\d+\s*word limit/i.test(l)) return true
  if (l.endsWith('?')) return true
  if (/^(please|explain|consider|what|describe|outline|based on|if there|if relevant|if yes|for guidance|misrepresentation)/i.test(l)) return true
  if (l.startsWith('•') || l.startsWith('-')) return true
  // A short line with no terminal punctuation and no lowercase-starting
  // continuation reads as a section HEADING (e.g. "Brand Context",
  // "Objective(s)", "Interpretation (30% of vote)") rather than prose.
  if (l.length < 40 && /^[A-Z][A-Za-z()/ &,'\-]+$/.test(l) && !l.endsWith('.')) return true
  return false
}

function estimateAnswerChars(sourceText: string): number {
  const lines = sourceText.split('\n')
  let boiler = 0
  for (const line of lines) if (isBoilerplateLine(line)) boiler += line.length
  return Math.max(0, sourceText.length - boiler)
}

function wordCount(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

type ExtractedSection = {
  field_label: string
  word_limit: number | null
  body_verbatim: string
}

type ValidationResult = {
  passed: boolean
  coverageRatio: number
  badVerbatim: string[]
  answerChars: number
  coverageChars: number
  sectionCount: number
}

const COVERAGE_THRESHOLD = 0.70
const MIN_SECTIONS = 2
const MAX_FIELD_LABEL_LEN = 120

/** Code-side validation of the model's segmentation against the ORIGINAL
 * source text. Two independent checks, either failing means "no": (1) every
 * non-empty section body must be a verbatim (whitespace-normalized) substring
 * of the source — the anti-fabrication guard; (2) the concatenated non-empty
 * section bodies must cover >= COVERAGE_THRESHOLD of the source's estimated
 * answer content — the anti-under-extraction guard (catches a model that
 * "segments" by only pulling 2 of 12 sections). */
function validateSegmentation(sourceText: string, sections: ExtractedSection[]): ValidationResult {
  const normSource = normalizeForMatch(sourceText)
  const badVerbatim: string[] = []
  let coverageChars = 0
  for (const s of sections) {
    const body = (s.body_verbatim ?? '').toString().trim()
    if (!body) continue // an empty section is a correct, honest answer — never penalized here
    const normBody = normalizeForMatch(body)
    if (!normSource.includes(normBody)) badVerbatim.push(s.field_label || '(unlabeled section)')
    coverageChars += body.length
  }
  const answerChars = estimateAnswerChars(sourceText)
  const coverageRatio = answerChars > 0 ? coverageChars / answerChars : 0
  const sectionCount = sections.length
  const passed = badVerbatim.length === 0 && coverageRatio >= COVERAGE_THRESHOLD && sectionCount >= MIN_SECTIONS
  return { passed, coverageRatio, badVerbatim, answerChars, coverageChars, sectionCount }
}

// ═══════════════════════════════════════════════════════════════════════════
// Model call plumbing
// ═══════════════════════════════════════════════════════════════════════════

const MODEL = 'claude-sonnet-4-6'
const SINGLE_PASS_WORD_LIMIT = 4000
const SINGLE_PASS_DEADLINE_MS = 100_000
const TWO_PASS_DEADLINE_MS = 55_000 // per call, two calls, total well under the ~150s edge fn ceiling

const SEGMENT_SYSTEM_PROMPT = `You are looking at an award entry document uploaded as-is (not yet mapped onto any structured entry form). Your job is to find the entry's OWN section structure, the way IT is actually organized: the headings, the questions it answers, and any stated word limits, then return the entrant's ANSWER text for each section, VERBATIM.

RULES, NON-NEGOTIABLE:
- EXTRACTIVE ONLY. Every "body_verbatim" you return must be text drawn directly from the document, lightly trimmed of surrounding whitespace. Do NOT write new sentences, do NOT summarize into new claims, do NOT add, round, or change any number, date, or name.
- Put the SECTION'S OWN QUESTION/HEADING (normalized to a short label, e.g. "Brand Context", not the full question text) into "field_label". Never leave the question copy, instructions, or word-limit footer text inside "body_verbatim" — those belong in field_label or nowhere.
- If a section has no separate visible answer (the entrant left it blank, or the document has no distinct heading for it), return "" for body_verbatim rather than inventing content or borrowing text from another section. An empty section is the correct, honest answer when the document is silent.
- CHECKBOX / MULTI-SELECT BLOCKS (e.g. a list of objective options, a yes/no disclosure toggle): plain-text extraction cannot reliably show which option was checked. Keep the ENTIRE block as ONE section, verbatim, with word_limit null. Never split it into one section per option, and never drop it silently.
- If the document has NO recognizable entry-form structure at all (a video/script table, a slide deck, a press release, a plain narrative with no headings or questions), set "confident" to false and return an empty "sections" array. Do not force a structure onto a document that has none.
- Never place the same passage under more than one section unless the document genuinely repeats that point under more than one heading.
- WRITING STYLE: never use em-dashes in "field_label" or any other text YOU author. This rule does NOT apply to "body_verbatim": there you must reproduce the document's own characters exactly as they appear, including its dashes, quotes and punctuation. Never normalize or transform the document's characters.
- Return ONLY a valid JSON object. No markdown fences, no preamble, no trailing prose.`

function buildExtractionUserPrompt(entryText: string, showName: string, category: string | null): string {
  return `TARGET SHOW: ${showName}${category ? `, category: ${category}` : ''} (context only — the show has no structured entry form on file; find the document's OWN sections.)

<client_material>
${entryText}
</client_material>

Return ONLY this JSON object:
{
  "confident": <true if this document has a recognizable entry-form structure (headings/questions/word limits) you can map, false if it does not (e.g. a script, deck, or plain narrative)>,
  "sections": [
    { "field_label": "<short normalized section name>", "word_limit": <number or null>, "body_verbatim": "<verbatim answer text for this section, or \"\" if unaddressed>" }
  ]
}
Order "sections" the way they appear in the document.`
}

function buildStructureOnlyUserPrompt(entryText: string, showName: string, category: string | null): string {
  return `TARGET SHOW: ${showName}${category ? `, category: ${category}` : ''}.

<client_material>
${entryText}
</client_material>

This document is long, so first just find its section structure. Return ONLY this JSON object:
{
  "confident": <true if this document has a recognizable entry-form structure (headings/questions/word limits), false if it does not>,
  "sections": [ { "field_label": "<short normalized section name>", "word_limit": <number or null> } ]
}
Order "sections" the way they appear in the document. Do not extract any body text yet.`
}

function buildStructuredExtractionUserPrompt(entryText: string, sections: { field_label: string; word_limit: number | null }[]): string {
  const sectionLines = sections.map((s, i) => `${i + 1}. "${s.field_label}"${s.word_limit != null ? ` (stated limit ${s.word_limit} words)` : ''}`).join('\n')
  return `Using the section map already established for this document:
${sectionLines}

<client_material>
${entryText}
</client_material>

For each section above, return the entrant's VERBATIM answer text (or "" if the document does not address it). Return ONLY this JSON object:
{
  "sections": [
    { "field_label": "<same label as above, verbatim>", "word_limit": <same value as above>, "body_verbatim": "<verbatim answer text, or \"\">" }
  ]
}`
}

type ClaudeCallResult =
  | { ok: true; rawText: string; inputTokens: number; outputTokens: number }
  | { ok: false; timeout: true }
  | { ok: false; timeout: false; status: number }

async function callClaude(system: string, userText: string, deadlineMs: number): Promise<ClaudeCallResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        stream: false,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      }),
    })
    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`segment-entry-generic: Anthropic API error, status ${res.status}`, errorBody.slice(0, 500))
      return { ok: false, timeout: false, status: res.status }
    }
    const data = await res.json()
    const rawText: string = (Array.isArray(data?.content) ? data.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
    const inputTokens: number = data.usage?.input_tokens ?? 0
    const outputTokens: number = data.usage?.output_tokens ?? 0
    return { ok: true, rawText, inputTokens, outputTokens }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, timeout: true }
    }
    console.error('segment-entry-generic: fetch to Anthropic threw', err)
    return { ok: false, timeout: false, status: 0 }
  } finally {
    clearTimeout(timer)
  }
}

function parseJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const jsonStart = rawText.indexOf('{')
    const jsonEnd = rawText.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return null
    const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function coerceSections(raw: unknown): ExtractedSection[] {
  if (!Array.isArray(raw)) return []
  const out: ExtractedSection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const label = typeof o.field_label === 'string' ? o.field_label.trim().slice(0, MAX_FIELD_LABEL_LEN) : ''
    if (!label) continue
    const wl = typeof o.word_limit === 'number' && Number.isFinite(o.word_limit) ? o.word_limit : null
    const body = typeof o.body_verbatim === 'string' ? o.body_verbatim.trim() : ''
    out.push({ field_label: label, word_limit: wl, body_verbatim: body })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  // ── Dynamic CORS (computed inside Deno.serve, not module level — Schema §6) ──
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

    const body = await req.json()
    const project_id = Number(body.project_id)
    const direction_id = Number(body.direction_id)
    const material_path = typeof body.material_path === 'string' ? body.material_path : ''
    if (!project_id || !direction_id || !material_path) {
      return new Response(JSON.stringify({ error: 'project_id, direction_id and material_path are required', code: 'SEGGEN-400' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Pass JWT explicitly — no-arg getUser() is unreliable in Deno (Schema §6).
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

    // ── Fetch profile, project, direction; verify org ownership (IDOR, Schema §6/§9) ──
    const [
      { data: profile },
      { data: project, error: projError },
      { data: direction, error: dirError },
    ] = await Promise.all([
      supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      supabase.from('projects')
        .select('id, org_id, campaign_name, client_name, materials')
        .eq('id', project_id).single(),
      supabase.from('directions').select('id, org_id, project_id, best_show, best_category').eq('id', direction_id).single(),
    ])
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (projError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found', code: 'SEGGEN-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (Number(project.org_id) !== Number(profile.org_id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (dirError || !direction) {
      return new Response(JSON.stringify({ error: 'Direction not found', code: 'SEGGEN-404' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (Number(direction.org_id) !== Number(profile.org_id) || Number(direction.project_id) !== Number(project.id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // No entry_form / show_profiles gate: this function is form-less BY DESIGN
    // (build plan §2, Route A). It segments from the document's own structure,
    // never a config spec. No agency_facts / entry_type gate either: the
    // source of truth is the uploaded document itself, same posture as every
    // sibling segmenter.

    // ── Paywall (fails open on lookup error, by design — Schema §6) ──
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, trial_unlimited')
      .eq('id', profile.org_id)
      .single()
    if (org && org.plan === 'free' && !org.trial_unlimited) {
      return new Response(JSON.stringify({
        error: 'subscription_required',
        message: 'An active Shortlist subscription is required to use this feature.',
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Rate limit (Schema §6 pattern; action name MUST match the usage_logs
    //    insert below or the cap is dead). ──
    const SEGMENT_GENERIC_RATE_LIMIT_PER_HOUR = 20
    const { data: usedLastHour } = await supabase.rpc('org_usage_last_hour', {
      p_org_id: profile.org_id,
      p_action: 'segment_entry_generic',
    })
    if (typeof usedLastHour === 'number' && usedLastHour >= SEGMENT_GENERIC_RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({
        error: 'Hourly usage limit reached, please try again in a little while.',
        code: 'SEGGEN-RATE',
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Source: uploaded entry text, read SERVER-SIDE from projects.materials
    //    by PATH (never index — Gotchas-Critical). The DB JSONB row carries
    //    extracted_text (the slim in-memory client copy does not). ──
    const materials: Array<{ path?: string; name?: string; extracted_text?: string }> =
      Array.isArray(project.materials) ? project.materials : []
    const sourceMaterial = materials.find(m => m && m.path === material_path)
    const entryText = (sourceMaterial?.extracted_text ?? '').trim()
    if (!entryText) {
      // Graceful, not a hard error: the blob path (already written at upload
      // time) still stands. Never block the eval (build plan §2).
      return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-NOTEXT', reason: 'No extracted text available yet for this material.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const showName = direction.best_show ?? 'this show'
    const category = direction.best_category ?? null
    const docWords = wordCount(entryText)

    let rawText = ''
    let inputTokens = 0
    let outputTokens = 0

    if (docWords <= SINGLE_PASS_WORD_LIMIT) {
      // ── Single pass: structure + verbatim extraction in one call. ──
      const result = await callClaude(SEGMENT_SYSTEM_PROMPT, buildExtractionUserPrompt(entryText, showName, category), SINGLE_PASS_DEADLINE_MS)
      if (!result.ok) {
        if (result.timeout) {
          return new Response(JSON.stringify({ error: 'Segmentation timed out.', code: 'SEG-TIMEOUT', segmented: false }), {
            status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service error.', code: `SEGGEN-AI-${result.status}`, segmented: false }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      rawText = result.rawText
      inputTokens = result.inputTokens
      outputTokens = result.outputTokens
    } else {
      // ── Two-pass (S108/S109 bounded-runtime lesson, build plan §2): a cheap
      //    structure-only call, then a bounded per-map extraction call. Both
      //    calls still send the full document (structure alone still needs to
      //    see the whole doc) but each has a smaller expected output, keeping
      //    each call's latency down independently. ──
      const structureResult = await callClaude(SEGMENT_SYSTEM_PROMPT, buildStructureOnlyUserPrompt(entryText, showName, category), TWO_PASS_DEADLINE_MS)
      if (!structureResult.ok) {
        if (structureResult.timeout) {
          return new Response(JSON.stringify({ error: 'Segmentation timed out.', code: 'SEG-TIMEOUT', segmented: false }), {
            status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service error.', code: `SEGGEN-AI-${structureResult.status}`, segmented: false }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const structureParsed = parseJsonObject(structureResult.rawText)
      const structureConfident = structureParsed?.confident === true
      const structureSections = Array.isArray(structureParsed?.sections) ? (structureParsed!.sections as { field_label?: string; word_limit?: number | null }[]) : []
      if (!structureConfident || structureSections.length === 0) {
        return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-NOTCONFIDENT', reason: 'Document has no recognizable entry-form structure.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const sectionMap = structureSections
        .filter(s => typeof s.field_label === 'string' && s.field_label.trim())
        .map(s => ({ field_label: s.field_label!.trim().slice(0, MAX_FIELD_LABEL_LEN), word_limit: typeof s.word_limit === 'number' ? s.word_limit : null }))

      const extractResult = await callClaude(SEGMENT_SYSTEM_PROMPT, buildStructuredExtractionUserPrompt(entryText, sectionMap), TWO_PASS_DEADLINE_MS)
      if (!extractResult.ok) {
        if (extractResult.timeout) {
          return new Response(JSON.stringify({ error: 'Segmentation timed out.', code: 'SEG-TIMEOUT', segmented: false }), {
            status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service error.', code: `SEGGEN-AI-${extractResult.status}`, segmented: false }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Second-pass response has no top-level "confident" (already gated above);
      // synthesize one so the shared parse path below is uniform.
      rawText = extractResult.rawText.replace(/^\s*\{/, '{"confident":true,')
      inputTokens = structureResult.inputTokens + extractResult.inputTokens
      outputTokens = structureResult.outputTokens + extractResult.outputTokens
    }

    const parsed = parseJsonObject(rawText)
    if (!parsed) {
      console.error('segment-entry-generic: failed to parse AI response', rawText.slice(0, 500))
      return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-PARSE', reason: 'Unexpected AI response.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Confidence gate BEFORE any coverage math (build plan §2). ──
    if (parsed.confident !== true) {
      return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-NOTCONFIDENT', reason: 'Document has no recognizable entry-form structure.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sections = coerceSections(parsed.sections)
    if (sections.length === 0) {
      return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-NOSECTIONS', reason: 'No sections returned.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Code-side validation, not trust (build plan §2 — the core guard). ──
    const validation = validateSegmentation(entryText, sections)
    if (!validation.passed) {
      console.warn('segment-entry-generic: validation failed', {
        coverageRatio: validation.coverageRatio,
        badVerbatim: validation.badVerbatim,
        sectionCount: validation.sectionCount,
      })
      const code = validation.badVerbatim.length > 0 ? 'SEGGEN-VERBATIM' : (validation.sectionCount < MIN_SECTIONS ? 'SEGGEN-TOOFEWSECTIONS' : 'SEGGEN-COVERAGE')
      return new Response(JSON.stringify({
        segmented: false,
        code,
        reason: 'Segmentation did not pass verbatim/coverage validation.',
        coverage_ratio: Math.round(validation.coverageRatio * 100) / 100,
        bad_sections: validation.badVerbatim.slice(0, 20),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Replace the direction's existing generation-1 blob row (field_key
    //    'entry', written by the upload/"Evaluate as Entry" flow) with the
    //    sectioned rows, same generation. See header note on the deliberate
    //    divergence from segment-entry-config's append-only generations.
    //    ORDER IS LOAD-BEARING (P1 validation fix, 22 Jul 2026): INSERT the
    //    sectioned rows FIRST, then delete the blob row. The original
    //    delete-first order had a data-loss window: an insert failure after a
    //    successful delete left the direction with ZERO drafts (canvas empty,
    //    evaluate-entry 400 "Generate a draft first"). Insert-first means the
    //    worst failure mode is a momentary blob+sections coexistence in the
    //    same generation, compensated below. ──
    const { data: blobRows } = await supabase
      .from('entry_drafts')
      .select('id')
      .eq('direction_id', direction_id)
      .eq('project_id', project_id)
      .eq('draft_generation', 1)
      .eq('field_key', 'entry')
    const blobIds: number[] = (blobRows ?? []).map((r: { id: number }) => r.id)

    const baseRow = {
      project_id,
      direction_id,
      org_id: project.org_id,
      created_by: user.id,
      award_show: direction.best_show,
      category: direction.best_category,
      draft_generation: 1,
      model_used: MODEL,
      tokens_used: Math.round((inputTokens + outputTokens) / sections.length),
      status: 'draft',
    }

    const rows = sections.map((s, i) => ({
      ...baseRow,
      field_key: `section_${i + 1}`,
      field_label: s.word_limit != null ? `${s.field_label} (max ${s.word_limit} words)` : s.field_label,
      word_limit: s.word_limit,
      // Unaddressed section stays EMPTY. Never store system-authored text in
      // version_a: downstream (evaluate-entry's fullEntry, the canvas) treats
      // version_a as the ENTRANT'S text, and evaluate-entry already renders an
      // empty section as '[Not written]'. (P1 validation fix, 22 Jul 2026.)
      version_a: s.body_verbatim || '',
      section_weight: null,
      sort_order: i,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('entry_drafts')
      .insert(rows)
      .select()
    if (insertError) {
      // Blob row untouched at this point — the existing draft still stands.
      console.error('segment-entry-generic: insert failed', insertError)
      return new Response(JSON.stringify({ error: 'Could not save the segmented entry. Please try again.', code: 'SEGGEN-DB-500', segmented: false }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (blobIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('entry_drafts')
        .delete()
        .in('id', blobIds)
      if (deleteError) {
        // Compensate: remove the rows we just inserted so the direction is
        // left exactly as found (blob only), then report not-segmented.
        console.error('segment-entry-generic: blob delete failed after insert, compensating', deleteError)
        const insertedIds = (inserted ?? []).map((r: { id: number }) => r.id)
        if (insertedIds.length > 0) {
          const { error: compensateError } = await supabase.from('entry_drafts').delete().in('id', insertedIds)
          if (compensateError) console.error('segment-entry-generic: COMPENSATION ALSO FAILED: direction has blob + sections coexisting in generation 1', compensateError)
        }
        return new Response(JSON.stringify({ segmented: false, code: 'SEGGEN-DB-500', reason: 'Could not replace the existing draft.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { error: usageLogError } = await supabase.from('usage_logs').insert({
      user_id: user.id,
      org_id: project.org_id,
      action: 'segment_entry_generic',
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: null,
      metadata: {
        project_id,
        direction_id,
        show_name: direction.best_show,
        section_count: sections.length,
        coverage_ratio: Math.round(validation.coverageRatio * 100) / 100,
        source_material_path: material_path,
        two_pass: docWords > SINGLE_PASS_WORD_LIMIT,
      },
    })
    // A silently-failed usage_logs insert makes the rate cap dead (the cap
    // counts usage_logs rows). Log loudly; do not fail the request over it.
    if (usageLogError) console.error('segment-entry-generic: usage_logs insert failed, rate cap not counting', usageLogError)

    return new Response(JSON.stringify({
      segmented: true,
      entry_drafts: inserted,
      section_count: sections.length,
      coverage_ratio: Math.round(validation.coverageRatio * 100) / 100,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    console.error('segment-entry-generic: unhandled error', err)
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'SEGGEN-500', segmented: false }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
