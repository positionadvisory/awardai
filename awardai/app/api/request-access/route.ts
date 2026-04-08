import { NextResponse } from 'next/server'

// Deploy to: awardai/app/api/request-access/route.ts
//
// Receives an access request from the login page and emails
// ben@positionadvisory.com via the Resend API.
//
// Required env var: RESEND_API_KEY
// (Set in Vercel → Settings → Environment Variables)
//
// If RESEND_API_KEY is not set, the request is logged server-side only
// and the endpoint still returns success so the UI doesn't break.

const NOTIFY_EMAIL = 'ben@positionadvisory.com'
const FROM_EMAIL   = 'Shortlist <hello@gotshortlisted.com>'

export async function POST(request: Request) {
  try {
    const { name, email, agency, note } = await request.json()

    // Basic validation
    if (!name || !email || !agency) {
      return NextResponse.json(
        { error: 'name, email, and agency are required' },
        { status: 400 }
      )
    }

    const subject = `Access request: ${name} from ${agency}`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px;">
        <h2 style="color: #111827; margin-bottom: 4px;">New access request</h2>
        <p style="color: #6b7280; font-size: 14px; margin-top: 0;">via gotshortlisted.com</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 80px;">Name</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Email</td>
            <td style="padding: 6px 0; font-size: 14px;">
              <a href="mailto:${email}" style="color: #166534;">${email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Agency</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px;">${agency}</td>
          </tr>
          ${note ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Note</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px;">${note}</td>
          </tr>
          ` : ''}
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Reply directly to this email to respond to ${name}.
        </p>
      </div>
    `

    const resendKey = process.env.RESEND_API_KEY

    if (!resendKey) {
      // Log for manual follow-up — don't fail the request
      console.log('[request-access] RESEND_API_KEY not set. Request details:', {
        name, email, agency, note,
      })
      return NextResponse.json({ ok: true })
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
        reply_to: email,        // Reply goes directly to the requester
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[request-access] Resend error:', res.status, body)
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[request-access] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
