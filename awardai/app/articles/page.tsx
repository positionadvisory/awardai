// app/articles/page.tsx
// Public articles listing — server component, SEO-friendly

import { Fragment } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { SiteNav, SiteFooter, Eyebrow } from '@/components/site/SiteChrome'

// ISR (S1, 2 Sep 2026). Without this the listing is prerendered ONCE at build
// time: a newly published article never appears until someone redeploys, which
// would have silently broken the S2 library paste. 60s keeps the page static and
// fast while making a new article show up on its own. The article page itself is
// already dynamic (no generateStaticParams), so only this listing was stale.
export const revalidate = 60

// TITLE (S2-prep, 2 Sep 2026): this is 'Articles', not 'Articles — Shortlist'.
// layout.tsx sets template: '%s — Shortlist', so the old value rendered
// "Articles — Shortlist — Shortlist" in the browser tab. openGraph.title is not
// run through the template and keeps its own full form.
export const metadata: Metadata = {
  title: 'Articles',
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

// Plate stamp for a row with no cover image: "SEP / 26". It varies row to row,
// which is the whole point — 16 identical marks would rebuild the wall this
// layout exists to break.
function stamp(iso: string): { m: string; y: string } {
  const d = new Date(iso)
  return {
    m: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    y: String(d.getFullYear()).slice(2),
  }
}

export default async function ArticlesPage() {
  const articles = await getArticles()

  return (
    <div className="sl-shell">
      <SiteNav active="articles" />

      {/* Listing CSS.
          The S1 render of 16 seeded rows measured 3,028px of scroll on desktop
          and 3,497px on mobile as 16 identical ~114px rows, with no grouping and
          nothing for the eye to stop on. Three things fix that here, in order of
          how much they buy:
          1. cover_image_url is RENDERED. The listing query already selected it
             and the page threw it away; the covers exist in Posts/Articles/Headers/.
          2. Year separators, so a 16-piece library reads as a library.
          3. A fixed-height left cell on every row — a cover, or a stamped plate
             when there is no cover — so the vertical rhythm no longer depends on
             whether a given article happens to carry a subtitle. Two of the 16
             did not, and it showed. */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* padding-TOP only: the shorthand would reset .sl-read's 24px side
           padding to 0 and slide the header out of line with the rows. */
        .sl-list-head { padding-top: clamp(56px, 8vw, 92px); }
        .sl-list-h1 { font-size: clamp(38px, 7.2vw, 68px); line-height: 1.02; letter-spacing: -0.025em;
          color: var(--ink); margin: 22px 0 0; font-weight: 400; }
        .sl-list-h1 i { font-style: italic; color: var(--gold-deep); }
        .sl-list-dek { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(19px, 2.6vw, 23px); line-height: 1.5; color: var(--muted);
          margin: 20px 0 0; max-width: 32em; }
        .sl-list-rule { margin: 34px 0 0; border-top: 2px solid var(--gold); }

        .sl-list { margin: clamp(30px, 5vw, 44px) 0 0; }

        .sl-year { display: flex; align-items: center; gap: 16px; padding: 30px 0 10px; }
        .sl-year span { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
        .sl-year i { flex: 1 1 auto; height: 1px; background: var(--rule); }

        /* 148x88 plate + 20px padding puts a row at ~130px against the old
           ~114px. The extra 16px buys the cover, the stamp and a serif title;
           16 rows still land inside the old total because the year rules
           replace the dead space the old list padded with. */
        .sl-row { display: grid; grid-template-columns: 148px 1fr; gap: 26px; align-items: start;
          padding: 20px 0; border-top: 1px solid var(--rule); text-decoration: none; color: inherit; }
        .sl-list > .sl-row:last-child { border-bottom: 1px solid var(--rule); }
        .sl-row:hover .sl-row-t { color: var(--gold-deep); }
        .sl-row:hover .sl-plate { background: var(--ink-2); }

        .sl-thumb { width: 148px; height: 88px; overflow: hidden; border: 1px solid var(--rule); background: var(--bone-2); }
        .sl-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }

        .sl-plate { width: 148px; height: 88px; background: var(--ink); color: var(--gold);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; transition: background 160ms ease; }
        .sl-plate b { font-family: var(--meta-font); font-weight: 500; font-size: 15px; letter-spacing: 0.22em;
          text-indent: 0.22em; }
        .sl-plate em { font-family: var(--meta-font); font-style: normal; font-size: 26px; line-height: 1;
          color: var(--bone); }

        .sl-row-t { font-size: clamp(21px, 2.9vw, 27px); line-height: 1.18; letter-spacing: -0.015em;
          color: var(--ink); margin: 0; font-weight: 400; transition: color 160ms ease; }
        .sl-row-s { font-size: 15px; line-height: 1.58; color: var(--muted); margin: 9px 0 0; max-width: 46em; }
        .sl-row-m { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
          margin: 14px 0 0; display: flex; gap: 14px; flex-wrap: wrap; }

        .sl-empty { padding: 72px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
          font-family: var(--meta-font); font-style: italic; font-size: 21px; color: var(--muted); }

        @media (max-width: 560px) {
          .sl-row { grid-template-columns: 92px 1fr; gap: 18px; padding: 20px 0; }
          .sl-thumb, .sl-plate { width: 92px; height: 72px; }
          .sl-plate b { font-size: 11px; }
          .sl-plate em { font-size: 19px; }
          .sl-row-s { display: none; }
        }
      ` }} />

      <main>
        <header className="sl-read sl-list-head">
          <Eyebrow>Edition 01 · Asia</Eyebrow>
          <h1 className="sl-serif sl-list-h1">
            On awards, writing,<br /><i>and winning.</i>
          </h1>
          <p className="sl-list-dek">
            Practical writing on award entries, jury thinking, and how to get more from the same work. By Ben Condit.
          </p>
          <div className="sl-list-rule" />
        </header>

        <div className="sl-read">
          {articles.length === 0 ? (
            <div className="sl-list">
              <p className="sl-empty">No articles yet. Check back soon.</p>
            </div>
          ) : (
            <div className="sl-list">
              {articles.map((article, i) => {
                const year = new Date(article.published_at).getFullYear()
                const prevYear = i === 0 ? null : new Date(articles[i - 1].published_at).getFullYear()
                const s = stamp(article.published_at)
                return (
                  // Fragment, not a wrapper div with display:contents. Selectors
                  // match the DOM tree, not the box tree, so a wrapper would
                  // break `.sl-list > .sl-row:last-child` even though the boxes
                  // look right on screen.
                  <Fragment key={article.id}>
                    {year !== prevYear && (
                      <div className="sl-year">
                        <span className="sl-mono">{year}</span>
                        <i />
                      </div>
                    )}
                    <Link href={`/articles/${article.slug}`} className="sl-row">
                      {article.cover_image_url ? (
                        <div className="sl-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={article.cover_image_url} alt="" />
                        </div>
                      ) : (
                        <div className="sl-plate" aria-hidden="true">
                          <b>{s.m}</b>
                          <em>{s.y}</em>
                        </div>
                      )}
                      <div>
                        <h2 className="sl-serif sl-row-t">{article.title}</h2>
                        {article.subtitle && <p className="sl-row-s">{article.subtitle}</p>}
                        <div className="sl-mono sl-row-m">
                          <span>{formatDate(article.published_at)}</span>
                          <span>{article.reading_time_minutes} min read</span>
                        </div>
                      </div>
                    </Link>
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
