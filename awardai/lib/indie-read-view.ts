// lib/indie-read-view.ts
//
// The ONE read-page payload builder, called by both consumers.
//
// SERVER ONLY: it builds a service-role client. Never import it from a client
// component.
//
// WHY THIS FILE EXISTS. GET /api/indie/read/[token] and the server-rendered
// page at /indie/r/[token] must return exactly the same fields, so the field
// allowlist has to live in one place. The first version of the page fetched its
// own API route over HTTP to achieve that, and it was wrong in a way that only
// a preview could show: Vercel's deployment protection answers an
// uncredentialed request with an HTML challenge, so the page parsed no JSON and
// rendered its failure state over a read that was completely fine. On
// production, where there is no protection, the same code would have worked,
// which is the worst version of that bug. There is no HTTP hop now.
//
// The response is an EXPLICIT ALLOWLIST of columns, not a select('*') with
// fields deleted afterwards: deleting is a blocklist, and a blocklist misses
// whatever column gets added next. There is no numeric score anywhere in the
// payload, per section or overall.

import { indieAdmin, isIndieToken } from './indie-read-server'

export type IndieReadPayload = Record<string, unknown>

const RETURN_VISIT_GRACE_MS = 60_000

function isReturnVisit(lastReadAt: string | null): boolean {
  if (!lastReadAt) return false
  const t = new Date(lastReadAt).getTime()
  if (isNaN(t)) return false
  return Date.now() - t > RETURN_VISIT_GRACE_MS
}

export async function loadIndieRead(token: string): Promise<{ httpStatus: number; body: IndieReadPayload }> {
  if (!isIndieToken(token)) {
    return { httpStatus: 404, body: { error: 'Not found' } }
  }
  const admin = indieAdmin()

  const { data: row, error } = await admin
    .from('indie_reads')
    .select('id, status, category_slug, category_pattern, entry_id, bands, adjustments, also_fits, elsewhere, elsewhere_dropped, created_at, completed_at, expires_at, read_count, last_read_at, source_path')
    .eq('token', token)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[indie/read/token] lookup error:', error)
    return { httpStatus: 500, body: { error: 'Something went wrong.' } }
  }
  // A mutated token and an expired token both return 404 with no detail. A
  // distinct "expired" body would confirm to a guesser that the token existed.
  if (!row) return { httpStatus: 404, body: { error: 'Not found' } }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { httpStatus: 404, body: { error: 'Not found' } }
  }

  if (row.status !== 'ready') {
    return { httpStatus: 200, body: { status: row.status, category_slug: row.category_slug } }
  }

  // AWAITED, inside a try, and that is a fix rather than a preference. NOTE
  // that read_count is not a reliable view count and this write does not make
  // it one: two renders per navigation both read the same value and both write
  // the same increment. Making it a true counter needs an atomic increment in
  // the database, which is T7a's table and a migration this build does not own.
  // Nothing entrant-facing reads it. T7a
  // wrote this as fire and forget so a failed counter could never fail the
  // page, which is the right intent: but nothing guarantees a serverless
  // invocation stays alive after its response, and measured on the preview the
  // bump never landed once in four views. read_count stayed 0, so
  // is_return_visit could never turn true and T5's TOKEN_REUSED line could
  // never render at all. Awaiting it costs one round trip; the try keeps the
  // original guarantee, which was about not failing the page rather than about
  // not waiting.
  try {
    const { error: bumpErr } = await admin.from('indie_reads')
      .update({ read_count: (row.read_count ?? 0) + 1, last_read_at: new Date().toISOString() })
      .eq('id', row.id)
    if (bumpErr) console.error('[indie/read/token] read_count bump failed:', bumpErr)
  } catch (e) {
    console.error('[indie/read/token] read_count bump threw:', e)
  }

  return {
    httpStatus: 200,
    body: {
      status: 'ready',
      category_slug:    row.category_slug,
      category_display: row.category_pattern,
      entry_id:         row.entry_id,
      source_path:      row.source_path,
      created_at:       row.created_at,
      completed_at:     row.completed_at,
      expires_at:       row.expires_at,
      // T5's TOKEN_REUSED copy ("This read is already done") is a RETURN-visit
      // string, so the page needs to know which visit this is.
      //
      // KEYED ON last_read_at, NOT read_count, and the reason is measured. The
      // bump is a read-then-write, and this page renders twice per navigation,
      // so both renders read the same pre-write value and both store the same
      // incremented one: read_count reached 1 on the preview and then stayed at
      // 1 across every later view while last_read_at moved each time. A
      // saturating counter cannot tell a first visit from a tenth.
      //
      // The GRACE WINDOW is what makes the timestamp usable. Those two renders
      // are milliseconds apart, so without it the first view would set the
      // stamp and the second would read it and greet a brand new entrant with
      // "this read is already done". A genuine return visit is minutes or days
      // later, so one minute separates the two cases with room to spare, and it
      // fails toward silence rather than toward wrong copy.
      is_return_visit:  isReturnVisit(row.last_read_at as string | null),
      bands:            row.bands ?? [],
      adjustments:      row.adjustments ?? [],
      // Count is reported so the page can drop the word "Three" from
      // ADJUSTMENTS_H rather than print a heading its list contradicts.
      adjustment_count: Array.isArray(row.adjustments) ? row.adjustments.length : 0,
      stage2_ready:     row.also_fits !== null,
      stage3_ready:     row.elsewhere !== null,
      stage3_count:     Array.isArray(row.elsewhere) ? row.elsewhere.length : 0,
      show_numbers:     false,
    },
  }
}
