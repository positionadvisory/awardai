// Deploy to: app/api/admin/trial/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin allowlist. Ben's Shortlist login may be either of these, so include
// both: a login-email mismatch was 403'ing every toggle. Add admins here.
// Compared lowercase against user.email.
const ADMIN_EMAILS = ['ben@positionadvisory.com', 'bencondit@gmail.com']
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  // ── Verify caller is the admin ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const { org_id, trial_unlimited } = body ?? {}
  // Admin dashboard may serialise the bigint org id as a string; coerce before
  // the type guard so a string id no longer 400s and silently reverts the UI.
  const orgId = Number(org_id)

  if (!Number.isInteger(orgId) || typeof trial_unlimited !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // ── Update via service role ─────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await admin
    .from('organizations')
    .update({ trial_unlimited })
    .eq('id', orgId)

  if (error) {
    console.error('trial toggle error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, org_id: orgId, trial_unlimited })
}
