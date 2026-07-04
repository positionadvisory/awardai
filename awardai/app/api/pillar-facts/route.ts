// app/api/pillar-facts/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// AOY flow redesign, chunk 7 (2026-07-04) — persist validated People/Brand
// facts. Sibling of /api/agency-facts (S73), deliberately NOT an extension of
// it (see the write-pattern decision in aoy-pillar-facts-2026-07-04.sql).
//
// The ONLY writer of project_pillar_facts. extract-pillar-facts is parse-only;
// nothing persists until the user has reviewed every figure point-by-point and
// this route is called.
//
// POST body: { project_id: number, pillar: 'people'|'brand', facts: object }
//   1. Re-normalises facts server-side (never trust the client shape).
//   2. Stamps validated_at + validated_by.
//   3. Upserts ONE row per (project_id, pillar). PER-PROJECT ONLY — no
//      org-level canonical row, no propagation to other projects (Ben's S114
//      call: unlike Agency, a nominee's backing-agency facts or a brand's
//      endorsing-brand detail are not organizationally constant, so there is
//      nothing to propagate FROM).
//   Returns { success: true, pillar }.
//
// SECURITY (load-bearing, mirrors /api/agency-facts):
// - project_pillar_facts has ZERO client direct writes (new table, built with
//   the stricter posture from day one — REVOKE INSERT/UPDATE/DELETE/TRUNCATE,
//   GRANT SELECT only). This service-role route is the sanctioned path.
// - Caller org is derived from their profiles row, NEVER from the body
//   (tenant isolation, S47).
// - project_id is coerced (Number) and scoped to the caller org before any
//   write (IDOR class — sequential bigint ids, S47/S59).
// - This route NEVER touches projects.agency_facts, agency_profiles, or
//   projects.entry_type. It is fully separate from the Agency facts path.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// ── Server-side normalisation — identical contract to extract-pillar-facts ───
const numOrNull = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v)) ? v : null
const strOrNull = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim()) ? v.trim() : null

function normalisePeopleFacts(input: unknown) {
  const f = (input && typeof input === 'object' && !Array.isArray(input)) ? input as Record<string, unknown> : {}
  const nom = (f.nominee ?? {}) as Record<string, unknown>
  const backing = (f.backing_agency ?? {}) as Record<string, unknown>
  const backingRev = (backing.revenue ?? {}) as Record<string, unknown>
  const backingHc = (backing.headcount ?? {}) as Record<string, unknown>
  const highlights = Array.isArray(f.career_highlights) ? f.career_highlights : []
  const campaigns = Array.isArray(f.notable_campaigns) ? f.notable_campaigns : []

  return {
    schema_version: 1,
    nominee: {
      full_name: strOrNull(nom.full_name),
      current_title: strOrNull(nom.current_title),
      years_in_industry: numOrNull(nom.years_in_industry),
      tenure_at_agency: strOrNull(nom.tenure_at_agency),
    },
    career_highlights: highlights.slice(0, 5).map((h: Record<string, unknown>) => ({
      title: strOrNull(h?.title) ?? '',
      year: numOrNull(h?.year),
      description: strOrNull(h?.description),
    })).filter((h: { title: string }) => h.title),
    notable_campaigns: campaigns.slice(0, 5).map((c: Record<string, unknown>) => ({
      name: strOrNull(c?.name) ?? '',
      brand: strOrNull(c?.brand),
      year: numOrNull(c?.year),
      result: strOrNull(c?.result),
    })).filter((c: { name: string }) => c.name),
    backing_agency: {
      name: strOrNull(backing.name),
      revenue: {
        amount: numOrNull(backingRev.amount),
        currency: strOrNull(backingRev.currency),
        period: strOrNull(backingRev.period),
      },
      headcount: {
        total: numOrNull(backingHc.total),
        as_of: strOrNull(backingHc.as_of),
      },
    },
    notes: strOrNull(f.notes),
  }
}

function normaliseBrandFacts(input: unknown) {
  const f = (input && typeof input === 'object' && !Array.isArray(input)) ? input as Record<string, unknown> : {}
  const brand = (f.brand ?? {}) as Record<string, unknown>
  const endorsing = (f.endorsing_brand ?? {}) as Record<string, unknown>
  const metrics = Array.isArray(f.performance_metrics) ? f.performance_metrics : []
  const campaigns = Array.isArray(f.notable_campaigns) ? f.notable_campaigns : []

  return {
    schema_version: 1,
    brand: {
      name: strOrNull(brand.name),
      category: strOrNull(brand.category),
      market_position: strOrNull(brand.market_position),
    },
    performance_metrics: metrics.slice(0, 5).map((m: Record<string, unknown>) => ({
      metric: strOrNull(m?.metric) ?? '',
      value: numOrNull(m?.value),
      unit: strOrNull(m?.unit),
      period: strOrNull(m?.period),
    })).filter((m: { metric: string }) => m.metric),
    notable_campaigns: campaigns.slice(0, 5).map((c: Record<string, unknown>) => ({
      name: strOrNull(c?.name) ?? '',
      agency: strOrNull(c?.agency),
      year: numOrNull(c?.year),
      result: strOrNull(c?.result),
    })).filter((c: { name: string }) => c.name),
    endorsing_brand: {
      name: strOrNull(endorsing.name),
      relationship: strOrNull(endorsing.relationship),
      duration: strOrNull(endorsing.duration),
    },
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
      return NextResponse.json({ error: 'Invalid request body', code: 'PF-400' }, { status: 400 })
    }
    const projectId = Number(body.project_id)
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ error: 'project_id is required', code: 'PF-400' }, { status: 400 })
    }
    const pillar = body.pillar === 'people' || body.pillar === 'brand' ? body.pillar : null
    if (!pillar) {
      return NextResponse.json({ error: 'pillar must be "people" or "brand"', code: 'PF-400' }, { status: 400 })
    }
    const facts = pillar === 'people' ? normalisePeopleFacts(body.facts) : normaliseBrandFacts(body.facts)

    const supabase = getServiceClient()

    // Confirm the current project belongs to the caller's org (IDOR guard).
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('id, org_id')
      .eq('id', projectId)
      .single()
    if (projErr || !proj || Number(proj.org_id) !== Number(orgId)) {
      return NextResponse.json({ error: 'Project not found', code: 'PF-404' }, { status: 404 })
    }

    const validatedAt = new Date().toISOString()
    const enriched = {
      ...facts,
      _meta: { validated_at: validatedAt, validated_by: userId },
    }

    // Sole write target: one row per (project_id, pillar). No propagation.
    const { data: saved, error: saveErr } = await supabase
      .from('project_pillar_facts')
      .upsert({
        project_id: projectId,
        org_id: orgId,
        pillar,
        facts: enriched,
        schema_version: 1,
        validated_at: validatedAt,
        validated_by: userId,
        updated_at: validatedAt,
      }, { onConflict: 'project_id,pillar' })
      .select('id')
    if (saveErr || !saved || saved.length === 0) {
      // DM-16: a client "success" with zero affected rows is a silent no-op.
      // Check both the error AND the returned rows before reporting success.
      console.error('pillar-facts POST: upsert failed or returned no rows', saveErr)
      return NextResponse.json({ error: 'Could not save the validated facts', code: 'PF-DB-500' }, { status: 500 })
    }

    return NextResponse.json({ success: true, pillar })
  } catch (err) {
    console.error('pillar-facts POST: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error', code: 'PF-500' }, { status: 500 })
  }
}
