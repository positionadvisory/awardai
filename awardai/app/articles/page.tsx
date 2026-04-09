// app/articles/page.tsx
// Public articles listing — server component, SEO-friendly

import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = {
  title: 'Articles — Shortlist',
  description: 'Practical writing on award entries, jury thinking, and how to win more with the same work. By Ben Condit.',
  openGraph: {
    title: 'Articles — Shortlist',
    description: 'Practical writing on award entries, jury thinking, and how to win more with the same work.',
    url: 'https://gotshortlisted.com/articles',
    siteName: 'Shortlist',
    type: 'website',
  },
}

type Article = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  cover_image_url: string | null
  reading_time_minutes: number
  published_at: string
}

async function getArticles(): Promise<Article[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, subtitle, cover_image_url, reading_time_minutes, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch articles:', error)
    return []
  }
  return data || []
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function ArticlesPage() {
  const articles = await getArticles()

  return (
    <div style={{ background: '#0b1120', minHeight: '100vh', color: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '64px', gap: '2rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>S</span>
            </div>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '15px', letterSpacing: '-0.01em' }}>Shortlist</span>
          </Link>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/about" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>About</Link>
            <Link href="/login" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>Sign in</Link>
            <Link href="/login" style={{
              background: '#16a34a', color: 'white', padding: '0.5rem 1.125rem',
              borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>Request access</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '80px 1.5rem' }}>

        {/* Header */}
        <header style={{ marginBottom: '4rem' }}>
          <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Articles</span>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', color: '#f1f5f9', lineHeight: 1.2 }}>
            On awards, writing,<br />and winning.
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.7, marginTop: '1rem', maxWidth: '520px' }}>
            Practical writing on award entries, jury thinking, and how to get more from the same work. By Ben Condit.
          </p>
        </header>

        {/* Article list */}
        {articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#475569' }}>
            <p style={{ fontSize: '1rem' }}>No articles yet. Check back soon.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {articles.map((article, i) => (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                style={{
                  textDecoration: 'none',
                  display: 'block',
                  padding: '2rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  borderTop: i === 0 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <h2 style={{
                      color: '#f1f5f9', fontSize: '1.125rem', fontWeight: 600,
                      lineHeight: 1.4, margin: '0 0 0.5rem',
                      transition: 'color 0.15s',
                    }}>
                      {article.title}
                    </h2>
                    {article.subtitle && (
                      <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.875rem' }}>
                        {article.subtitle}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                      <span style={{ color: '#475569', fontSize: '12px' }}>{formatDate(article.published_at)}</span>
                      <span style={{ color: '#334155', fontSize: '12px' }}>·</span>
                      <span style={{ color: '#475569', fontSize: '12px' }}>{article.reading_time_minutes} min read</span>
                    </div>
                  </div>
                  <span style={{ color: '#22c55e', fontSize: '18px', flexShrink: 0, alignSelf: 'center' }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '2.5rem 1.5rem', marginTop: '4rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '10px' }}>S</span>
            </div>
            <span style={{ color: '#475569', fontSize: '13px' }}>Shortlist · gotshortlisted.com</span>
          </Link>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link href="/about" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>About</Link>
            <Link href="/login" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
