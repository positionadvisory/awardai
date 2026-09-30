import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { brief, messages } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: campaigns } = await supabase.rpc('search_campaigns', {
    query_text: brief,
    show_filter: null,
    year_from: null,
    year_to: null,
    result_limit: 6
  })

  const context = campaigns?.map((c: any) =>
    `CAMPAIGN: ${c.campaign_name}
CLIENT: ${c.client} | AGENCY: ${c.agency} | YEAR: ${c.year}
WHAT: ${c.what}
INSIGHT: ${c.insight}
WIN FACTOR: ${c.win_factor}
RESULTS: ${c.results}`
  ).join('\n\n---\n\n') ?? ''

  const systemPrompt = `You are an expert advertising award entry writer with deep knowledge of what wins at Cannes Lions, D&AD, Effies, and other major shows. You help agencies craft compelling, specific, and persuasive award submissions.

Draw on these examples of winning campaigns as inspiration and reference:

${context}

When writing entries:
- Use ONLY the information the user has provided. Do not invent statistics, results, reach figures, or outcomes that were not given to you.
- If critical information is missing (e.g. no results were provided), write around it or flag it with [ADD YOUR RESULTS HERE] as a placeholder rather than making something up.
- Be specific with data the user DID provide — vague claims do not win
- If critical supporting statistics are missing, suggest publicly available data with a source URL for checking
- Explain the idea clearly before explaining the execution
- Match the tone and ambition of the award show being entered
- Keep sentences punchy`

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      stream: false,
      system: systemPrompt,
      messages: messages ?? [{ role: 'user', content: brief }]
    })
  })

  const data = await claudeRes.json()
  const text = data.content?.[0]?.text ?? JSON.stringify(data)

  return new Response(JSON.stringify({ text }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})