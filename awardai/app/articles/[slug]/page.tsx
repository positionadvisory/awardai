// app/articles/[slug]/page.tsx
// Individual article — server component with full SEO + JSON-LD structured data

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

type Article = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  content: string
  cover_image_url: string | null
  reading_time_minutes: number
  published_at: string
}

async function getArticle(slug: string): Promise<Article | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (error || !data) return null
  return data
}

// ── Dynamic OG metadata per article ──────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  const article = await getArticle(params.slug)
  if (!article) return { title: 'Article not found — Shortlist' }

  const description = article.subtitle ||
    article.content.replace(/[#*\n]+/g, ' ').slice(0, 155).trim() + '…'

  return {
    title: `${article.title} — Shortlist`,
    description,
    openGraph: {
      title: article.title,
      description,
      url: `https://gotshortlisted.com/articles/${article.slug}`,
      siteName: 'Shortlist',
      type: 'article',
      publishedTime: article.published_at,
      authors: ['Ben Condit'],
      ...(article.cover_image_url && {
        images: [{ url: article.cover_image_url, width: 1200, height: 630 }],
      }),
    },
    twitter: {
      card: article.cover_image_url ? 'summary_large_image' : 'summary',
      title: article.title,
      description,
      ...(article.cover_image_url && { images: [article.cover_image_url] }),
    },
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// Very lightweight markdown → HTML converter for article body.
// Handles: headings (##, ###), bold (**text**), paragraphs, blank lines.
// For a production app, swap for remark/rehype or marked.
function renderMarkdown(md: string): string {
  return md
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return '<p style="margin:0"></p>'
      if (trimmed.startsWith('### ')) return `<h3>${trimmed.slice(4)}</h3>`
      if (trimmed.startsWith('## ')) return `<h2>${trimmed.slice(3)}</h2>`
      if (trimmed.startsWith('# ')) return `<h1>${trimmed.slice(2)}</h1>`
      // Bold
      const withBold = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      const withItalic = withBold.replace(/\*(.+?)\*/g, '<em>$1</em>')
      return `<p>${withItalic}</p>`
    })
    .join('\n')
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug)
  if (!article) notFound()

  const bodyHtml = renderMarkdown(article.content)

  // JSON-LD structured data for Google / AI search
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.subtitle || '',
    author: {
      '@type': 'Person',
      name: 'Ben Condit',
      url: 'https://gotshortlisted.com/about',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Shortlist',
      url: 'https://gotshortlisted.com',
      logo: { '@type': 'ImageObject', url: 'https://gotshortlisted.com/icon.png' },
    },
    datePublished: article.published_at,
    url: `https://gotshortlisted.com/articles/${article.slug}`,
    ...(article.cover_image_url && { image: article.cover_image_url }),
  }

  return (
    <div style={{ background: '#0b1120', minHeight: '100vh', color: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
            <Link href="/articles" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>← All articles</Link>
            <Link href="/login" style={{
              background: '#16a34a', color: 'white', padding: '0.5rem 1.125rem',
              borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>Request access</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '72px 1.5rem 100px' }}>

        {/* Article header */}
        <header style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#475569', fontSize: '13px' }}>{formatDate(article.published_at)}</span>
            <span style={{ color: '#334155', fontSize: '13px' }}>·</span>
            <span style={{ color: '#475569', fontSize: '13px' }}>{article.reading_time_minutes} min read</span>
            <span style={{ color: '#334155', fontSize: '13px' }}>·</span>
            <span style={{ color: '#475569', fontSize: '13px' }}>Ben Condit</span>
          </div>

          <h1 style={{
            fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em',
            lineHeight: 1.2, color: '#f1f5f9', margin: '0 0 1rem',
          }}>
            {article.title}
          </h1>

          {article.subtitle && (
            <p style={{ color: '#94a3b8', fontSize: '1.125rem', lineHeight: 1.6, margin: 0 }}>
              {article.subtitle}
            </p>
          )}
        </header>

        {/* Cover image */}
        {article.cover_image_url && (
          <div style={{ marginBottom: '3rem', borderRadius: '12px', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.cover_image_url}
              alt={article.title}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        )}

        {/* Article body */}
        <div
          style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '1rem' }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* Inline styles for article content elements */}
        <style>{`
          main h1 { color: #f1f5f9; font-size: 1.75rem; font-weight: 700; margin: 2.5rem 0 1rem; letter-spacing: -0.02em; line-height: 1.3; }
          main h2 { color: #f1f5f9; font-size: 1.375rem; font-weight: 600; margin: 2.25rem 0 0.875rem; letter-spacing: -0.015em; line-height: 1.35; }
          main h3 { color: #e2e8f0; font-size: 1.125rem; font-weight: 600; margin: 2rem 0 0.75rem; }
          main p { margin: 0 0 1.25rem; }
          main p:empty { margin: 0.5rem 0; }
          main strong { color: #f1f5f9; font-weight: 600; }
          main em { color: #cbd5e1; font-style: italic; }
          main a { color: #22c55e; text-decoration: underline; text-decoration-color: rgba(34,197,94,0.4); }
          main a:hover { text-decoration-color: #22c55e; }
        `}</style>

        {/* Divider */}
        <div style={{ margin: '4rem 0 3rem', borderTop: '1px solid rgba(255,255,255,0.07)' }} />

        {/* Share + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Social share */}
          <div>
            <p style={{ color: '#475569', fontSize: '13px', marginBottom: '0.875rem' }}>Share this article</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {[
                {
                  label: 'Share on X',
                  href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`https://gotshortlisted.com/articles/${article.slug}`)}`,
                },
                {
                  label: 'Share on LinkedIn',
                  href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://gotshortlisted.com/articles/${article.slug}`)}`,
                },
                {
                  label: 'Copy link',
                  href: `https://gotshortlisted.com/articles/${article.slug}`,
                  isCopy: true,
                },
              ].map(btn => (
                <a
                  key={btn.label}
                  href={btn.href}
                  target={btn.isCopy ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block', color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '0.5rem 1rem', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 500, textDecoration: 'none',
                  }}
                >
                  {btn.label}
                </a>
              ))}
            </div>
          </div>

          {/* CTA block */}
          <div style={{
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: '16px', padding: '2rem',
          }}>
            <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '1rem', margin: '0 0 0.5rem' }}>
              Try Shortlist before your next entry.
            </p>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              AI-drafted entries, jury-calibrated evaluation, and a production brief — all from your existing brief.
            </p>
            <Link href="/login" style={{
              display: 'inline-block', background: '#16a34a', color: 'white',
              padding: '0.625rem 1.25rem', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>
              Request access — no card required
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '2.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '10px' }}>S</span>
            </div>
            <span style={{ color: '#475569', fontSize: '13px' }}>Shortlist · gotshortlisted.com</span>
          </Link>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link href="/articles" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>Articles</Link>
            <Link href="/about" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>About</Link>
            <Link href="/login" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
