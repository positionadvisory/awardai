// app/indie/r/[token]/page.tsx -- the public tokenized read page.
//
// SERVER-RENDERED from GET /api/indie/read/[token], which is a service-role
// route keyed on the token. It is not an anon-readable policy on a token
// column: platform_invitations once had CREATE POLICY USING (true) for anon and
// it was dropped precisely because it exposed every token and every invitee
// email to anyone holding the anon key. indie_reads has RLS on with zero
// policies, so that route is the only way in and this page goes through it
// rather than reaching for the table with a second copy of the field allowlist.
//
// No login, no account, and no email address in the payload: the route does not
// return the entrant's address and must not start, because this is a public URL
// and anyone holding the token would then hold the address. The signup link
// carries the token alone and resolves the address server-side.
//
// A mutated token and an expired token are the same 404 here, exactly as they
// are in the API. A distinct "this read has expired" page would confirm to
// somebody guessing tokens that this one existed.

import { headers } from 'next/headers'
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
  const h = headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? ''
  const token = params.token

  let status = 0
  let payload: Record<string, unknown> = {}
  try {
    const res = await fetch(proto + '://' + host + '/api/indie/read/' + encodeURIComponent(token), { cache: 'no-store' })
    status = res.status
    payload = await res.json().catch(() => ({}))
  } catch {
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
