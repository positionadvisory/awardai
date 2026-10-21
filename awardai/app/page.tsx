// app/page.tsx: homepage route. Server component so it can export metadata.
// The page body is the client component in components/home/HomePage.tsx, moved
// there unchanged in behavior on 21 Oct 2026 (SEO pass): a 'use client' page
// cannot export metadata, so the homepage had no canonical of its own and only
// inherited the layout's, which was wrong for every other page.
import type { Metadata } from 'next'
import HomePage from '@/components/home/HomePage'

export const metadata: Metadata = {
  // openGraph is NOT set here on purpose: a page-level openGraph replaces the
  // layout's whole object (title, image and all), it does not merge into it.
  alternates: { canonical: '/' },
}

export default function Page() {
  return <HomePage />
}
