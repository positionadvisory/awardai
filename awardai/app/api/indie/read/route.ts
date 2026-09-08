// Deploy to: app/api/indie/read/route.ts
//
// POST /api/indie/read -- start a free anonymous Indie Awards pre-read.
//
// Unauthenticated by design: an entrant has no account and is never asked for
// one. This route holds the shared secret and is the ONLY thing that may call
// the indie-read edge function.
//
// It owns exactly one control the edge function cannot: the per-caller throttle.
// Vercel is where the real client IP is visible. The daily ceiling of 150 bounds
// the bill; without a per-caller throttle a single actor cycling throwaway
// emails exhausts that ceiling in minutes and every real entrant gets the queue
// message. Both limits exist, and they are limiting different things.

import { NextRequest, NextResponse } from 'next/server'
import { indieAdmin, ipHash, callIndieFn } from '@/lib/indie-read-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PER_IP_PER_HOUR = 6
const PER_IP_PER_DAY  = 20
const EDGE_TIMEOUT_MS = 110_000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
    }

    const admin = indieAdmin()
    const hash = ipHash(req)
    const nowMs = Date.now()

    const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
      admin.from('indie_read_attempts').select('id', { count: 'exact', head: true })
        .eq('ip_hash', hash).gte('created_at', new Date(nowMs - 3_600_000).toISOString()),
      admin.from('indie_read_attempts').select('id', { count: 'exact', head: true })
        .eq('ip_hash', hash).gte('created_at', new Date(nowMs - 86_400_000).toISOString()),
    ])

    if ((lastHour ?? 0) >= PER_IP_PER_HOUR || (lastDay ?? 0) >= PER_IP_PER_DAY) {
      await admin.from('indie_read_attempts').insert({ ip_hash: hash, outcome: 'throttled' })
      return NextResponse.json(
        { error: 'Too many reads from this connection. Try again later.', reason: 'ip_throttle' },
        { status: 429 }
      )
    }

    // Recorded BEFORE the call, so a request that times out still counts. A
    // throttle that only counts completed work is a throttle an abuser waits out.
    await admin.from('indie_read_attempts').insert({ ip_hash: hash, outcome: 'attempted' })

    const { status, json } = await callIndieFn('indie-read', {
      source_path:   body.source_path,
      category_slug: body.category_slug,
      email:         body.email,
      entry_id:      body.entry_id,
      sections:      body.sections,
      background:    body.background,
      extracted_text: body.extracted_text,
      filename:      body.filename,
      landing_code:  body.landing_code,
    }, EDGE_TIMEOUT_MS)

    return NextResponse.json(json, { status })

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[indie/read] edge function timed out')
      return NextResponse.json(
        { error: 'That took longer than expected. Check your inbox in a few minutes.', code: 'INDIE-TIMEOUT' },
        { status: 504 }
      )
    }
    console.error('[indie/read] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
