// app/api/articles/route.ts
// Articles CRUD — GET (all published, for ISR) + POST (admin create, service key)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Used only for admin writes.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
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
// Body: { secret, slug, title, subtitle?, content, cover_image_url?, published?, published_at? }
// Gated by ADMIN_SECRET env var — simple bearer token pattern. No OAuth needed.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Auth gate
    const secret = process.env.ADMIN_SECRET
    if (!secret || body.secret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
// Body: { secret, slug }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()

    const secret = process.env.ADMIN_SECRET
    if (!secret || body.secret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
