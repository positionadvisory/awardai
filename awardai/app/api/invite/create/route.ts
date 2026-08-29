// Deploy to: app/api/invite/create/route.ts
//
// Called by the team settings page when an owner/admin sends an invite.
// Creates an invitations row, emails the invitee the link, and returns the
// link so the sender can also copy it manually.
//
// Session 51: seat limit enforcement. Pro = 1 user seat (organizations.max_seats,
// default 1). Members + pending unexpired invites must stay under max_seats.
// trial_unlimited orgs are exempt. Also fixed stale fallback domain (audit A-15).
//
// 29 Aug 2026 (INVITE-PATH-REPAIR), two fixes:
//
// R1: the email is now actually sent. This route shipped with a commented-out
// "// TODO: wire up Resend/SendGrid" stub and nothing ever replaced it, so in
// the entire history of the feature no invitee was ever sent a link and zero
// invitations were accepted. Delivery uses the same raw-fetch Resend call as
// app/api/request-access/route.ts (no SDK, no new dependency). Delivery is
// best-effort by design: if Resend errors or the key is missing, the invite is
// still created and the link is still returned, so an email outage degrades to
// the old copy-link behavior instead of losing the invitation.
//
// R5b: the existing-pending-invite branch now filters on expires_at. It used to
// match on accepted_at IS NULL alone, so once an invite lapsed, re-inviting that
// address returned the SAME dead token with { ok: true } forever, with no
// self-serve way out. Lapsed rows are now replaced with a fresh token.
//
// Email comparisons are lowercased throughout. Rows are stored lowercased, but
// the member and pending-invite lookups were comparing raw input against them.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gotshortlisted.com'
const FROM_EMAIL   = 'Shortlist <hello@gotshortlisted.com>'

/** Escape anything interpolated into the HTML email. Org and inviter names are
 *  user-supplied, and this message goes to a third party. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return 'in 7 days'
  }
}

/** Best-effort transactional send. Never throws. Returns null on success,
 *  or a short reason string the caller can surface as a warning. */
