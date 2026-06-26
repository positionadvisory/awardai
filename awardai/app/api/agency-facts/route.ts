// app/api/agency-facts/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// AOY Phase 2 (Session 73) — persist + PROPAGATE validated agency facts.
//
// The ONLY writer of agency_profiles.agency_facts (org-level canonical) and of
// projects.agency_facts (per-project snapshots). The extract-agency-facts edge
// function is parse-only; nothing persists until the user has reviewed every
// figure point-by-point and this route is called.
//
// POST body: { project_id: number, facts: AgencyFacts }
//   1. Re-normalises facts server-side (never trust the client shape).
//   2. Stamps version + validated_at + validated_by.
//   3. Writes the org-level canonical to agency_profiles (upsert on org_id).
//   4. Marks the current project entry_type='aoy' (definitionally AOY) and then
//      PROPAGATES the canonical to projects.agency_facts for EVERY
//      entry_type='aoy' project in the org (org-wide, Ben's S73 decision).
//   Returns { propagated_count, version }.
//
// SECURITY (load-bearing):
// - agency_profiles has ZERO client direct writes (S66) — this service-role route
//   is the sanctioned path.
// - Caller org is derived from their profiles row, NEVER from the body (tenant
//   isolation, S47).
// - project_id is coerced (Number) and scoped to the caller org before any write
//   (IDOR class — sequential bigint ids, S47/S59).
// - The projects update sets ONLY agency_facts / entry_type / updated_at. It never
//   reads-modifies-writes projects.materials (the single most dangerous regression
//   in this codebase — in-memory materials are slim and would wipe extracted_text).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Routes reading request headers must be dynamic (silences the benign build-time
// DYNAMIC_SERVER_USAGE red log).
export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

async function resolveCaller(
  req: NextRequest
): Promise<{ orgId: number; userId: string } | { errorResponse: NextResponse }> {
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
  return { orgId: profile.org_id, userId: user.id }
}

// ── Server-side normalisation — identical contract to extract-agency-facts ────
// The client cannot widen the shape: anything off-schema is dropped, arrays are
// capped (5 wins / 10 retention / 25 awards), values coerced to number|string|null.
const numOrNull = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v)) ? v : null
const strOrNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim()) ? v.trim() : null

function normaliseFacts(input: unknown) {
  const f = (input && typeof input === 'object' && !Array.isArray(input))
    ? input as Record<string, unknown>
    : {}
  const rev = (f.revenue ?? {}) as Record<string, unknown>
  const hc = (f.headcount ?? {}) as Record<string, unknown>
  const own = (f.ownership ?? {}) as Record<string, unknown>
  const wins = Array.isArray(f.new_business_wins) ? f.new_business_wins : []
  const retention = Array.isArray(f.client_retention) ? f.client_retention : []
  const awards = Array.isArray(f.awards) ? f.awards : []

  return {
    schema_version: 1,
    revenue: {
      amount: numOrNull(rev.amount),
      currency: strOrNull(rev.currency),
      period: strOrNull(rev.period),
      yoy_pct: numOrNull(rev.yoy_pct),
    },
    headcount: {
      total: numOrNull(hc.total),
      as_of: strOrNull(hc.as_of),
    },
    ownership: {
      independent_pct: numOrNull(own.independent_pct),
      structure: strOrNull(own.structure),
    },
    new_business_wins: wins.slice(0, 5).map((w: Record<string, unknown>) => ({
      client: strOrNull(w?.client) ?? '',
      value: numOrNull(w?.value),
      currency: strOrNull(w?.currency),
      period: strOrNull(w?.period),
    })).filter((w: { client: string }) => w.client),
    client_retention: retention.slice(0, 10).map((c: Record<string, unknown>) => ({
      client: strOrNull(c?.client) ?? '',
      tenure: strOrNull(c?.tenure),
    })).filter((c: { client: string }) => c.client),
    awards: awards.slice(0, 25).map((a: Record<string, unknown>) => ({
      show: strOrNull(a?.show) ?? '',
      category: strOrNull(a?.category),
      result: strOrNull(a?.result),
      year: numOrNull(a?.year),
    })).filter((a: { show: string }) => a.show),
    notes: strOrNull(f.notes),
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCaller(req)
    if ('errorResponse' in caller) return caller.errorResponse
    const { orgId, userId } = caller

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body', code: 'AF-400' }, { status: 400 })
    }
    const projectId = Number(body.project_id)
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ error: 'project_id is required', code: 'AF-400' }, { status: 400 })
    }
    const facts = normaliseFacts(body.facts)

    const supabase = getServiceClient()

    // Confirm the current project belongs to the caller's org (IDOR guard).
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('id, org_id')
      .eq('id', projectId)
      .single()
    if (projErr || !proj || Number(proj.org_id) !== Number(orgId)) {
      // Do not reveal cross-tenant existence.
      return NextResponse.json({ error: 'Project not found', code: 'AF-404' }, { status: 404 })
    }

    // Compute the next version from the org-level canonical row.
    const { data: prof } = await supabase
      .from('agency_profiles')
      .select('agency_facts_version')
      .eq('org_id', orgId)
      .maybeSingle()
    const nextVersion = (Number(prof?.agency_facts_version) || 0) + 1
    const validatedAt = new Date().toISOString()

    // The enriched blob stored everywhere — facts plus provenance — so a draft/eval
    // function reading projects.agency_facts alone knows it is validated and which
    // version. agency_profiles ALSO carries the version in dedicated columns for
    // querying. Same blob in both targets so the two cannot drift.
    const enriched = {
      ...facts,
      _meta: { version: nextVersion, validated_at: validatedAt, validated_by: userId },
    }

    // 1. Org-level canonical (agency_profiles). Upsert: the row may not exist yet
    //    if the org never ran extract-agency-profile.
    const { error: profErr } = await supabase
      .from('agency_profiles')
      .upsert({
        org_id: orgId,
        agency_facts: enriched,
        agency_facts_version: nextVersion,
        agency_facts_validated_at: validatedAt,
        agency_facts_validated_by: userId,
        updated_at: validatedAt,
      }, { onConflict: 'org_id' })
    if (profErr) {
      console.error('agency-facts POST: canonical upsert failed', profErr)
      return NextResponse.json({ error: 'Could not save the validated facts', code: 'AF-DB-500' }, { status: 500 })
    }

    // 2. Mark the current project AOY (it is definitionally AOY — the user just
    //    validated AOY facts on it). Targeted column write; materials untouched.
    const { error: markErr } = await supabase
      .from('projects')
      .update({ entry_type: 'aoy', updated_at: validatedAt })
      .eq('id', projectId)
      .eq('org_id', orgId)
    if (markErr) {
      console.error('agency-facts POST: failed to mark project aoy', markErr)
      return NextResponse.json({ error: 'Could not update the project', code: 'AF-DB-500' }, { status: 500 })
    }

    // 3. Propagate org-wide to every AOY project. Returns the affected rows so we
    //    can report how many entries inherited the validated facts.
    const { data: propagated, error: propErr } = await supabase
      .from('projects')
      .update({ agency_facts: enriched, updated_at: validatedAt })
      .eq('org_id', orgId)
      .eq('entry_type', 'aoy')
      .select('id')
    if (propErr) {
      console.error('agency-facts POST: propagation failed', propErr)
      return NextResponse.json({ error: 'Saved the facts but propagation failed. Re-run validation.', code: 'AF-DB-500' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      version: nextVersion,
      propagated_count: propagated?.length ?? 0,
    })
  } catch (err) {
    console.error('agency-facts POST: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error', code: 'AF-500' }, { status: 500 })
  }
}
