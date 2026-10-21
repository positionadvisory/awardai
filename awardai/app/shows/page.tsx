// app/shows/page.tsx: public award show dates (SEO pass, 21 Oct 2026).
//
// One page, not one per show: 24 verified rows carry dates and little else we
// can publish today (see lib/public-shows.ts for what is held back and why), and
// one maintained calendar beats two dozen thin pages. Each show has an anchor
// (/shows#clio-awards) so it can be linked and cited directly.
//
// Dates come live from DEADLINES_2026. Which cycle a date belongs to is decided
// at render against today's date, so ISR is hourly: a deadline that passes moves
// from "Next deadline" to "Last cycle" within the hour, with no redeploy.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav, SiteFooter, Eyebrow } from '@/components/site/SiteChrome'
import { DEADLINES_2026, type ShowDeadline } from '@/lib/shows-data'
import { PUBLIC_SHOWS, NOT_PUBLIC } from '@/lib/public-shows'

export const revalidate = 3600

const SITE = 'https://www.gotshortlisted.com'
const DESC = 'Entry deadlines and ceremony dates for advertising, media, effectiveness and PR award shows, from Cannes Lions and D&AD to Spikes Asia and the Smarties. Each date checked against the organizer\'s own site, with the date we checked it.'

export const metadata: Metadata = {
  title: 'Award show deadlines and dates, 2026 to 2027',
  description: DESC,
  alternates: { canonical: '/shows' },
  openGraph: {
    title: 'Award show deadlines and dates, 2026 to 2027 — Shortlist',
    description: DESC,
    url: '/shows',
    siteName: 'Shortlist',
    type: 'website',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Shortlist: award show deadlines and dates' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Award show deadlines and dates, 2026 to 2027',
    description: DESC,
    images: ['/og-default.png'],
  },
}

// ISO 'YYYY-MM-DD' -> '9 April 2026'. Formatted in UTC: a bare ISO date parses
// as UTC midnight, and formatting it in a western server timezone would print
// the day before.
function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

type Row = ShowDeadline & { slug: string; source: string; publicNote?: string }

