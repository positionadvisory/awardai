// Noindex: an auth form is not a search result (SEO pass, 21 Oct 2026).
// /signup stays followable so the trial link still counts as a path.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
