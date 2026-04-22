import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Deploy to: app/api/admin/show-requests/route.ts
//
// GET  — returns all show_requests rows, newest first
// PATCH — updates status on a single row (e.g. 'declined')
//
// Gated to ben@positionadvisory.com. Uses service role to bypass RLS.

const ADMIN_EMAIL  = 'ben@positionadvisory.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getAdminUser(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return null

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await anonClient.auth.getUser(jwt)
  if (error || !user || user.email !== ADMIN_EMAIL) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: requests, error } = await admin
    .from('show_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[show-requests] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }

  return NextResponse.json({ requests: requests ?? [] })
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  const validStatuses = ['pending', 'researched', 'added', 'declined']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const { error } = await admin
    .from('show_requests')
    .update({ status })
    .eq('id', id)

  if (error) {
    console.error('[show-requests] PATCH error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
