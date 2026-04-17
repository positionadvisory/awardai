// Deploy to: app/api/admin/dashboard-data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL  = 'ben@positionadvisory.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  // ── Verify caller is the super-admin ───────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Fetch all data via service role (bypasses RLS) ─────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixMonthsAgo  = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 5,
    1
  ).toISOString()

  const [
    { data: projects,      error: e1 },
    { data: directions,    error: e2 },
    { data: evaluations,   error: e3 },
    { data: monthlyUsage,  error: e4 },
    { data: profiles,      error: e5 },
    { data: usageLogs,     error: e6 },
    { data: entryDrafts,   error: e7 },
  ] = await Promise.all([
    admin
      .from('projects')
      .select('id, campaign_name, client_name, target_shows, status, created_at, user_id, org_id')
      .order('created_at', { ascending: false }),

    admin
      .from('directions')
      .select('id, project_id, best_show, best_category, win_likelihood, created_by, created_at, org_id'),

    admin
      .from('evaluations')
      .select('id, project_id, overall_score, scores, created_at, created_by, org_id'),

    admin
      .from('monthly_usage')
      .select('*')
      .gte('month', sixMonthsAgo)
      .order('month', { ascending: true }),

    admin
      .from('profiles')
      .select('id, full_name, email, role, created_at, org_id'),

    admin
      .from('usage_logs')
      .select('id, user_id, org_id, action, model, input_tokens, output_tokens, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(2000),

    admin
      .from('entry_drafts')
      .select('id, direction_id, created_by, created_at, org_id'),
  ])

  // Log any fetch errors server-side but don't fail the whole request
  const errors = [e1, e2, e3, e4, e5, e6, e7].filter(Boolean)
  if (errors.length) {
    console.error('dashboard-data fetch errors:', errors)
  }

  return NextResponse.json({
    projects:     projects     ?? [],
    directions:   directions   ?? [],
    evaluations:  evaluations  ?? [],
    monthlyUsage: monthlyUsage ?? [],
    profiles:     profiles     ?? [],
    usageLogs:    usageLogs    ?? [],
    entryDrafts:  entryDrafts  ?? [],
  })
}
