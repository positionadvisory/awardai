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

// Escape raw HTML before any markdown transformation (audit S9 — Session 50).
// Without this, HTML in article content goes straight into dangerouslySetInnerHTML:
// stored XSS on the public site. Escaping first means the ONLY tags in the output
// are the ones renderMarkdown itself emits (h1/h2/h3/p/strong/em).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Inline marks, applied to an ALREADY-ESCAPED line. Extracted verbatim from the
// old inline body of renderMarkdown so bold/italic behaviour is unchanged.
function renderInline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

// Very lightweight markdown → HTML converter for article body.
// Handles: headings (#, ##, ###), bold (**text**), italic (*text*), paragraphs,
// blank lines, blockquotes (> ) and unordered lists (- / * ).
// Input is HTML-escaped line by line BEFORE markdown is applied — do not remove.
// The emitted tag set is therefore exactly: h1 h2 h3 p strong em blockquote ul li.
//
// BLOCKQUOTE NOTE (S1, 2 Sep 2026): escapeHtml() runs first and turns '>' into
// '&gt;', so the blockquote marker is matched in its ESCAPED form ('&gt; ').
// This is deliberate: escapeHtml() and its position in the pipeline are the S9
// control and must not be reordered to make the raw marker visible.
function renderMarkdown(md: string): string {
  const out: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul>${listItems.map(li => `<li>${li}</li>`).join('')}</ul>`)
      listItems = []
    }
  }

  for (const rawLine of md.split('\n')) {
    const trimmed = escapeHtml(rawLine.trim())

    // Unordered list item — '- ' or '* ' followed by whitespace. Neither marker is
    // altered by escapeHtml. Requiring the space means '*emphasis*' at the start of
    // a line is still italic, not a list.
    const listItem = trimmed.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      listItems.push(renderInline(listItem[1]))
      continue
    }
    flushList()

    if (!trimmed) { out.push('<p style="margin:0"></p>'); continue }
    if (trimmed.startsWith('### ')) { out.push(`<h3>${trimmed.slice(4)}</h3>`); continue }
    if (trimmed.startsWith('## ')) { out.push(`<h2>${trimmed.slice(3)}</h2>`); continue }
    if (trimmed.startsWith('# ')) { out.push(`<h1>${trimmed.slice(2)}</h1>`); continue }
    // Blockquote — '&gt; ' is the escaped form of '> '. 5 characters.
    if (trimmed.startsWith('&gt; ')) { out.push(`<blockquote>${renderInline(trimmed.slice(5))}</blockquote>`); continue }

    out.push(`<p>${renderInline(trimmed)}</p>`)
  }
  flushList()

  return out.join('\n')
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

      {/* JSON-LD — < escape prevents </script> breakout from article fields (S9) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
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
          main blockquote { margin: 2rem 0; padding: 0.25rem 0 0.25rem 1.5rem; border-left: 3px solid rgba(34,197,94,0.5); color: #e2e8f0; font-size: 1.125rem; line-height: 1.7; font-style: normal; }
          main blockquote strong { color: #f1f5f9; }
          main ul { margin: 0 0 1.25rem; padding-left: 1.375rem; list-style: disc; }
          main ul li { margin: 0 0 0.5rem; padding-left: 0.25rem; }
          main ul li::marker { color: #22c55e; }
        `}</style>

        {/* Divider */}
        <div style={{ margin: '4rem 0 3rem', borderTop: '1px solid rgba(255,255,255,0.07)' }} />

        {/* ── CTA pair (S1, 2 Sep 2026) ────────────────────────────────────────
            Order is fixed: (a) Start free → platform signup, (b) Substack embed.
            Nothing else sits between them. The embed captures the email on the
            page instead of sending the reader off-site to subscribe. ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

          {/* (a) Start free */}
          <div>
            <Link href="/signup" style={{
              display: 'inline-block', background: '#16a34a', color: 'white',
              padding: '0.875rem 1.75rem', borderRadius: '10px',
              fontSize: '15px', fontWeight: 600, textDecoration: 'none',
            }}>
              Start free
            </Link>
          </div>

          {/* (b) Substack subscribe embed — sized for mobile first */}
          <div style={{ width: '100%' }}>
            <iframe
              src="https://shortlistawardsintelligence.substack.com/embed"
              title="Subscribe by email"
              width="100%"
              height="320"
              style={{
                display: 'block', width: '100%', maxWidth: '480px', height: '320px',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                background: 'white',
              }}
              frameBorder="0"
              scrolling="no"
              loading="lazy"
            />
          </div>

          {/* Social share — kept, moved below the CTA pair so the pair sits
              directly under the article body. */}
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
