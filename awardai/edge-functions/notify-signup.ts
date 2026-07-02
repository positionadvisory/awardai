// notify-signup — v1 (2 Jul 2026, S102)
//
// Fired by public.notify_new_signup() (AFTER INSERT ON public.profiles, via
// pg_net) — see migrations/session-102-signup-notification-migration.sql.
// Sends Ben a plain-text email via Resend for every new signup, self-serve or
// invited (profiles has exactly one INSERT per new user; invite acceptance
// only UPDATEs an existing row, so this never double-fires).
//
// Auth: Verify JWT must be OFF on this function in the Supabase Dashboard —
// this call has no user JWT, it's server-to-server from Postgres. In place of
// JWT verification, this function checks a shared secret on the
// x-webhook-secret header against the NOTIFY_SIGNUP_SECRET env var (same
// value stored in Vault as notify_signup_shared_secret — see
// 25 & Beyond/Private/notify-signup-secret.md, never committed here).
//
// Hard rule: this must never be able to block or fail the signup that fired
// it. pg_net already decouples the HTTP call from the insert transaction, but
// this function is also fully wrapped — every code path returns 200 and every
// failure is logged only, never thrown back to the caller.
//
// Deploy to: Supabase Dashboard -> Edge Functions -> notify-signup (paste
// whole file). Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (both auto-injected by Supabase), RESEND_API_KEY (new — not yet set for any
// edge function; add it), NOTIFY_SIGNUP_SECRET (new — see Private note above).

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const WEBHOOK_SECRET = Deno.env.get('NOTIFY_SIGNUP_SECRET')

const NOTIFY_EMAILS = ['ben@positionadvisory.com', 'bencondit@gmail.com']
const FROM_EMAIL    = 'Shortlist <hello@gotshortlisted.com>'

type ProfileRecord = {
  id: string
  email: string
  full_name: string | null
  org_id: number | null
  created_at: string
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response('OK', { status: 200 })
    }

    // ── Shared-secret check (no user JWT on a DB webhook call) ────────────
    if (!WEBHOOK_SECRET) {
      console.error('[notify-signup] NOTIFY_SIGNUP_SECRET not configured — refusing to process')
      return new Response('OK', { status: 200 })
    }
    const provided = req.headers.get('x-webhook-secret')
    if (provided !== WEBHOOK_SECRET) {
      console.error('[notify-signup] bad or missing webhook secret')
      return new Response('OK', { status: 200 })
    }

    const payload = await req.json().catch(() => null)
    const row = payload?.record as ProfileRecord | undefined

    if (!row?.id || !row?.email) {
      console.error('[notify-signup] malformed payload:', JSON.stringify(payload))
      return new Response('OK', { status: 200 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // ── Org name + plan (best effort, never blocks the email) ─────────────
    let orgName = '(unknown org)'
    let plan = '(unknown plan)'
    if (row.org_id != null) {
      const { data: org, error } = await admin
        .from('organizations')
        .select('name, plan')
        .eq('id', row.org_id)
        .maybeSingle()
      if (error) console.error('[notify-signup] org lookup error:', error)
      if (org) {
        orgName = org.name ?? orgName
        plan = org.plan ?? plan
      }
    }

    // ── Running total user count (best effort) ─────────────────────────────
    let totalUsers: number | null = null
    const { count, error: countError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
    if (countError) console.error('[notify-signup] count error:', countError)
    else totalUsers = count ?? null

    const subject = `New Shortlist signup: ${row.email}`
    const text = [
      'New signup on Shortlist.',
      '',
      `Email: ${row.email}`,
      `Name: ${row.full_name ?? '(not provided)'}`,
      `Org: ${orgName}`,
      `Plan: ${plan}`,
      `Time: ${row.created_at ?? new Date().toISOString()}`,
      `Total users: ${totalUsers ?? '(unknown)'}`,
    ].join('\n')

    if (!RESEND_API_KEY) {
      console.error('[notify-signup] RESEND_API_KEY not set — logging only:', { email: row.email, orgName, plan })
      return new Response('OK', { status: 200 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: NOTIFY_EMAILS,
        subject,
        text,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[notify-signup] Resend error:', res.status, body)
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[notify-signup] unexpected error:', err)
    return new Response('OK', { status: 200 })
  }
})
