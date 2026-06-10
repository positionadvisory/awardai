// app/api/agency-profile/route.ts
// Agency profile writes — PATCH (contact/logo fields) + DELETE (remove profile)
// Session 50 (audit DM-16): agency_profiles is SELECT-only under RLS, so the
// client-side delete/update calls in projects-page.tsx silently no-oped — the UI
// said "removed"/"saved" while the DB row was untouched. All writes now go
// through this service-role route. The caller's org is derived from their
// profile row, NEVER from the request body (tenant isolation rule, Session 47).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// Columns the client is allowed to write. Everything else on agency_profiles
// (credentials_summary, strategic_approach, etc.) is written only by the
// extract-agency-profile edge function — do not add those here.
const WRITABLE_FIELDS = [
  'pr_contact_name',
  'pr_contact_email',
  'pr_contact_phone',
  'website_url',
  'linkedin_url',
  'x_handle',
  'instagram_handle',
  'logo_url',
] as const

// Resolves the caller to their org_id, or returns an error response.
async function resolveCallerOrg(
  req: NextRequest
): Promise<{ orgId: number } | { errorResponse: NextResponse }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = getServiceClient()
  const { data: { user }, error } = await supabase.auth.getUser(jwt)
  if (error || !user) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return { errorResponse: NextResponse.json({ error: 'No organization found' }, { status: 403 }) }
  }

  return { orgId: profile.org_id }
}

// ── PATCH /api/agency-profile — update contact / logo fields ────────────────
// Headers: Authorization: Bearer <session access token>
// Body: any subset of WRITABLE_FIELDS. Returns the updated row.
export async function PATCH(req: NextRequest) {
  try {
    const caller = await resolveCallerOrg(req)
    if ('errorResponse' in caller) return caller.errorResponse

    const body = await req.json()

    // Whitelist — ignore anything not explicitly writable
    const updates: Record<string, string | null> = {}
    for (const field of WRITABLE_FIELDS) {
      if (field in body) {
        updates[field] = body[field] || null
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No writable fields in request' }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('agency_profiles')
      .update(updates)
      .eq('org_id', caller.orgId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true, profile: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE /api/agency-profile — remove the org's profile row ───────────────
// Headers: Authorization: Bearer <session access token>
export async function DELETE(req: NextRequest) {
  try {
    const caller = await resolveCallerOrg(req)
    if ('errorResponse' in caller) return caller.errorResponse

    const supabase = getServiceClient()
    const { error } = await supabase
      .from('agency_profiles')
      .delete()
      .eq('org_id', caller.orgId)

    if (error) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
