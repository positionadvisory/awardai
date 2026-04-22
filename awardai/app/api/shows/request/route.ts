import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Deploy to: awardai/app/api/shows/request/route.ts
//
// Receives a show request from the project workspace.
// (1) Persists to show_requests table (service role) so the admin page can action it.
// (2) Emails ben@positionadvisory.com via Resend.
//
// Auth: requires a valid Supabase user session (Authorization: Bearer <token>)
// Required env var: RESEND_API_KEY (email only — DB write succeeds without it)

const NOTIFY_EMAIL   = 'ben@positionadvisory.com'
const FROM_EMAIL     = 'Shortlist <hello@gotshortlisted.com>'
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY       = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()

    if (!jwt) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anonClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const { show_name, show_url, market, entry_kit_url, project_id } = await request.json()

    if (!show_name?.trim()) {
      return NextResponse.json({ error: 'show_name is required' }, { status: 400 })
    }

    // ── Get org_id for the requesting user ───────────────────────────────────
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: profile } = await adminClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    // ── Persist to show_requests ─────────────────────────────────────────────
    const { error: insertError } = await adminClient
      .from('show_requests')
      .insert({
        show_name:    show_name.trim(),
        show_url:     show_url?.trim()       || null,
        market:       market?.trim()         || null,
        entry_kit_url: entry_kit_url?.trim() || null,
        project_id:   project_id             || null,
        requested_by: user.id,
        org_id:       profile?.org_id        || null,
        status:       'pending',
      })

    if (insertError) {
      // Log but don't fail — email still goes out
      console.error('[shows/request] Failed to persist show_request:', insertError.message)
    }

    // ── Build email ──────────────────────────────────────────────────────────
    const subject = `Show request: ${show_name.trim()}`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px;">
        <h2 style="color: #111827; margin-bottom: 4px;">New show request</h2>
        <p style="color: #6b7280; font-size: 14px; margin-top: 0;">via Shortlist project workspace</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 100px;">Show</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${show_name.trim()}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Requested by</td>
            <td style="padding: 6px 0; font-size: 14px;">
              <a href="mailto:${user.email}" style="color: #166534;">${user.email}</a>
            </td>
          </tr>
          ${market ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Market</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px;">${market}</td>
          </tr>
          ` : ''}
          ${show_url ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Show website</td>
            <td style="padding: 6px 0; font-size: 14px;">
              <a href="${show_url}" style="color: #166534;">${show_url}</a>
            </td>
          </tr>
          ` : ''}
          ${entry_kit_url ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Entry kit</td>
            <td style="padding: 6px 0; font-size: 14px;">
              <a href="${entry_kit_url}" style="color: #166534;">${entry_kit_url}</a>
            </td>
          </tr>
          ` : ''}
          ${project_id ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Project ID</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px; font-family: monospace;">${project_id}</td>
          </tr>
          ` : ''}
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Go to <a href="https://gotshortlisted.com/admin" style="color: #166534;">Admin</a> to research and add this show.
          Reply to respond directly to ${user.email}.
        </p>
      </div>
    `

    // ── Send via Resend ──────────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY

    if (!resendKey) {
      console.log('[shows/request] RESEND_API_KEY not set — persisted to DB only:', {
        show_name, show_url, market, entry_kit_url, project_id, user: user.email,
      })
      return NextResponse.json({ success: true })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       NOTIFY_EMAIL,
        reply_to: user.email,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[shows/request] Resend error:', res.status, body)
      // Don't fail — DB record already created
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[shows/request] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
