// Noindex: each /indie/r/<token> page is one entrant's private read. The token
// is the only access control, so the page must never enter a search index
// (SEO pass, 21 Oct 2026). Deliberately NOT disallowed in robots.ts: a crawler
// has to fetch the page to see this tag.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function IndieReadLayout({ children }: { children: React.ReactNode }) {
  return children
}
