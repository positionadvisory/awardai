// lib/indie-read-server.ts
//
// Server-only helpers shared by the four /api/indie routes. SERVER ONLY: it
// reads INDIE_READ_SECRET and the service role key, so it must never be
// imported from a client component. Neither name is NEXT_PUBLIC_, which is the
// actual guard: a NEXT_PUBLIC_ var compiles into the client bundle.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { SHOW_CATEGORIES, SHOW_CATEGORY_ALIASES } from './show-taxonomy'

export const INDIE_SHOW_NAME = 'The Indie Awards'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function indieAdmin(): SupabaseClient {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(SUPABASE_URL, SERVICE_KEY)
}

export function indieSecret(): string | null {
  return process.env.INDIE_READ_SECRET ?? null
}

/** A 64-hex token, nothing else. Anything shorter or non-hex is a 404, never a
 *  database lookup: the token is the only credential on this surface. */
export function isIndieToken(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
}

/** Salted hash of the caller's IP. The raw IP is never stored: the throttle
 *  needs "same caller as before", which a hash answers, and nothing more. An
 *  unset salt is a hard error rather than a silent fallback, because hashing
 *  with a default salt across deployments would make the hashes linkable. */
export function ipHash(req: Request): string {
  const salt = process.env.INDIE_IP_SALT
  if (!salt) throw new Error('INDIE_IP_SALT not set')
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const ip = (fwd.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim()
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32)
}

/** Calls one of the two indie edge functions with the shared secret. The secret
 *  is added HERE and only here, so no caller can forget it and no browser can
 *  ever see it. */
export async function callIndieFn(
  slug: 'indie-read' | 'indie-directions',
  body: unknown,
  timeoutMs: number
): Promise<{ status: number; json: Record<string, unknown> }> {
  const secret = indieSecret()
  if (!secret) throw new Error('INDIE_READ_SECRET not set')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let parsed: Record<string, unknown> = {}
    // Read the body before forming a hypothesis. A status code says something
    // failed, never why, and an unparseable body is itself the finding.
    try { parsed = text ? JSON.parse(text) : {} } catch {
      console.error(`[indie] ${slug} returned non-JSON:`, res.status, text.slice(0, 300))
      parsed = { error: 'Upstream returned an unexpected response.', code: 'INDIE-UPSTREAM' }
    }
    return { status: res.status, json: parsed }
  } finally {
    clearTimeout(timer)
  }
}

/** The show set stage 3 is allowed to name, and the reason it is this set.
 *
 *  "Does the platform carry this show" is not a computable predicate: four sets
 *  disagree, union 59 names, intersection 11. So this NAMES its set. It is the
 *  SHOW_CATEGORIES keys, because stage 3 must return a show AND a category for
 *  every row it shows, and SHOW_CATEGORIES is by definition the set for which a
 *  documented category list exists. The Indie Awards itself is removed: stage 3
 *  is "where else this work could go".
 *
 *  Not DEADLINES_2026, which has fifteen shows with no category list, and not
 *  dynamic_shows, which reaches the client as show_name only. */
export function stage3Catalogue(): { shows: string[]; categories: Record<string, string[]>; aliases: Record<string, string | null> } {
  const shows = Object.keys(SHOW_CATEGORIES).filter(s => s !== INDIE_SHOW_NAME)
  const categories: Record<string, string[]> = {}
  for (const s of shows) categories[s] = SHOW_CATEGORIES[s]
  const aliases: Record<string, string | null> = { ...SHOW_CATEGORY_ALIASES }
  return { shows, categories, aliases }
}
