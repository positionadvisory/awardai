import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

// ── Global SEO / GEO metadata ────────────────────────────────────────────────
// Page-level metadata overrides these defaults via Next.js metadata cascade.
// JSON-LD structured data is added per-page (articles/[slug], about).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://gotshortlisted.com'),

  title: {
    default: 'Shortlist — AI awards intelligence for agencies',
    template: '%s — Shortlist',
  },

  description:
    'Shortlist is an awards intelligence system for agencies and studios. It reads your brief, recommends the best shows and categories, drafts entries calibrated to each jury, and evaluates them before you submit.',

  keywords: [
    'award entry writing',
    'awards intelligence',
    'Cannes Lions entry',
    'D&AD entry writing',
    'agency awards strategy',
    'AI copywriting for awards',
    'creative awards Asia',
    'Spikes Asia entry',
    'award show entry software',
    'jury criteria',
  ],

  authors: [{ name: 'Shortlist', url: 'https://gotshortlisted.com' }],

  openGraph: {
    type: 'website',
    siteName: 'Shortlist',
    title: 'Shortlist — AI awards intelligence for agencies',
    description:
      'Shortlist reads your brief, recommends shows, drafts entries, and evaluates them against jury criteria. Your scalable awards partner, operating 24/7/365.',
    url: 'https://gotshortlisted.com',
    locale: 'en_US',
    images: [
      {
        url: '/og-default.png',   // 1200×630 — add to /public/og-default.png
        width: 1200,
        height: 630,
        alt: 'Shortlist — AI awards intelligence for agencies',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Shortlist — AI awards intelligence for agencies',
    description:
      'Your scalable awards partner. Reads briefs, drafts entries, evaluates against jury criteria. 24/7/365.',
    images: ['/og-default.png'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },

  // Canonical handled per-page via metadata or layout
  alternates: {
    canonical: 'https://gotshortlisted.com',
  },
}

// ── JSON-LD — Site-wide organisation schema ───────────────────────────────────
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Shortlist',
  url: 'https://gotshortlisted.com',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Shortlist is an awards intelligence system for marketing agencies. It generates show-specific entry drafts, evaluates them against real jury criteria, and produces production briefs for case study films.',
  offers: [
    { '@type': 'Offer', name: 'Agency', price: '149', priceCurrency: 'USD', billingIncrement: 'P1M' },
    { '@type': 'Offer', name: 'Studio', price: '349', priceCurrency: 'USD', billingIncrement: 'P1M' },
    { '@type': 'Offer', name: 'Enterprise', price: '599', priceCurrency: 'USD', billingIncrement: 'P1M' },
  ],
  author: {
    '@type': 'Person',
    name: 'Ben Condit',
    url: 'https://gotshortlisted.com/about',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className={`${inter.className} bg-gray-100 antialiased overflow-x-hidden`}>
        {children}
      </body>
    </html>
  )
}
