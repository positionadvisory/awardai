import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SUPER_ADMIN_EMAIL = 'ben@positionadvisory.com'

export async function GET(req: NextRequest) {
  // Verify caller identity via their session token
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use anon client to verify who this is
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service-role client bypasses RLS — all orgs visible
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: projects },
    { data: directions },
    { data: evaluations },
    { data: monthlyUsage },
    { data: profiles },
    { data: usageLogs },
    { data: entryDrafts },
  ] = await Promise.all([
    serviceClient.from('projects').select('id, campaign_name, client_name, target_shows, status, created_at, user_id').order('created_at', { ascending: false }),
    serviceClient.from('directions').select('id, project_id, best_show, best_category, win_likelihood, created_by, created_at'),
    serviceClient.from('evaluations').select('id, project_id, overall_score, scores, created_at, created_by'),
    serviceClient.from('monthly_usage').select('*').gte('month', sixMonthsAgo).order('month', { ascending: true }),
    serviceClient.from('profiles').select('id, full_name, email, role, created_at'),
    serviceClient.from('usage_logs').select('id, user_id, action, model, input_tokens, output_tokens, created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(2000),
    serviceClient.from('entry_drafts').select('id, direction_id, created_by, created_at'),
  ])

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
