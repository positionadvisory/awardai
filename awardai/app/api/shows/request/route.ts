// Deploy to: app/api/shows/request/route.ts
//
// Called when a user requests an award show not yet in the system.
// Inserts a show_requests row and sends a notification email to ben@positionadvisory.com
// Email delivery uses Resend — set RESEND_API_KEY in env to activate.
// If RESEND_API_KEY is missing, the request is still saved (soft failure).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const RESEND_KEY    = process.env.RESEND_API_KEY ?? ''
const NOTIFY_EMAIL  = 'ben@positionadvisory.com'

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

  // ── Parse body ───────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const { show_name, show_url, market, entry_kit_url, project_id } = body

  if (!show_name || typeof show_name !== 'string' || !show_name.trim()) {
    return NextResponse.json({ error: 'show_name is required' }, { status: 400 })
  }

  // ── Get org_id ───────────────────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: membership } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  const org_id = membership?.org_id ?? null

  // ── Insert show_request ──────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await admin
    .from('show_requests')
    .insert({
      show_name:     show_name.trim(),
      show_url:      show_url?.trim() || null,
      market:        market?.trim() || null,
      entry_kit_url: entry_kit_url?.trim() || null,
      requested_by:  user.id,
      org_id,
      project_id:    project_id ?? null,
      status:        'pending',
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('show_requests insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save request' }, { status: 500 })
  }

  // ── Send email notification ─────────────────────────────────────────────
  let emailSent = false
  if (RESEND_KEY) {
    try {
      const emailBody = [
        `New award show request`,
        ``,
        `Show name: ${show_name.trim()}`,
        show_url       ? `Show URL: ${show_url.trim()}`             : `Show URL: (not provided)`,
        market         ? `Market: ${market.trim()}`                 : `Market: (not provided)`,
        entry_kit_url  ? `Entry kit URL: ${entry_kit_url.trim()}`   : `Entry kit: (not provided — flag for follow-up)`,
        ``,
        `Requested by: ${user.email ?? user.id}`,
        `Request ID: ${inserted.id}`,
      ].join('\n')

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_KEY}`,
        },
        body: JSON.stringify({
          from: 'Shortlist <noreply@shortlist.app>',
          to:   [NOTIFY_EMAIL],
          subject: `New show request: ${show_name.trim()}`,
          text: emailBody,
        }),
      })
      emailSent = res.ok
      if (!res.ok) {
        const errText = await res.text()
        console.error('Resend error:', errText)
      }
    } catch (e) {
      console.error('Email send failed (non-fatal):', e)
    }
  }

  return NextResponse.json({
    success: true,
    request_id: inserted.id,
    email_sent: emailSent,
    no_kit: !entry_kit_url,
  })
}
