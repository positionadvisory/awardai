// app/articles/[slug]/page.tsx
// Individual article — server component with full SEO + JSON-LD structured data

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { SiteNav, SiteFooter, Eyebrow } from '@/components/site/SiteChrome'

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

// Drop a leading '# Title' line when it repeats the article's own title.
//
// Every copy-locked article opens with its own '# Title' line, so renderMarkdown
// emitted an <h1> underneath the page's title <h1>: two h1s on every article,
// measured on the W6 render in S1 and again here on a 16-row harness. The S1
// record put the fix on S2 as "strip the leading '# ' line from all 16 bodies",
// by hand, sixteen times. That is the shape of job that gets forgotten once and
// then ships, so it is done here instead and S2 can paste bodies untouched.
//
// Deliberately narrow: the FIRST non-empty line only, only when it is an h1, and
// only when its text matches this article's title. A body whose first heading is
// a real, different h1 is left alone. renderMarkdown() and the escapeHtml()
// ordering in front of it are untouched — this runs before either.
//
// The comparison ignores case, whitespace, markdown marks AND punctuation. The
// punctuation part is not cosmetic: run against the seven copy-locked bodies,
// a title typed without its trailing '?' or its '...' missed on four of seven
// (W1, W3, W4, W8), and a miss is silent — you get the duplicate h1 back with
// no error. Whoever pastes should not have to reproduce punctuation exactly.
// Ignoring it cannot cause a false strip: a leading h1 that equals the title
// apart from punctuation IS the title.
function stripDuplicateTitle(content: string, title: string): string {
  const lines = content.split('\n')
  const i = lines.findIndex(l => l.trim() !== '')
  if (i === -1) return content
  const first = lines[i].trim()
  if (!first.startsWith('# ')) return content
  // ASCII punctuation plus curly quotes, en/em dash and ellipsis. Written as an
  // explicit punctuation list rather than \p{L}\p{N} with the /u flag, because
  // tsconfig sets no `target` and so defaults below es6 (TS1501). A positive
  // list also leaves accented and non-Latin letters intact, which /[^A-Za-z0-9]/
  // would strip.
  const PUNCT = /[!-\/:-@\[-\x60{-~–—‘’“”…]/g
  const norm = (s: string) =>
    s.replace(PUNCT, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (norm(first.slice(2)) !== norm(title)) return content
  return lines.slice(i + 1).join('\n')
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug)
  if (!article) notFound()

  const bodyHtml = renderMarkdown(stripDuplicateTitle(article.content, article.title))

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
    <div className="sl-shell">

      {/* JSON-LD — < escape prevents </script> breakout from article fields (S9) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <SiteNav active="articles" />

      {/* Reading-page CSS. The measure is 720px, up from 680: the body face is
          Geist at 18px rather than Inter at 16px, and the old measure ran short
          of the ~70-character line a long read wants. */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* padding-TOP, never the shorthand. A "padding: X 0 0" on an element
           that also carries .sl-read resets the 24px side padding to 0, which
           slid the whole header 24px left of the body on desktop and ran it
           flush to the screen edge on a phone. Caught in the 1440px render.
           (This block is a template literal, so no backticks in here either.) */
        .sl-art-head { padding-top: clamp(56px, 8vw, 88px); }
        .sl-art-h1 { font-size: clamp(34px, 6.4vw, 56px); line-height: 1.06; letter-spacing: -0.02em;
          color: var(--ink); margin: 22px 0 0; font-weight: 400; }
        .sl-art-dek { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(19px, 2.6vw, 23px); line-height: 1.5; color: var(--muted);
          margin: 18px 0 0; max-width: 34em; }
        .sl-art-rule { margin: 30px 0 16px; border-top: 2px solid var(--gold); }
        .sl-art-meta { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--muted); display: flex; flex-wrap: wrap; gap: 14px; }
        .sl-art-cover { margin: clamp(36px, 6vw, 56px) 0 0; border: 1px solid var(--rule); }
        .sl-art-cover img { display: block; width: 100%; height: auto; }

        /* ── Body ──────────────────────────────────────────────────────────
           Scoped to .sl-article, not to main, so nothing here can reach the
           nav, the footer or the CTA block. */
        .sl-article { margin-top: clamp(36px, 6vw, 52px); font-size: 18px; line-height: 1.78; color: var(--ink-2); }
        .sl-article h1, .sl-article h2, .sl-article h3 {
          font-family: "Instrument Serif", "Times New Roman", serif; font-weight: 400;
          letter-spacing: -0.015em; color: var(--ink); }
        .sl-article h1 { font-size: clamp(28px, 4.6vw, 38px); line-height: 1.14; margin: 2.6em 0 0.5em; }
        .sl-article h2 { font-size: clamp(25px, 4vw, 33px); line-height: 1.18; margin: 2.2em 0 0.5em;
          padding-top: 1.1em; border-top: 1px solid var(--rule); }
        .sl-article h3 { font-size: clamp(21px, 3.2vw, 25px); line-height: 1.25; margin: 1.9em 0 0.4em; }
        .sl-article h1:first-child, .sl-article h2:first-child, .sl-article h3:first-child { margin-top: 0; }
        .sl-article h2:first-child { padding-top: 0; border-top: none; }
        .sl-article p { margin: 0 0 1.15em; }
        .sl-article strong { color: var(--ink); font-weight: 600; }
        .sl-article em { font-style: italic; }
        .sl-article a { color: var(--gold-deep); text-decoration: underline; text-underline-offset: 3px;
          text-decoration-thickness: 1px; }
        .sl-article a:hover { color: var(--ink); }
        .sl-article blockquote { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(21px, 3.2vw, 26px); line-height: 1.44; color: var(--ink);
          margin: 1.8em 0; padding-left: 1.4rem; border-left: 3px solid var(--gold); }
        .sl-article blockquote strong { font-weight: 600; }
        .sl-article ul { margin: 0 0 1.3em; padding-left: 1.3rem; list-style: disc; }
        .sl-article ul li { margin: 0 0 0.45em; padding-left: 0.3rem; }
        .sl-article ul li::marker { color: var(--gold-deep); }

        /* ── Closing CTA ──────────────────────────────────────────────────
           The TNO report's .product callout in homepage tokens: bone-2 plate,
           4px gold left edge, EB Garamond italic lead, radius 0. S1 shipped a
           bare button with no supporting line; the line here is the homepage's
           own, verbatim, so it promises exactly what the site promises. */
        .sl-cta { margin: clamp(52px, 8vw, 76px) 0 0; background: var(--bone-2);
          border: 1px solid var(--rule); border-left: 4px solid var(--gold); padding: 30px 32px; }
        .sl-cta-lead { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(20px, 2.8vw, 24px); line-height: 1.42; color: var(--ink); margin: 14px 0 0; }
        .sl-cta-sub { font-size: 15px; line-height: 1.6; color: var(--muted); margin: 12px 0 0; }
        .sl-cta-btn { display: inline-flex; align-items: center; gap: 14px; margin-top: 24px;
          padding: 16px 26px; background: var(--gold); color: var(--ink); text-decoration: none;
          font-size: 15px; font-weight: 600; }
        .sl-cta-btn i { display: inline-block; width: 18px; height: 1px; background: var(--ink); }
        @media (max-width: 560px) {
          .sl-cta { padding: 24px 22px; }
          .sl-cta-btn { width: 100%; justify-content: center; }
        }

        .sl-sub { margin: clamp(36px, 6vw, 48px) 0 0; }
        .sl-sub iframe { display: block; width: 100%; max-width: 480px; height: 320px;
          border: 1px solid var(--rule); background: var(--paper); }

        .sl-share { margin: clamp(36px, 6vw, 48px) 0 0; padding-top: 26px; border-top: 1px solid var(--rule); }
        .sl-share-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .sl-share-row a { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--muted); border: 1px solid var(--rule); padding: 10px 14px; text-decoration: none; }
        .sl-share-row a:hover { border-color: var(--gold); color: var(--ink); }
      ` }} />

      <article>
        <header className="sl-read sl-art-head">
          <Eyebrow>Articles</Eyebrow>

          <h1 className="sl-serif sl-art-h1">{article.title}</h1>

          {article.subtitle && <p className="sl-art-dek">{article.subtitle}</p>}

          <div className="sl-art-rule" />
          <div className="sl-mono sl-art-meta">
            <span>{formatDate(article.published_at)}</span>
            <span>{article.reading_time_minutes} min read</span>
            <span>Ben Condit</span>
          </div>
        </header>

        {article.cover_image_url && (
          <div className="sl-read">
            <div className="sl-art-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.cover_image_url} alt={article.title} />
            </div>
          </div>
        )}

        {/* Article body. renderMarkdown() and the escapeHtml() ordering in front
            of it are the S9 control and are untouched by this pass: everything
            that changed above is CSS. */}
        <div
          className="sl-read sl-article"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* ── CTA pair (S1, 2 Sep 2026) ────────────────────────────────────────
            Order is fixed: (a) Start free trial → platform signup, (b) Substack
            embed. Nothing else sits between them. The embed captures the email
            on the page instead of sending the reader off-site to subscribe.
            "Start free" became "Start free trial" (S2-prep): the homepage
            primary CTA reads "Start free trial", and the truncation drifted
            toward implying a free tier, which is the thing the standing
            no-free-tier rule exists to prevent. ── */}
        <div className="sl-read">
          <div className="sl-cta">
            {/* COPY: every line in this block is lifted verbatim from the
                homepage. The eyebrow is the hero eyebrow, the lead is the hero
                h1, the subline is the hero subline, and the button is the hero
                primary CTA. Nothing here is newly written, so nothing here can
                promise something the site does not. */}
            <Eyebrow>Awards intelligence, built by someone who ran one</Eyebrow>
            <p className="sl-cta-lead">
              Your final edit, brought forward as fast as possible.
            </p>
            <p className="sl-cta-sub">30+ shows. Unlimited entries. The judgment stays yours.</p>
            <Link href="/signup" className="sl-cta-btn">
              Start free trial
              <i />
            </Link>
          </div>

          <div className="sl-sub">
            <iframe
              src="https://shortlistawardsintelligence.substack.com/embed"
              title="Subscribe by email"
              width="100%"
              height="320"
              frameBorder="0"
              scrolling="no"
              loading="lazy"
            />
          </div>

          {/* Social share — kept, below the CTA pair so the pair sits directly
              under the article body. */}
          <div className="sl-share">
            <Eyebrow>Share this article</Eyebrow>
            <div className="sl-share-row">
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
                  className="sl-mono"
                >
                  {btn.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </article>

      <SiteFooter />
    </div>
  )
}
