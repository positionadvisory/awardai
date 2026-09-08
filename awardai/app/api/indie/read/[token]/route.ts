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
// The response is built from an EXPLICIT ALLOWLIST of columns. Not a select('*')
// with fields deleted afterwards: deleting is a blocklist, and a blocklist
// misses whatever column gets added next. There is no numeric score anywhere in
// the payload, per section or overall, because T3 could not validate the score
// against this jury and so it is never shown.

import { NextRequest, NextResponse } from 'next/server'
import { indieAdmin, isIndieToken } from '@/lib/indie-read-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!isIndieToken(params.token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const admin = indieAdmin()

    const { data: row, error } = await admin
      .from('indie_reads')
      .select('id, status, category_slug, category_pattern, entry_id, bands, adjustments, also_fits, elsewhere, elsewhere_dropped, created_at, completed_at, expires_at, read_count, source_path')
      .eq('token', params.token)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[indie/read/token] lookup error:', error)
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
    }
    // A mutated token and an expired token both return 404 with no detail. A
    // distinct "expired" body would confirm to a guesser that the token existed.
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (row.status !== 'ready') {
      return NextResponse.json({ status: row.status, category_slug: row.category_slug }, { status: 200 })
    }

    // Fire and forget: a failed counter must never fail the page.
    admin.from('indie_reads')
      .update({ read_count: (row.read_count ?? 0) + 1, last_read_at: new Date().toISOString() })
      .eq('id', row.id)
      .then(({ error: e }) => { if (e) console.error('[indie/read/token] read_count bump failed:', e) })

    return NextResponse.json({
      status: 'ready',
      category_slug:    row.category_slug,
      category_display: row.category_pattern,
      entry_id:         row.entry_id,
      source_path:      row.source_path,
      created_at:       row.created_at,
      completed_at:     row.completed_at,
      expires_at:       row.expires_at,
      // First view is read_count 0 in the row we just read. T5's TOKEN_REUSED
      // copy ("This read is already done") is a RETURN-visit string, so the page
      // needs to know which visit this is.
      is_return_visit:  (row.read_count ?? 0) > 0,
      bands:            row.bands ?? [],
      adjustments:      row.adjustments ?? [],
      // Count is reported so the page can drop the word "Three" from
      // ADJUSTMENTS_H rather than print a heading its list contradicts. Measured
      // across all 88 config judge evaluations in production, the jury returned
      // four gaps every time, so three is the expected case, not the lucky one.
      adjustment_count: Array.isArray(row.adjustments) ? row.adjustments.length : 0,
      stage2_ready:     row.also_fits !== null,
      stage3_ready:     row.elsewhere !== null,
      stage3_count:     Array.isArray(row.elsewhere) ? row.elsewhere.length : 0,
      show_numbers:     false,
    }, { status: 200 })

  } catch (err) {
    console.error('[indie/read/token] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
