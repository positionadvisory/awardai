// Deploy to: app/api/indie/elsewhere/[token]/route.ts
//
// GET /api/indie/elsewhere/[token] -- stage 3, LOCKED rows.
//
// Returns show and category only. No rationale, no band, no hook line, ever,
// and the underlying column does not hold one: a locked panel that leaks a
// sentence of rationale is a free sample of the paid product and the entrant
// reads the sample instead of buying.
//
// GENERATION IS LAZY AND CACHED, and that is a real decision T7b depends on.
// Stage 3 ran 66.0s to 80.6s in T3, more than twice the jury read, so it cannot
// run inside stage 1. The first GET of this route therefore generates and
// caches; later GETs are a cheap DB read. `generated` in the response says which
// happened, so the page can show a skeleton on a cold token rather than a
// panel that claims a count it does not have yet.
//
// Only shows we carry AND hold a category list for are eligible, and the model's
// category string is resolved against our own list for that show before
// anything is shown. T3 measured 5 of 16 proposals resolving: the model imports
// track names from other shows' taxonomies, and an unresolvable track name is
// not verifiable against anything we hold. `dropped` is returned rather than
// hidden, so a short list reads as our coverage limit and not as a weak entry.

import { NextRequest, NextResponse } from 'next/server'
import { isIndieToken, callIndieFn, stage3Catalogue } from '@/lib/indie-read-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!isIndieToken(params.token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { shows, categories, aliases } = stage3Catalogue()
    const { status, json } = await callIndieFn('indie-directions', {
      token: params.token,
      stage: 3,
      canonical_shows: shows,
      show_categories: categories,
      show_aliases: aliases,
    }, 110_000)

    if (status === 200) {
      return NextResponse.json({
        elsewhere: json.elsewhere ?? [],
        count: Array.isArray(json.elsewhere) ? json.elsewhere.length : 0,
        dropped: json.dropped ?? 0,
        generated: json.cached !== true,
        locked: true,
      }, { status: 200 })
    }
    return NextResponse.json(json, { status })

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'That took longer than expected.', code: 'INDIE-TIMEOUT' }, { status: 504 })
    }
    console.error('[indie/elsewhere] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
