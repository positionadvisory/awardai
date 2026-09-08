// app/indie/r/[token]/page.tsx -- the public tokenized read page.
//
// SERVER-RENDERED through lib/indie-read-view.ts, the same function
// GET /api/indie/read/[token] returns its body from, so the two surfaces cannot
// disagree about which fields exist and there is only one copy of the column
// allowlist. indie_reads has RLS on with zero policies and an explicit REVOKE,
// so a service-role read is the only way in: an anon-readable policy on a token
// column is what platform_invitations had, USING (true), and it was dropped
// because it exposed every token and every invitee email to anyone holding the
// anon key.
//
// It does NOT fetch its own API route over HTTP. That was the first version and
// it failed on the preview, where Vercel's deployment protection answers an
// uncredentialed server-side fetch with an HTML challenge: the page parsed no
// JSON and rendered its failure state over a read that was fine, while the same
// code would have worked on production. A page that can only be tested in
// production is a page nobody tests.
//
// No login, no account, and no email address in the payload: the route does not
// return the entrant's address and must not start, because this is a public URL
// and anyone holding the token would then hold the address. The signup link
// carries the token alone and resolves the address server-side.
//
// A mutated token and an expired token are the same 404 here, exactly as they
// are in the API. A distinct "this read has expired" page would confirm to
// somebody guessing tokens that this one existed.

import { loadIndieRead } from '@/lib/indie-read-view'
import IndieRead, { type IndieReadData, type ReadBand } from '@/components/IndieRead'
import { READ_NOT_FOUND, READ_FAILED, READ_LOAD_FAILED } from '@/lib/indie-copy'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-100">
      <header className="border-b border-gray-200 bg-white py-4">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
            <span className="text-xs font-bold text-white">S</span>
          </div>
          <span className="sl-serif text-gray-900" style={{ fontSize: '1.2rem', letterSpacing: '-0.01em' }}>Shortlist</span>
        </div>
      </header>
      {children}
    </div>
  )
}

function OneLine({ text }: { text: string }) {
  return (
    <Shell>
      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <p className="text-sm leading-relaxed text-gray-700">{text}</p>
        <a href="/indie" className="mt-4 inline-block text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
          Run a read
        </a>
      </main>
    </Shell>
  )
}

export default async function IndieReadPage(
  { params, searchParams }: { params: { token: string }; searchParams: { again?: string } }
) {
  const token = params.token

  let status = 0
  let payload: Record<string, unknown> = {}
  try {
    const loaded = await loadIndieRead(token)
    status = loaded.httpStatus
    payload = loaded.body
  } catch (err) {
    console.error('[indie/r] load failed:', err)
    return <OneLine text={READ_LOAD_FAILED} />
  }

  if (status === 404) return <OneLine text={READ_NOT_FOUND} />
  if (status !== 200) return <OneLine text={READ_LOAD_FAILED} />

  // A read that is still running, or one that failed upstream. `notext` cannot
  // reach this page from the paste path and is handled on the landing page for
  // the upload one, so it lands here only if somebody opens a notext token
  // directly out of the failure email.
  if (payload.status !== 'ready') {
    return <OneLine text={payload.status === 'pending' ? READ_LOAD_FAILED : READ_FAILED} />
  }

  const rawBands = Array.isArray(payload.bands) ? payload.bands : []
  const bands: ReadBand[] = rawBands.map((b: Record<string, unknown>) => ({
    key: String(b.key ?? ''),
    label: String(b.label ?? ''),
    band: String(b.band ?? ''),
    rationale: String(b.rationale ?? ''),
  }))
  if (bands.length === 0) return <OneLine text={READ_FAILED} />

  const rawAdj = Array.isArray(payload.adjustments) ? payload.adjustments : []

  const data: IndieReadData = {
    category_display: String(payload.category_display ?? ''),
    entry_id: typeof payload.entry_id === 'string' ? payload.entry_id : null,
    created_at: String(payload.created_at ?? ''),
    is_return_visit: payload.is_return_visit === true,
    bands,
    adjustments: rawAdj.map((a: unknown) => String(a ?? '')).filter(Boolean),
    adjustment_count: typeof payload.adjustment_count === 'number' ? payload.adjustment_count : rawAdj.length,
    stage2_ready: payload.stage2_ready === true,
    stage3_ready: payload.stage3_ready === true,
    stage3_count: typeof payload.stage3_count === 'number' ? payload.stage3_count : 0,
  }

  return (
    <Shell>
      <IndieRead token={token} data={data} again={searchParams?.again === '1'} />
    </Shell>
  )
}
