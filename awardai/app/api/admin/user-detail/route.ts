import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Deploy to: awardai/app/api/admin/user-detail/route.ts
//
// Returns full detail for a single user: profile, projects, directions,
// drafts, evaluations, usage logs. Uses service role so it works across
// all orgs — required because the requesting user (ben) may be in a
// different org than the target user.
//
// Gated to ben@positionadvisory.com only.

const SUPER_ADMIN_EMAIL = 'ben@positionadvisory.com'

export async function GET(req: NextRequest) {
  // Verify caller identity
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !user || user.email !== SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const targetUserId = req.nextUrl.searchParams.get('userId')
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // Service-role client — bypasses RLS, can see any org's data
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch profile first to confirm user exists
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('id, full_name, email, role, org_id, created_at')
    .eq('id', targetUserId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const orgId = profile.org_id

  // Fetch all activity for this user in parallel, scoped to their org
  const [
    { data: projects },
    { data: directions },
    { data: drafts },
    { data: evaluations },
    { data: logs },
  ] = await Promise.all([
    serviceClient
      .from('projects')
      .select('id, campaign_name, client_name, target_shows, status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    serviceClient
      .from('directions')
      .select('id, project_id, created_at')
      .eq('org_id', orgId),
    serviceClient
      .from('entry_drafts')
      .select('id, direction_id, created_at')
      .eq('org_id', orgId),
    serviceClient
      .from('evaluations')
      .select('id, project_id, overall_score, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    serviceClient
      .from('usage_logs')
      .select('id, action, model, input_tokens, output_tokens, created_at')
      .eq('user_id', targetUserId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return NextResponse.json({
    profile,
    projects:    projects    ?? [],
    directions:  directions  ?? [],
    drafts:      drafts      ?? [],
    evaluations: evaluations ?? [],
    logs:        logs        ?? [],
  })
}
