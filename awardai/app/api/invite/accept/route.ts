// Deploy to: app/api/invite/accept/route.ts
//
// Called by the /invite/[token] page after the user has authenticated.
// If the user already has a profile in a different org (fresh signup via trigger),
// moves them to the inviting org and deletes the auto-created empty org.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Validate token ──────────────────────────────────────────────────────
  const { token } = await req.json().catch(() => ({}))
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: invitation, error: invError } = await admin
    .from('invitations')
    .select('id, org_id, role, email, accepted_at, expires_at')
    .eq('token', token)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: 'Invite not found or already used' }, { status: 404 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }
  if (invitation.email !== user.email) {
    return NextResponse.json({ error: 'This invite was sent to a different email address' }, { status: 403 })
  }

  // ── Check if user already has a profile ────────────────────────────────
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (existingProfile) {
    // Already in a different org (auto-created on signup). Move them over
    // and clean up the auto-created org if it's now empty.
    const oldOrgId = existingProfile.org_id

    await admin
      .from('profiles')
      .update({ org_id: invitation.org_id, role: invitation.role })
      .eq('id', user.id)

    // Delete the auto-created org if this user was its only member
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', oldOrgId)

    if (count === 0) {
      await admin.from('organizations').delete().eq('id', oldOrgId)
    }
  } else {
    // No profile yet (edge case: trigger didn't run). Create one now.
    await admin.from('profiles').insert({
      id:       user.id,
      email:    user.email,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0],
      org_id:   invitation.org_id,
      role:     invitation.role,
    })
  }

  // ── Mark invite accepted ────────────────────────────────────────────────
  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return NextResponse.json({ ok: true, org_id: invitation.org_id })
}