export default function ShowsPage() {
  const today = new Date().toISOString().slice(0, 10)

  const rows: Row[] = DEADLINES_2026
    .filter(d => d.confidence === 'verified' && PUBLIC_SHOWS[d.show])
    .map(d => ({ ...d, slug: PUBLIC_SHOWS[d.show].slug, source: PUBLIC_SHOWS[d.show].source, publicNote: PUBLIC_SHOWS[d.show].note }))

  const upcoming = rows.filter(r => r.finalDate && r.finalDate >= today).sort((a, b) => a.finalDate.localeCompare(b.finalDate))
  const unpublished = rows.filter(r => !r.finalDate)
  const closed = rows.filter(r => r.finalDate && r.finalDate < today).sort((a, b) => a.finalDate.localeCompare(b.finalDate))

  const listed = new Set(rows.map(r => r.show))
  const alsoTracked = DEADLINES_2026
    .map(d => d.show)
    .filter(s => !listed.has(s) && !NOT_PUBLIC.has(s))
    .sort((a, b) => a.localeCompare(b))
  const trackedCount = listed.size + alsoTracked.length

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Award show deadlines and dates, 2026 to 2027',
    description: DESC,
    url: `${SITE}/shows`,
    inLanguage: 'en-US',
    publisher: { '@id': `${SITE}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rows.length,
      itemListElement: [...upcoming, ...unpublished, ...closed].map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: r.show,
        url: `${SITE}/shows#${r.slug}`,
      })),
    },
  }

  const Card = ({ r, kind }: { r: Row; kind: 'upcoming' | 'unpublished' | 'closed' }) => (
    <section id={r.slug} className="sh-card">
      <div className="sh-card-top">
        <h3 className="sl-serif sh-name">{r.show}</h3>
        <span className="sl-mono sh-region">{r.region}</span>
      </div>
      <dl className="sh-dl">
        {kind === 'upcoming' && <><dt>Next entry deadline</dt><dd className="sh-strong">{fmt(r.finalDate)}</dd></>}
        {kind === 'closed' && <><dt>Entries closed</dt><dd>{fmt(r.finalDate)}</dd></>}
        {kind === 'unpublished' && <><dt>Next entry deadline</dt><dd>Not yet published by the organizer</dd></>}
        {r.ceremonyDate && (
          <><dt>{r.ceremonyDate >= today ? 'Ceremony' : 'Last ceremony'}</dt><dd>{fmt(r.ceremonyDate)}</dd></>
        )}
      </dl>
      {r.publicNote && <p className="sh-note">{r.publicNote}</p>}
      <p className="sl-mono sh-meta">
        Checked {fmt(r.lastVerified)} ·{' '}
        <a href={r.source} target="_blank" rel="noopener noreferrer">Organizer&apos;s page</a>
      </p>
    </section>
  )

  return (
    <div className="sl-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <SiteNav active="shows" />

      <style dangerouslySetInnerHTML={{ __html: `
        .sh-head { padding-top: clamp(56px, 8vw, 92px); }
        .sh-h1 { font-size: clamp(36px, 6.6vw, 62px); line-height: 1.04; letter-spacing: -0.025em;
          color: var(--ink); margin: 22px 0 0; font-weight: 400; }
        .sh-h1 i { font-style: italic; color: var(--gold-deep); }
        .sh-dek { font-family: var(--meta-font); font-style: italic; font-size: clamp(18px, 2.4vw, 22px);
          line-height: 1.5; color: var(--muted); margin: 20px 0 0; max-width: 34em; }
        .sh-rule { margin: 34px 0 0; border-top: 2px solid var(--gold); }
        .sh-h2 { display: flex; align-items: center; gap: 16px; padding: 40px 0 6px; margin: 0; }
        .sh-h2 span { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
        .sh-h2 i { flex: 1 1 auto; height: 1px; background: var(--rule); }
        .sh-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; }
        .sh-card { padding: 22px 0; border-top: 1px solid var(--rule); scroll-margin-top: 80px; }
        .sh-card:target { background: var(--bone-2); }
        .sh-card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
        .sh-name { font-size: clamp(21px, 2.6vw, 25px); line-height: 1.2; margin: 0; font-weight: 400; color: var(--ink); }
        .sh-region { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
        .sh-dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 14px 0 0; font-size: 15px; }
        .sh-dl dt { color: var(--muted); }
        .sh-dl dd { margin: 0; color: var(--ink-2); }
        .sh-strong { font-weight: 600; color: var(--ink) !important; }
        .sh-note { font-size: 14px; line-height: 1.6; color: var(--ink-2); margin: 12px 0 0; }
        .sh-meta { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 14px 0 0; }
        .sh-meta a { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
        .sh-also { font-size: 15px; line-height: 1.7; color: var(--ink-2); margin: 14px 0 0; }
        .sh-cta { margin: 48px 0 0; padding: 28px 0; border-top: 2px solid var(--gold); font-size: 17px; line-height: 1.6; color: var(--ink-2); }
        .sh-cta a { color: var(--ink); font-weight: 600; }
        @media (max-width: 720px) { .sh-grid { grid-template-columns: 1fr; } }
      ` }} />

      <main>
        <header className="sl-read sh-head">
          <Eyebrow>Show dates</Eyebrow>
          <h1 className="sl-serif sh-h1">
            Award show deadlines,<br /><i>checked at the source.</i>
          </h1>
          <p className="sh-dek">
            Entry deadlines and ceremony dates for {rows.length} advertising, media, effectiveness and PR award shows. Every date was checked against the organizer&apos;s own site, and each show says when. Organizers move dates, so confirm on their page before you commit a fee.
          </p>
          <div className="sh-rule" />
        </header>

        <div className="sl-read">
          {upcoming.length > 0 && (
            <>
              <h2 className="sh-h2"><span className="sl-mono">Next deadlines</span><i /></h2>
              <div className="sh-grid">{upcoming.map(r => <Card key={r.show} r={r} kind="upcoming" />)}</div>
            </>
          )}

          {unpublished.length > 0 && (
            <>
              <h2 className="sh-h2"><span className="sl-mono">Next cycle not yet dated</span><i /></h2>
              <div className="sh-grid">{unpublished.map(r => <Card key={r.show} r={r} kind="unpublished" />)}</div>
            </>
          )}

          {closed.length > 0 && (
            <>
              <h2 className="sh-h2"><span className="sl-mono">Entries closed, by deadline</span><i /></h2>
              <p className="sh-also">
                Entries have closed for the cycle shown. The next cycle&apos;s dates are not yet confirmed here; the last deadline is usually the best guide to when the next one falls.
              </p>
              <div className="sh-grid">{closed.map(r => <Card key={r.show} r={r} kind="closed" />)}</div>
            </>
          )}

          {alsoTracked.length > 0 && (
            <>
              <h2 className="sh-h2"><span className="sl-mono">Also tracked in Shortlist</span><i /></h2>
              <p className="sh-also">
                Shortlist tracks {trackedCount} shows. Dates for these are still being confirmed against the organizer, so they are not listed here yet: {alsoTracked.join(', ')}.
              </p>
            </>
          )}

          <div className="sh-cta">
            Inside Shortlist, the deadline calendar flags every tracked show by urgency, and the jury intelligence sets out what a show&apos;s jury rewards and the mistakes that kill entries. <Link href="/signup">Start a 7-day trial</Link> or read <Link href="/articles">the articles</Link>.
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
