// app/api/articles/route.ts
// Articles CRUD — GET (all published, for ISR) + POST (admin create, service key)
// Session 50: ADMIN_SECRET gate replaced with JWT admin check (audit A-06).
// The old NEXT_PUBLIC_ADMIN_SECRET shipped in the client bundle — anyone could
// read it from the JS and POST/DELETE articles. Auth is now: Authorization
// Bearer <session access token> → auth.getUser(jwt) → email must be ADMIN_EMAIL.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'ben@positionadvisory.com'

// Service-role client — bypasses RLS. Used only for admin writes.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// JWT admin gate — returns null if authorized, or an error response.
async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getServiceClient()
  const { data: { user }, error } = await supabase.auth.getUser(jwt)
  if (error || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Anon client — respects RLS (published=true only)
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── GET /api/articles — returns all published articles ──────────────────────
export async function GET() {
  const supabase = getAnonClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, subtitle, cover_image_url, reading_time_minutes, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ articles: data || [] })
}

// ── POST /api/articles — create or update article (admin only) ──────────────
// Headers: Authorization: Bearer <session access token> (must resolve to ADMIN_EMAIL)
// Body: { slug, title, subtitle?, content, cover_image_url?, published?, published_at? }
export async function POST(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin(req)
    if (unauthorized) return unauthorized

    const body = await req.json()
    const { slug, title, subtitle, content, cover_image_url, published, published_at } = body

    if (!slug || !title || !content) {
      return NextResponse.json({ error: 'slug, title, and content are required' }, { status: 400 })
    }

    // Auto-generate slug if not provided (from title)
    const finalSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const supabase = getServiceClient()

    // Upsert on slug (so posting twice updates rather than errors)
    const { data, error } = await supabase
      .from('articles')
      .upsert(
        {
          slug: finalSlug,
          title,
          subtitle: subtitle || null,
          content,
          cover_image_url: cover_image_url || null,
          published: published ?? false,
          published_at: published
            ? (published_at || new Date().toISOString())
            : null,
        },
        { onConflict: 'slug' }
      )
      .select('id, slug')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      article: data,
      url: `https://gotshortlisted.com/articles/${finalSlug}`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE /api/articles — unpublish article (admin only) ───────────────────
// Headers: Authorization: Bearer <session access token> (must resolve to ADMIN_EMAIL)
// Body: { slug }
export async function DELETE(req: NextRequest) {
  try {
    const unauthorized = await requireAdmin(req)
    if (unauthorized) return unauthorized

    const body = await req.json()

    if (!body.slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // Soft delete — set published=false rather than hard delete
    const { error } = await supabase
      .from('articles')
      .update({ published: false })
      .eq('slug', body.slug)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Article "${body.slug}" unpublished` })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