async function sendInviteEmail(opts: {
  to: string
  inviterName: string
  inviterEmail: string
  orgName: string
  link: string
  expiresAt: string
}): Promise<string | null> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log('[invite/create] RESEND_API_KEY not set. Invite link not emailed:', opts.to)
    return 'Email is not configured on this environment.'
  }

  const expiry  = formatExpiry(opts.expiresAt)
  const inviter = esc(opts.inviterName)
  const org     = esc(opts.orgName)
  const to      = esc(opts.to)
  const link    = esc(opts.link)

  const subject = `${opts.inviterName} invited you to Shortlist`

  const text = [
    `${opts.inviterName} invited you to join ${opts.orgName} on Shortlist.`,
    ``,
    `Accept the invitation: ${opts.link}`,
    ``,
    `Shortlist scores award entries against each show's published judging criteria, before they are submitted.`,
    ``,
    `The invitation was sent to ${opts.to}. Sign in with that address, or create an account with it, and you will land in the team workspace.`,
    ``,
    `The link expires on ${expiry}.`,
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; color: #111827;">
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
        <strong>${inviter}</strong> invited you to join <strong>${org}</strong> on Shortlist.
      </p>
      <p style="margin: 0 0 28px;">
        <a href="${link}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 26px; border-radius: 10px;">
          Accept the invitation
        </a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563; margin: 0 0 24px;">
        Shortlist scores award entries against each show's published judging criteria, before they are submitted.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 12px;">
        The invitation was sent to <strong>${to}</strong>. Sign in with that address, or create an account with it, and you will land in the team workspace.
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 20px;">
        The link expires on ${esc(expiry)}.
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; margin: 0;">
        If the button does not work, paste this into your browser:<br />
        <span style="word-break: break-all;">${link}</span>
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       opts.to,
        reply_to: opts.inviterEmail,
        subject,
        html,
        text,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[invite/create] Resend error:', res.status, body)
      return 'The invite was created but the email could not be sent.'
    }
    return null
  } catch (err) {
    console.error('[invite/create] Resend threw:', err)
    return 'The invite was created but the email could not be sent.'
  }
}

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

  // full_name + email are selected for the invite email (R1): the message names
  // who sent it and replies go back to them.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('org_id, role, full_name, email')
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

  // Rows are stored lowercased; compare against the same shape.
  const inviteEmail = email.toLowerCase().trim()

  // ── Check: already a member? ────────────────────────────────────────────
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', inviteEmail)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This person is already a member of your team' }, { status: 409 })
  }

  // ── Check: already has a LIVE pending invite? (R5b) ─────────────────────
  // The expires_at filter is load-bearing. Without it a lapsed invite is
  // resurrected as a dead token on every retry and the address can never be
  // re-invited through the UI.
  const nowIso = new Date().toISOString()

  const { data: existingInvite } = await admin
    .from('invitations')
    .select('id, token, expires_at')
    .eq('email', inviteEmail)
    .eq('org_id', profile.org_id)
    .is('accepted_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingInvite) {
    // Re-use the live token rather than creating a duplicate, and re-send it:
    // a resend is the natural reason someone clicks Invite on the same address
    // twice, and until now it produced a link and no message.
    const link = `${APP_URL}/invite/${existingInvite.token}`

    const { data: reuseOrg } = await admin
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .single()

    const warning = await sendInviteEmail({
      to:           inviteEmail,
      inviterName:  profile.full_name || profile.email || 'A colleague',
      inviterEmail: profile.email || 'hello@gotshortlisted.com',
      orgName:      reuseOrg?.name || 'their team',
      link,
      expiresAt:    existingInvite.expires_at,
    })

    return NextResponse.json({
      ok: true,
      link,
      emailed: !warning,
      ...(warning ? { emailWarning: warning } : {}),
      note: 'Existing pending invite',
    })
  }

  // Clear any lapsed invites for this address so the unique/lookup surface stays
  // clean and the seat count is not held open by dead rows.
  await admin
    .from('invitations')
    .delete()
    .eq('email', inviteEmail)
    .eq('org_id', profile.org_id)
    .is('accepted_at', null)
    .lte('expires_at', nowIso)

  // ── Seat limit check (Session 51) ───────────────────────────────────────
  // Runs AFTER the existing-pending-invite re-use path: re-fetching a link for
  // an invite that's already counted consumes no new seat and must not 403.
  // Counts current members + pending unexpired invites against max_seats.
  // trial_unlimited orgs are exempt. Fails open if the org lookup errors
  // (consistent with the paywall philosophy).
  // `name` is selected here for the invite email: no extra round trip.
  const { data: org } = await admin
    .from('organizations')
    .select('name, max_seats, trial_unlimited')
    .eq('id', profile.org_id)
    .single()

  if (org && !org.trial_unlimited && typeof org.max_seats === 'number') {
    const { count: memberCount } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)

    const { count: pendingCount } = await admin
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())

    const seatsUsed = (memberCount ?? 0) + (pendingCount ?? 0)

    if (seatsUsed >= org.max_seats) {
      const seatWord = org.max_seats === 1 ? 'seat' : 'seats'
      return NextResponse.json({
        error: `Your plan includes ${org.max_seats} user ${seatWord}. Contact ben@positionadvisory.com to add seats to your account.`,
      }, { status: 403 })
    }
  }

  // ── Create the invitation ───────────────────────────────────────────────
  const { data: invitation, error: insertError } = await admin
    .from('invitations')
    .insert({
      org_id:     profile.org_id,
      invited_by: user.id,
      email:      inviteEmail,
      role,
    })
    .select('token, expires_at')
    .single()

  if (insertError || !invitation) {
    console.error('invite insert error:', insertError)
    return NextResponse.json({ error: 'Could not create invitation' }, { status: 500 })
  }

  const link = `${APP_URL}/invite/${invitation.token}`

  // ── Send it (R1) ────────────────────────────────────────────────────────
  // Never fails the request. The link is returned either way.
  const warning = await sendInviteEmail({
    to:           inviteEmail,
    inviterName:  profile.full_name || profile.email || 'A colleague',
    inviterEmail: profile.email || 'hello@gotshortlisted.com',
    orgName:      org?.name || 'their team',
    link,
    expiresAt:    invitation.expires_at,
  })

  return NextResponse.json({
    ok: true,
    link,
    emailed: !warning,
    ...(warning ? { emailWarning: warning } : {}),
  })
}
