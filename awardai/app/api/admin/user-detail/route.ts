// Deploy to: app/api/admin/user-detail/route.ts
//
// GET /api/admin/user-detail?userId=<uuid>
//
// Returns full activity detail for a single user across any org.
// Gated to ben@positionadvisory.com only (server-side check).
// Uses service role to bypass RLS.
//
// Response shape:
//   { profile, projects, directions, drafts, evaluations, logs }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL  = 'ben@positionadvisory.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  // ── Auth check — must be the super-admin ──────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Target user ID ────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const targetUserId = searchParams.get('userId')
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // ── Fetch all data via service role ───────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const [
    { data: profileRows, error: e1 },
    { data: projects,    error: e2 },
    { data: directions,  error: e3 },
    { data: drafts,      error: e4 },
    { data: evaluations, error: e5 },
    { data: logs,        error: e6 },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .eq('id', targetUserId)
      .limit(1),

    admin
      .from('projects')
      .select('id, campaign_name, client_name, target_shows, status, created_at')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false }),

    admin
      .from('directions')
      .select('id, project_id, created_at')
      .eq('created_by', targetUserId)
      .order('created_at', { ascending: false }),

    admin
      .from('entry_drafts')
      .select('id, direction_id, created_at')
      .eq('created_by', targetUserId)
      .order('created_at', { ascending: false }),

    admin
      .from('evaluations')
      .select('id, project_id, overall_score, created_at')
      .eq('created_by', targetUserId)
      .order('created_at', { ascending: false }),

    admin
      .from('usage_logs')
      .select('id, action, model, input_tokens, output_tokens, created_at')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const errors = [e1, e2, e3, e4, e5, e6].filter(Boolean)
  if (errors.length) {
    console.error('[user-detail] DB errors:', errors)
  }

  const profile = profileRows?.[0] ?? null

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    profile,
    projects:    projects    ?? [],
    directions:  directions  ?? [],
    drafts:      drafts      ?? [],
    evaluations: evaluations ?? [],
    logs:        logs        ?? [],
  })
}
