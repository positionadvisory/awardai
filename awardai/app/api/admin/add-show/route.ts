import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Deploy to: app/api/admin/add-show/route.ts
//
// POST — gated to ben@positionadvisory.com
//
// Takes a confirmed ShowResearch object (from research-show edge function,
// possibly edited by Ben in the admin UI), inserts into dynamic_shows,
// upserts into show_profiles for jury intelligence, and marks the originating
// show_requests row as 'added'.
//
// Body:
//   {
//     show_request_id?: number       — source request row (optional)
//     show_name:        string
//     show_url?:        string
//     market?:          string
//     deadline_date?:   string        — YYYY-MM-DD
//     deadline_label?:  string
//     entry_fee_range?: string
//     categories?:      string[]
//     description?:     string
//     industry?:        string        — default 'marketing'
//     judging_philosophy?:   string
//     scoring_emphasis?:     string
//     language_guidance?:    string
//     common_mistakes?:      string
//     jury_composition_notes?: string
//   }
//
// Response: { success: true, dynamic_show_id: number }

const ADMIN_EMAIL  = 'ben@positionadvisory.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  // ── Auth — admin only ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt)
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const body = await req.json()
  const {
    show_request_id,
    show_name,
    show_url,
    market,
    deadline_date,
    deadline_label,
    entry_fee_range,
    categories,
    description,
    industry,
    judging_philosophy,
    scoring_emphasis,
    language_guidance,
    common_mistakes,
    jury_composition_notes,
  } = body

  if (!show_name?.trim()) {
    return NextResponse.json({ error: 'show_name is required' }, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Insert into dynamic_shows ──────────────────────────────────────────────
  const { data: newShow, error: showError } = await admin
    .from('dynamic_shows')
    .upsert(
      {
        show_name:             show_name.trim(),
        show_url:              show_url?.trim()         || null,
        market:                market?.trim()            || null,
        deadline_date:         deadline_date             || null,
        deadline_label:        deadline_label?.trim()   || null,
        entry_fee_range:       entry_fee_range?.trim()  || null,
        categories:            Array.isArray(categories) ? categories.filter(Boolean) : [],
        description:           description?.trim()       || null,
        industry:              industry?.trim()          || 'marketing',
        judging_philosophy:    judging_philosophy?.trim()    || null,
        scoring_emphasis:      scoring_emphasis?.trim()      || null,
        language_guidance:     language_guidance?.trim()     || null,
        common_mistakes:       common_mistakes?.trim()        || null,
        jury_composition_notes: jury_composition_notes?.trim() || null,
        status:                'active',
        source_request_id:     show_request_id || null,
        added_by:              user.id,
      },
      { onConflict: 'show_name' }
    )
    .select('id')
    .single()

  if (showError || !newShow) {
    console.error('[add-show] dynamic_shows insert error:', showError?.message)
    return NextResponse.json({ error: 'Failed to add show', detail: showError?.message }, { status: 500 })
  }

  // ── Upsert show_profiles for jury intelligence ─────────────────────────────
  // Insert a show-level (category_pattern = null) row so evaluate-entry and
  // generate-directions can pull jury intelligence for this show.
  if (judging_philosophy || scoring_emphasis || language_guidance || common_mistakes || jury_composition_notes) {
    const { error: profileError } = await admin
      .from('show_profiles')
      .upsert(
        {
          show_name:             show_name.trim(),
          category_pattern:      null,       // show-level default
          judging_philosophy:    judging_philosophy?.trim()    || null,
          scoring_emphasis:      scoring_emphasis?.trim()      || null,
          language_guidance:     language_guidance?.trim()     || null,
          common_mistakes:       common_mistakes?.trim()        || null,
          jury_composition_notes: jury_composition_notes?.trim() || null,
          last_updated:          new Date().toISOString(),
        },
        { onConflict: 'show_name,category_pattern' }
      )

    if (profileError) {
      // Non-fatal — show is added, jury intelligence just won't be available
      console.warn('[add-show] show_profiles upsert error:', profileError.message)
    }
  }

  // ── Mark show_request as 'added' ───────────────────────────────────────────
  if (show_request_id) {
    const { error: reqUpdateError } = await admin
      .from('show_requests')
      .update({ status: 'added' })
      .eq('id', show_request_id)

    if (reqUpdateError) {
      console.warn('[add-show] show_request status update error:', reqUpdateError.message)
    }
  }

  return NextResponse.json({ success: true, dynamic_show_id: newShow.id })
}
