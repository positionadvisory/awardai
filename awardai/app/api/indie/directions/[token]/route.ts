// Deploy to: app/api/indie/directions/[token]/route.ts
//
// POST /api/indie/directions/[token] -- stage 2, other Indie 2027 categories.
//
// POST rather than GET because it spends a model call on its first run. It is
// the reader's own click, never part of the stage-1 wait: direction generation
// measured 65s at p50, which is longer than the read itself, so putting it
// behind the same progress bar would double a wait the copy promises is under a
// minute.

import { NextRequest, NextResponse } from 'next/server'
import { isIndieToken, callIndieFn } from '@/lib/indie-read-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!isIndieToken(params.token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { status, json } = await callIndieFn(
      'indie-directions', { token: params.token, stage: 2 }, 110_000
    )
    return NextResponse.json(json, { status })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'That took longer than expected.', code: 'INDIE-TIMEOUT' }, { status: 504 })
    }
    console.error('[indie/directions] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
