// app/about/page.tsx
// About Ben — server component

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About — Shortlist',
  description: 'Ben Condit has spent 25 years in Asia across agency, brand, and media — from co-founding Upstart in Hong Kong to leading Mindshare China. Shortlist is his return to the entrepreneurial side.',
  openGraph: {
    title: 'About — Shortlist',
    description: 'Ben Condit has spent 25 years in Asia across agency, brand, and media.',
    url: 'https://gotshortlisted.com/about',
    siteName: 'Shortlist',
    type: 'profile',
  },
}

export default function AboutPage() {
  return (
    <div style={{ background: '#0b1120', minHeight: '100vh', color: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>

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
            <Link href="/articles" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>Articles</Link>
            <Link href="/login" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>Sign in</Link>
            <Link href="/login" style={{
              background: '#16a34a', color: 'white', padding: '0.5rem 1.125rem',
              borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>Request access</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '80px 1.5rem 100px' }}>

        {/* Label */}
        <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          About
        </span>

        {/* Name */}
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', marginBottom: '2.5rem', color: '#f1f5f9', lineHeight: 1.2 }}>
          Ben Condit
        </h1>

        {/* Timeline highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginBottom: '3rem', borderLeft: '2px solid rgba(34,197,94,0.2)', paddingLeft: '1.5rem' }}>
          {[
            { year: '2003', event: 'Co-founded Upstart, a digital marketing agency in Hong Kong' },
            { year: '2006', event: 'Guided Upstart through acquisition' },
            { year: '2008', event: 'Led regional digital strategy for adidas at Isobar during the Beijing Olympics' },
            { year: '2012', event: 'Joined Mindshare, beginning 13 years in the multinational world' },
            { year: '2020s', event: 'CEO of Mindshare China — the market\'s largest and most awarded media agency' },
            { year: 'Now', event: 'Founder of Shortlist, investor in sports and entertainment ventures across Asia' },
          ].map(item => (
            <div key={item.year} style={{ display: 'flex', gap: '1.25rem', paddingBottom: '1.75rem', alignItems: 'flex-start' }}>
              <span style={{
                color: '#22c55e', fontSize: '12px', fontWeight: 600,
                minWidth: '42px', paddingTop: '2px', letterSpacing: '0.02em',
              }}>
                {item.year}
              </span>
              <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>{item.event}</p>
            </div>
          ))}
        </div>

        {/* Bio paragraphs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3.5rem' }}>
          <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.8, margin: 0 }}>
            Over the last 25 years in Asia, Ben has spent his career comfortably shifting between multinational scale and entrepreneurial chaos. He co-founded digital marketing agency Upstart in Hong Kong in 2003, guided it through an acquisition in 2006, led regional digital strategy for adidas at Isobar during the 2008 Beijing Olympics, and joined Mindshare in 2012.
          </p>
          <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.8, margin: 0 }}>
            Most recently, Ben was CEO of Mindshare China, the market's largest and most awarded media agency. He spent 13 years navigating the multinational world — managing large teams, complex clients, and the particular pressure of representing work at global award shows where the writing is often more decisive than the work itself.
          </p>
          <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.8, margin: 0 }}>
            After 13 years in the multinational world, Ben is currently enjoying a more flexible morning routine, walking his son to and from preschool, while returning to his entrepreneurial roots. In addition to launching Shortlist to help level the awards playing field for independent agencies, he invests in and launches sports and entertainment ventures across Asia.
          </p>
          <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.8, margin: 0 }}>
            Shortlist is built from that specific experience: understanding how juries think, how Western eyes read Asian work, and what the difference is between an entry that shortlists and one that doesn't. The system is trained on professional experience and public award show guidance — not on client submissions.
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0 0 3rem' }} />

        {/* CTA */}
        <div style={{
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
          borderRadius: '16px', padding: '2rem',
        }}>
          <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '1rem', margin: '0 0 0.5rem' }}>
            Working on award entries?
          </p>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
            Shortlist is built for agencies and studios that know their work deserves to shortlist — and want the writing to match.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              display: 'inline-block', background: '#16a34a', color: 'white',
              padding: '0.625rem 1.25rem', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>
              Request access →
            </Link>
            <Link href="/articles" style={{
              display: 'inline-block', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '0.625rem 1.25rem', borderRadius: '8px',
              fontSize: '14px', textDecoration: 'none',
            }}>
              Read the articles
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
            <Link href="/login" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
