// app/about/page.tsx
// About Ben — server component

import { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav, SiteFooter, Eyebrow } from '@/components/site/SiteChrome'

// 'About', not 'About — Shortlist': layout.tsx appends the '%s — Shortlist'
// template. openGraph.title is not templated and keeps the full form.
export const metadata: Metadata = {
  title: 'About',
  description: 'Ben Condit has spent 25 years in Asia across agency, brand, and media: from co-founding Upstart in Hong Kong to leading Mindshare China. Shortlist is his return to the entrepreneurial side.',
  openGraph: {
    title: 'About — Shortlist',
    description: 'Ben Condit has spent 25 years in Asia across agency, brand, and media.',
    url: 'https://gotshortlisted.com/about',
    siteName: 'Shortlist',
    type: 'profile',
  },
}

const TIMELINE = [
  { year: '2003', event: 'Co-founded Upstart, a digital marketing agency in Hong Kong' },
  { year: '2006', event: 'Guided Upstart through acquisition' },
  { year: '2008', event: 'Led regional digital strategy for adidas at Isobar during the Beijing Olympics' },
  { year: '2012', event: 'Joined Mindshare, beginning 13 years in the multinational world' },
  { year: '2020s', event: 'CEO of Mindshare China, the market\'s largest and most awarded media agency' },
  { year: 'Now', event: 'Founder of Shortlist, investor in sports and entertainment ventures across Asia' },
]

