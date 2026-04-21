import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Deploy to: awardai/app/api/shows/request/route.ts
//
// Receives a show request from the project workspace and emails
// ben@positionadvisory.com via the Resend API.
//
// Auth: requires a valid Supabase user session (Authorization: Bearer <token>)
// Required env var: RESEND_API_KEY
//
// If RESEND_API_KEY is not set, the request is logged server-side only
// and the endpoint still returns success so the UI doesn't break.

const NOTIFY_EMAIL = 'ben@positionadvisory.com'
const FROM_EMAIL   = 'Shortlist <hello@gotshortlisted.com>'

export async function POST(request: Request) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()

    if (!jwt) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const { show_name, show_url, market, entry_kit_url, project_id } = await request.json()

    if (!show_name?.trim()) {
      return NextResponse.json({ error: 'show_name is required' }, { status: 400 })
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
        <p style="color: #9ca3af; font-size: 12px;">
          Reply to respond to ${user.email}.
        </p>
      </div>
    `

    // ── Send via Resend ──────────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY

    if (!resendKey) {
      // Log for manual follow-up — don't fail the request
      console.log('[shows/request] RESEND_API_KEY not set. Show request:', {
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
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[shows/request] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
