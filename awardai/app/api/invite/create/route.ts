// Deploy to: app/api/invite/create/route.ts
//
// Called by the team settings page when an owner/admin sends an invite.
// Creates an invitations row and returns the invite link.
// Email delivery is a stub — swap in Resend/SendGrid when ready.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://awardai-opal.vercel.app'

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

  // ── Verify caller is owner/admin of an org ──────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }
  if (!['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 })
  }

  // ── Parse + validate body ───────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const { email, role = 'member' } = body ?? {}

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // ── Check: already a member? ────────────────────────────────────────────
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This person is already a member of your team' }, { status: 409 })
  }

  // ── Check: already has a pending invite? ────────────────────────────────
  const { data: existingInvite } = await admin
    .from('invitations')
    .select('id, expires_at')
    .eq('email', email)
    .eq('org_id', profile.org_id)
    .is('accepted_at', null)
    .maybeSingle()

  if (existingInvite) {
    // Re-use existing token rather than creating a duplicate
    const { data: inv } = await admin
      .from('invitations')
      .select('token')
      .eq('id', existingInvite.id)
      .single()

    const link = `${APP_URL}/invite/${inv?.token}`
    return NextResponse.json({ ok: true, link, note: 'Existing pending invite' })
  }

  // ── Create the invitation ───────────────────────────────────────────────
  const { data: invitation, error: insertError } = await admin
    .from('invitations')
    .insert({
      org_id:     profile.org_id,
      invited_by: user.id,
      email:      email.toLowerCase().trim(),
      role,
    })
    .select('token')
    .single()

  if (insertError || !invitation) {
    console.error('invite insert error:', insertError)
    return NextResponse.json({ error: 'Could not create invitation' }, { status: 500 })
  }

  const link = `${APP_URL}/invite/${invitation.token}`

  // ── Email stub ───────────────────────────────────────────────────────────
  // TODO: wire up Resend/SendGrid here when email is configured.
  // Example with Resend:
  //
  // const { Resend } = await import('resend')
  // const resend = new Resend(process.env.RESEND_API_KEY)
  // await resend.emails.send({
  //   from: 'AwardAI <hello@yourdomain.com>',
  //   to: email,
  //   subject: `You've been invited to join ${profile.org_name} on AwardAI`,
  //   html: `<p>Click <a href="${link}">here</a> to accept your invitation.</p>`,
  // })

  return NextResponse.json({ ok: true, link })
}
