// Deploy to: app/api/indie/read/[token]/route.ts
//
// GET /api/indie/read/[token] -- serve one banded read.
//
// SERVICE-ROLE ROUTE KEYED ON THE TOKEN, never an anon-readable RLS policy on a
// token column. That is not a style preference. platform_invitations once had
// CREATE POLICY ... USING (true) for anon and it was deliberately dropped in
// audit-critical-security-migration.sql, because it exposed every token and
// every invitee email to anyone holding the anon key. indie_reads has RLS on
// with zero policies and an explicit REVOKE for exactly that reason, so this
// route is the only way in.
//
// The payload and its explicit column allowlist moved to lib/indie-read-view.ts
// in T7b, unchanged, so the server-rendered page at /indie/r/[token] can build
// the same body without an HTTP hop it cannot authenticate on a protected
// preview. This route is now a thin wrapper over that one function, which is
// what keeps the two surfaces from ever returning different fields.

import { NextRequest, NextResponse } from 'next/server'
import { loadIndieRead } from '@/lib/indie-read-view'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { httpStatus, body } = await loadIndieRead(params.token)
    return NextResponse.json(body, { status: httpStatus })
  } catch (err) {
    console.error('[indie/read/token] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