export default function AboutPage() {
  return (
    <div className="sl-shell">

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: 'Ben Condit',
            jobTitle: 'Founder, Shortlist',
            url: 'https://gotshortlisted.com/about',
            worksFor: {
              '@type': 'Organization',
              name: 'Shortlist',
              url: 'https://gotshortlisted.com',
            },
            description:
              'Ben Condit has spent 25 years in Asia building agencies, leading regional brands, and running large media operations. Shortlist is his return to the entrepreneurial side of the industry.',
          }),
        }}
      />

      <SiteNav active="about" />

      <style dangerouslySetInnerHTML={{ __html: `
        /* padding-TOP only: the shorthand would reset .sl-read's 24px side
           padding to 0 and slide the header out of line with the body. */
        .sl-ab-head { padding-top: clamp(56px, 8vw, 92px); }
        .sl-ab-h1 { font-size: clamp(40px, 7.6vw, 72px); line-height: 1.0; letter-spacing: -0.025em;
          color: var(--ink); margin: 22px 0 0; font-weight: 400; }
        .sl-ab-role { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--muted); margin: 18px 0 0; }
        .sl-ab-rule { margin: 30px 0 0; border-top: 2px solid var(--gold); }

        .sl-ab-photo { margin: clamp(32px, 5vw, 44px) 0 0; border: 1px solid var(--rule); }
        .sl-ab-photo img { display: block; width: 100%; height: clamp(240px, 42vw, 380px);
          object-fit: cover; object-position: center 20%; filter: saturate(0.9); }

        /* Timeline. The TNO report's .changelist: a hairline per row, a serif
           numeral in the gutter. Here the gutter carries the year rather than a
           counter, because the years are the content. */
        .sl-tl { margin: clamp(40px, 6vw, 60px) 0 0; }
        .sl-tl-row { display: grid; grid-template-columns: 92px 1fr; gap: 22px;
          padding: 18px 0; border-top: 1px solid var(--rule); align-items: baseline; }
        .sl-tl-row:last-child { border-bottom: 1px solid var(--rule); }
        .sl-tl-y { font-family: var(--meta-font); font-weight: 500; font-size: 20px;
          color: var(--gold-deep); line-height: 1.3; }
        .sl-tl-e { font-size: 17px; line-height: 1.6; color: var(--ink-2); margin: 0; }

        .sl-bio { margin: clamp(44px, 7vw, 64px) 0 0; font-size: 18px; line-height: 1.78; color: var(--ink-2); }
        .sl-bio p { margin: 0 0 1.15em; }
        .sl-bio p:last-child { margin-bottom: 0; }
        .sl-bio-lead { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(21px, 3vw, 26px); line-height: 1.45; color: var(--ink); margin: 0 0 1.1em; }

        .sl-ab-cta { margin: clamp(52px, 8vw, 76px) 0 0; background: var(--bone-2);
          border: 1px solid var(--rule); border-left: 4px solid var(--gold); padding: 30px 32px; }
        .sl-ab-cta-lead { font-family: var(--meta-font); font-style: italic;
          font-size: clamp(20px, 2.8vw, 24px); line-height: 1.42; color: var(--ink); margin: 14px 0 0; }
        .sl-ab-cta-sub { font-size: 15px; line-height: 1.6; color: var(--muted); margin: 12px 0 0; }
        .sl-ab-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 24px; }
        .sl-ab-btns a { text-decoration: none; font-size: 15px; font-weight: 600; padding: 16px 26px; }
        .sl-ab-btns .primary { background: var(--gold); color: var(--ink);
          display: inline-flex; align-items: center; gap: 14px; }
        .sl-ab-btns .primary i { display: inline-block; width: 18px; height: 1px; background: var(--ink); }
        .sl-ab-btns .ghost { border: 1px solid var(--rule); color: var(--ink); font-weight: 500; }
        .sl-ab-btns .ghost:hover { border-color: var(--gold); }

        @media (max-width: 560px) {
          .sl-tl-row { grid-template-columns: 74px 1fr; gap: 16px; }
          .sl-tl-y { font-size: 17px; }
          .sl-ab-cta { padding: 24px 22px; }
          .sl-ab-btns a { width: 100%; text-align: center; justify-content: center; }
        }
      ` }} />

      <main>
        <header className="sl-read sl-ab-head">
          <Eyebrow>About</Eyebrow>
          <h1 className="sl-serif sl-ab-h1">Ben Condit</h1>
          <div className="sl-mono sl-ab-role">Founder, Shortlist · Shanghai</div>
          <div className="sl-ab-rule" />
        </header>

        <div className="sl-read">
          <div className="sl-ab-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ben.jpg" alt="Ben Condit, founder of Shortlist" />
          </div>

          <div className="sl-tl">
            {TIMELINE.map(item => (
              <div key={item.year} className="sl-tl-row">
                <span className="sl-tl-y">{item.year}</span>
                <p className="sl-tl-e">{item.event}</p>
              </div>
            ))}
          </div>

          <div className="sl-bio">
            {/* COPY NOTE: the four paragraphs below are the shipped copy,
                unchanged, except that the lede is the first SENTENCE of the old
                paragraph one, lifted out and set in the serif. No wording was
                rewritten. The only other change is two em dashes replaced with
                a colon and a comma, per the standing no-em-dash rule. */}
            <p className="sl-bio-lead">
              Over the last 25 years in Asia, Ben has spent his career comfortably shifting between multinational scale and entrepreneurial chaos.
            </p>
            <p>
              He co-founded digital marketing agency Upstart in Hong Kong in 2003, guided it through an acquisition in 2006, led regional digital strategy for adidas at Isobar during the 2008 Beijing Olympics, and joined Mindshare in 2012.
            </p>
            <p>
              Most recently, Ben was CEO of Mindshare China, the market&apos;s largest and most awarded media agency. He spent 13 years navigating the multinational world: managing large teams, complex clients, and the particular pressure of representing work at global award shows where the writing is often more decisive than the work itself.
            </p>
            <p>
              After 13 years in the multinational world, Ben is currently enjoying a more flexible morning routine, walking his son to and from preschool, while returning to his entrepreneurial roots. In addition to launching Shortlist to help level the awards playing field for independent agencies, he invests in and launches sports and entertainment ventures across Asia.
            </p>
            <p>
              Shortlist is built from that specific experience: understanding how juries think, how Western eyes read Asian work, and what the difference is between an entry that shortlists and one that doesn&apos;t. The system is trained on professional experience and public award show guidance, not on client submissions.
            </p>
          </div>

          {/* "Request access →" is gone. Nothing on the marketing site gates
              anything, and the homepage primary CTA is "Start free trial". */}
          <div className="sl-ab-cta">
            <Eyebrow>Working on award entries?</Eyebrow>
            <p className="sl-ab-cta-lead">
              Shortlist is built for agencies and studios that know their work deserves to shortlist, and want the writing to match.
            </p>
            <p className="sl-ab-cta-sub">30+ shows. Unlimited entries. The judgment stays yours.</p>
            <div className="sl-ab-btns">
              <Link href="/signup" className="primary">Start free trial<i /></Link>
              <Link href="/articles" className="ghost">Read the articles</Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
