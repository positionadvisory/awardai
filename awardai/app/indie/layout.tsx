// Metadata for the public /indie landing (SEO pass, 21 Oct 2026). page.tsx is
// a client component and cannot export metadata, so until now /indie showed the
// homepage's title and description in search results and link previews.
// Description restates LANDING_SUB in lib/indie-copy.ts; keep the two in step.
// Scope: /indie only. /indie/r/[token] has its own noindex layout, which wins.
import type { Metadata } from 'next'

const TITLE = 'Free read on your Indie Awards entry'
const DESC = 'Paste your Indie Awards entry and get a read on how each scored section is holding up, plus the three changes most worth making. Under a minute, one free read per entry, no account needed.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: '/indie' },
  openGraph: {
    title: `${TITLE} — Shortlist`,
    description: DESC,
    url: '/indie',
    siteName: 'Shortlist',
    type: 'website',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Shortlist: a free read on your Indie Awards entry' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESC,
    images: ['/og-default.png'],
  },
}

export default function IndieLayout({ children }: { children: React.ReactNode }) {
  return children
}
