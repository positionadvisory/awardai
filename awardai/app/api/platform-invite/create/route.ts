// Deploy to: app/api/platform-invite/create/route.ts
//
// Called by the admin dashboard to generate a sign-up invite link for a brand-new user.
// Unlike team invites (which add someone to an existing org), platform invites allow
// the recipient to create their own fresh account and organisation on Shortlist.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gotshortlisted.com'
const ADMIN_EMAIL   = 'ben@positionadvisory.com'

export async function POST(req: NextRequest) {
  // ── Auth: must be ben ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const { email } = body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Check: already a Supabase user? ──────────────────────────────────────
  // (Can't prevent them signing up again, but we can note it in the response)

  // ── Check for existing unused platform invite for this email ─────────────
  const { data: existing } = await admin
    .from('platform_invitations')
    .select('token, expires_at')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    // Re-use the existing token rather than creating a duplicate
    const link = `${APP_URL}/signup?token=${existing.token}&email=${encodeURIComponent(email)}`
    return NextResponse.json({ ok: true, link, note: 'Existing valid invite reused' })
  }

  // ── Create platform invite ────────────────────────────────────────────────
  const { data: invite, error: insertError } = await admin
    .from('platform_invitations')
    .insert({
      email: email.toLowerCase().trim(),
      invited_by: user.id,
    })
    .select('token')
    .single()

  if (insertError || !invite) {
    console.error('platform_invite insert error:', insertError)
    return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })
  }

  const link = `${APP_URL}/signup?token=${invite.token}&email=${encodeURIComponent(email)}`
  return NextResponse.json({ ok: true, link })
}
