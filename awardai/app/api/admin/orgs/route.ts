// Deploy to: app/api/admin/orgs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL     = 'ben@positionadvisory.com'
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  // ── Verify caller is the admin ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Fetch org overview via service role ─────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data, error } = await admin
    .from('admin_org_overview')
    .select('*')

  if (error) {
    console.error('admin_org_overview error:', error)
    return NextResponse.json({ error: 'Failed to load orgs' }, { status: 500 })
  }

  return NextResponse.json({ orgs: data ?? [] })
}
