// Deploy to: app/api/invite/accept/route.ts
//
// Called by the /invite/[token] page after the user has authenticated.
// If the user already has a profile in a different org (fresh signup via trigger),
// moves them to the inviting org and deletes the auto-created empty org.
//
// Session 51: seat limit re-checked at acceptance (an invite may have been
// created before the cap existed, or several may be pending at once).
// Also: the empty-org cleanup now checks for projects before deleting (audit DM-09).
//
// 29 Aug 2026 (INVITE-PATH-REPAIR): an invitee who signs up from the link has
// already been placed in the org by the handle_new_user trigger by the time this
// route runs, so "already accepted" is the NORMAL outcome for the signup path,
// not an error. See the accepted_at branch below. Email comparisons lowercased.

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
    // 29 Aug 2026. The handle_new_user trigger has an "invited path": on signup
    // it looks up a pending unexpired invitation for the new email, inserts the
    // profile straight into the inviting org with the invited role, and stamps
    // accepted_at, all inside the signup transaction. That runs BEFORE this
    // route is ever called. So a legitimate invitee who signed up from the link
    // arrives here already accepted and already placed, and a bare 409 showed
    // them "This invite has already been used" as the final screen of a join
    // that had in fact succeeded. Observed end to end on the preview that day.
    //
    // Treat that one case as success: same person, already in the invite's org.
    // A replay by anyone else, or by someone not in that org, still 409s.
    const { data: caller } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle()

    const samePerson =
      (invitation.email ?? '').toLowerCase() === (user.email ?? '').toLowerCase()

    if (samePerson && caller?.org_id === invitation.org_id) {
      return NextResponse.json({
        ok: true,
        org_id: invitation.org_id,
        note: 'Already a member of this team',
      })
    }

    return NextResponse.json({ error: 'This invite has already been used' }, { status: 409 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }
  if ((invitation.email ?? '').toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address' }, { status: 403 })
  }

  // ── Seat limit re-check at acceptance (Session 51) ──────────────────────
  // The invite may predate the seat cap, or several invites may be pending.
  // trial_unlimited orgs are exempt; fails open if the org lookup errors.
  const { data: targetOrg } = await admin
    .from('organizations')
    .select('max_seats, trial_unlimited')
    .eq('id', invitation.org_id)
    .single()

  if (targetOrg && !targetOrg.trial_unlimited && typeof targetOrg.max_seats === 'number') {
    const { count: memberCount } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', invitation.org_id)

    if ((memberCount ?? 0) >= targetOrg.max_seats) {
      return NextResponse.json({
        error: 'This team has no open seats. Ask the account owner to contact ben@positionadvisory.com to add seats.',
      }, { status: 403 })
    }
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

    // Delete the auto-created org only if it has no members AND no projects
    // (audit DM-09: deleting an org with projects would orphan or cascade them)
    const { count: remainingMembers } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', oldOrgId)

    if (remainingMembers === 0) {
      const { count: projectCount } = await admin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', oldOrgId)

      if (projectCount === 0) {
        await admin.from('organizations').delete().eq('id', oldOrgId)
      }
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

// ── GET: validate BEFORE the click (R3 + R5) ──────────────────────────────
//
// 29 Aug 2026. The invite page used to render "You've been invited to
// Shortlist / Click below to join your team's workspace" on load without
// making a single network request (D3: 29 requests, all chunks and fonts).
// It said that to an expired invite, a used invite, a made-up token, and to
// someone signed in as the wrong person. The user found out only by clicking
// and taking a 403 whose copy named the problem and no fix (D4).
//
// This GET is the companion the page needed. RLS will not serve invitations
// to a non-member client-side, so the lookup has to happen on the service
// role here, exactly as the POST does.
//
// It also answers the R5 question: accepting MOVES the caller, because
// profiles.org_id is scalar. There is one org per user, no join table and no
// switcher. If the org they are leaving holds projects, the POST deliberately
// declines to delete it, so it survives with nobody able to reach it. The
// caller is entitled to know that before clicking, not after.
//
// Auth is required. Without it a valid token would disclose the invited
// address and the org name to anyone who came by the link.

export async function GET(req: NextRequest) {
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

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const sessionEmail = (user.email ?? '').toLowerCase()

  const { data: invitation } = await admin
    .from('invitations')
    .select('id, org_id, role, email, accepted_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ status: 'not_found', sessionEmail })
  }

  const invitedEmail = (invitation.email ?? '').toLowerCase()
  const samePerson   = invitedEmail === sessionEmail

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', invitation.org_id)
    .maybeSingle()

  const base = {
    invitedEmail,
    sessionEmail,
    orgName:   org?.name ?? 'this team',
    role:      invitation.role,
    expiresAt: invitation.expires_at,
  }

  const { data: caller } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle()

  // Mirrors the POST's accepted_at branch: the handle_new_user trigger
  // consumes the invitation at signup, so an invitee arriving here already
  // placed is a SUCCESS, not a used link.
  if (invitation.accepted_at) {
    if (samePerson && caller?.org_id === invitation.org_id) {
      return NextResponse.json({ status: 'already_member', ...base })
    }
    return NextResponse.json({ status: 'used', ...base })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ status: 'expired', ...base })
  }

  if (!samePerson) {
    return NextResponse.json({ status: 'email_mismatch', ...base })
  }

  // R5. Only a workspace holding projects is worth a warning: an empty
  // auto-created org is deleted by the POST and nothing is lost.
  let leavingOrg: { name: string; projectCount: number; memberCount: number } | null = null

  if (caller?.org_id && caller.org_id !== invitation.org_id) {
    const { count: projectCount } = await admin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', caller.org_id)

    if ((projectCount ?? 0) > 0) {
      const { data: currentOrg } = await admin
        .from('organizations')
        .select('name')
        .eq('id', caller.org_id)
        .maybeSingle()

      const { count: memberCount } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', caller.org_id)

      leavingOrg = {
        name:         currentOrg?.name ?? 'your current workspace',
        projectCount: projectCount ?? 0,
        memberCount:  memberCount ?? 0,
      }
    }
  }

  return NextResponse.json({ status: 'ok', ...base, leavingOrg })
}
