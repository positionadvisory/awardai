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

// Resolves the caller to their org_id + identity, or returns an error response.
async function resolveCallerOrg(
  req: NextRequest
): Promise<{ orgId: number; callerId: string; callerEmail: string | null } | { errorResponse: NextResponse }> {
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

  return { orgId: profile.org_id, callerId: user.id, callerEmail: user.email ?? null }
}

// ── PATCH /api/agency-profile — update contact / logo / prefs fields ────────
// Headers: Authorization: Bearer <session access token>
// Body: any subset of WRITABLE_FIELDS, cost_defaults, or planner_prefs. Returns
// the updated row.
export async function PATCH(req: NextRequest) {
  try {
    const caller = await resolveCallerOrg(req)
    if ('errorResponse' in caller) return caller.errorResponse

    const body = await req.json()

    // Whitelist — ignore anything not explicitly writable
    const updates: Record<string, unknown> = {}
    for (const field of WRITABLE_FIELDS) {
      if (field in body) {
        updates[field] = body[field] || null
      }
    }
    // cost_defaults is a jsonb object set by BudgetPlanner (audit S59 H1 — the
    // client write was routed here so the table's anon/authenticated write grants
    // can be revoked). Validate it is a plain object before accepting it.
    if ('cost_defaults' in body) {
      const cd = body.cost_defaults
      if (cd === null || (typeof cd === 'object' && !Array.isArray(cd))) {
        updates.cost_defaults = cd
      } else {
        return NextResponse.json({ error: 'cost_defaults must be an object' }, { status: 400 })
      }
    }
    // planner_prefs is a jsonb object set by the Portfolio Planner v2 page
    // (Planner-v2-SPEC-2026-07.md). Same rule as cost_defaults: agency_profiles
    // has zero client direct writes, so the planner saves through here. Validate
    // it is a plain object, and STAMP updated_by server-side from the
    // authenticated caller — never trust a client-supplied updated_by (spoofable).
    if ('planner_prefs' in body) {
      const pp = body.planner_prefs
      if (pp === null) {
        updates.planner_prefs = null
      } else if (typeof pp === 'object' && !Array.isArray(pp)) {
        updates.planner_prefs = { ...pp, updated_by: caller.callerEmail ?? caller.callerId }
      } else {
        return NextResponse.json({ error: 'planner_prefs must be an object' }, { status: 400 })
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

    if (error) {
      console.error('agency-profile PATCH: update failed', error)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No agency profile to update' }, { status: 404 })
    }
    return NextResponse.json({ success: true, profile: data[0] })
  } catch (err) {
    console.error('agency-profile PATCH: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
      console.error('agency-profile DELETE: delete failed', error)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('agency-profile DELETE: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
