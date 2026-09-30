// clean-campaign-content — v1 (7 April 2026)
//
// Passes campaign `what` and `win_factor` fields through Claude Haiku in batches
// to strip entry form boilerplate and produce polished, concise summaries.
//
// Must be run BEFORE re-generating embeddings so the cleaned text gets embedded.
//
// POST { offset?: number, batchSize?: number }
//   offset    — campaign row offset to process (client increments after each call)
//   batchSize — campaigns per call (default 10; 5 campaigns batched per Claude call)
// Returns { processed, total, remaining, done, errors? }
//
// SESSION 47 AUDIT FIX S6: this function is now ADMIN-ONLY (was completely
// unauthenticated — anyone with the function URL could run Claude batch jobs
// and overwrite the shared campaigns KB). Auth: valid JWT + ben@ email check,
// same pattern as research-show.
//
// Browser loop (run in a logged-in gotshortlisted.com tab as ben@ — uses your
// SESSION token now, not the anon key):
//   const { data: { session } } = await window.supabase?.auth.getSession?.() ?? {}
//   // or grab the access token from localStorage 'sb-<ref>-auth-token'
//   let offset = 0, total = null
//   while (true) {
//     const r = await fetch('https://<proj>.supabase.co/functions/v1/clean-campaign-content',
//       { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer <ACCESS_TOKEN>','apikey':'<anon_key>'},
//         body: JSON.stringify({ offset, batchSize: 10 }) }).then(r=>r.json())
//     console.log(r)
//     if (r.done || r.error) break
//     offset += r.processed
//     total = r.total
//   }

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

// ─── Claude Haiku call ───────────────────────────────────────────────────────

type CleanResult = { what: string | null; win_factor: string | null }

async function cleanBatch(
  campaigns: Array<{ id: number; what: string | null; win_factor: string | null }>,
  logCtx: { supabase: any; userId: string | null }
): Promise<CleanResult[]> {
  const prompt = campaigns.map((c, i) =>
    `Campaign ${i + 1}:
IDEA: ${c.what || '(empty)'}
WIN FACTOR: ${c.win_factor || '(empty)'}`
  ).join('\n\n')

  const system = `You are cleaning award entry data for a creative advertising database.

For each campaign, rewrite the IDEA and WIN FACTOR fields:
- Remove any entry form labels, prompts, or headers (e.g. "The Idea:", "Describe in 200 words", "1.", "Background:", "Results:")
- Remove any boilerplate, repetition, or meta-commentary about the entry
- Write clean, plain prose that describes what the campaign actually DID and why it worked
- IDEA should be 25-40 words — a punchy description of the campaign concept and execution
- WIN FACTOR should be 20-35 words — the specific strategic or executional reason it won
- If a field is genuinely empty or unusable, return null
- Do NOT invent information that isn't in the original text
- Do NOT include the campaign name or award show in the output

Return a JSON array (one object per campaign, same order as input):
[{ "what": "cleaned idea text or null", "win_factor": "cleaned win factor text or null" }]

Return ONLY the JSON array. No markdown, no explanation.`

  const CLEAN_MODEL = 'claude-haiku-4-5-20251001'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLEAN_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const rawText: string = (Array.isArray(data?.content) ? data.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')

  try {
    await logCtx.supabase.from('usage_logs').insert({
      user_id: logCtx.userId,
      org_id: null,
      action: 'clean_campaign_content',
      model: CLEAN_MODEL,
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      metadata: { campaign_ids: campaigns.map(c => c.id) },
    })
  } catch (logErr) {
    console.error('clean-campaign-content: usage log failed', logErr)
  }

  // Robust JSON extraction
  const firstBracket = rawText.indexOf('[')
  const lastBracket = rawText.lastIndexOf(']')
  if (firstBracket === -1 || lastBracket === -1) {
    throw new Error(`No JSON array in Claude response: ${rawText.slice(0, 200)}`)
  }
  const parsed = JSON.parse(rawText.slice(firstBracket, lastBracket + 1))
  if (!Array.isArray(parsed)) throw new Error('Claude response is not an array')
  return parsed
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    // ── Admin gate (audit fix S6) — maintenance job, ben@ only ──────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user || user.email !== 'ben@positionadvisory.com') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    // ── End admin gate ────────────────────────────────────────────────────────

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(body.batchSize || 10, 20) // cap at 20
    const offset = body.offset || 0

    // Get total count
    const { count: total } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })

    if (!total) {
      return new Response(JSON.stringify({ done: true, processed: 0, total: 0, remaining: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (offset >= total) {
      return new Response(JSON.stringify({ done: true, processed: 0, total, remaining: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Fetch this batch
    const { data: campaigns, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, what, win_factor')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (fetchError) throw fetchError
    if (!campaigns?.length) {
      return new Response(JSON.stringify({ done: true, processed: 0, total, remaining: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Process in sub-batches of 5 per Claude call
    const SUB_BATCH = 5
    let processed = 0
    const errors: Array<{ id: number; error: string }> = []

    for (let i = 0; i < campaigns.length; i += SUB_BATCH) {
      const subBatch = campaigns.slice(i, i + SUB_BATCH)
      try {
        const cleaned = await cleanBatch(subBatch, { supabase, userId: user.id })

        for (let j = 0; j < subBatch.length; j++) {
          const campaign = subBatch[j]
          const cleanedItem = cleaned[j]
          if (!cleanedItem) {
            errors.push({ id: campaign.id, error: 'No cleaned result returned' })
            continue
          }

          const { error: updateError } = await supabase
            .from('campaigns')
            .update({
              what: cleanedItem.what ?? campaign.what,
              win_factor: cleanedItem.win_factor ?? campaign.win_factor,
            })
            .eq('id', campaign.id)

          if (updateError) {
            errors.push({ id: campaign.id, error: updateError.message })
          } else {
            processed++
          }
        }
      } catch (subErr) {
        for (const c of subBatch) {
          errors.push({ id: c.id, error: subErr instanceof Error ? subErr.message : String(subErr) })
        }
      }
    }

    const remaining = Math.max(0, total - offset - campaigns.length)

    return new Response(JSON.stringify({
      done: remaining === 0,
      processed,
      total,
      remaining,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})