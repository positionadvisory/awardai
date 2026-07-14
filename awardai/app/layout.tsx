import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })

// ── Global SEO / GEO metadata ────────────────────────────────────────────────
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://gotshortlisted.com'),

  title: {
    default: 'Shortlist — Awards intelligence, built by someone who ran one',
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
    title: 'Shortlist — Awards intelligence, built by someone who ran one',
    description:
      'Shortlist reads your brief, recommends shows, drafts entries, and evaluates them against jury criteria. Your scalable awards partner, operating 24/7/365.',
    url: 'https://gotshortlisted.com',
    locale: 'en_US',
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'Shortlist — Awards intelligence, built by someone who ran one',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Shortlist — Awards intelligence, built by someone who ran one',
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
    { '@type': 'Offer', name: 'Studio', price: '149', priceCurrency: 'USD', billingIncrement: 'P1M' },
    { '@type': 'Offer', name: 'Agency', price: '299', priceCurrency: 'USD', billingIncrement: 'P1M' },
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
        {/* Google Fonts — loaded for homepage design system */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        {/* CSS design tokens — homepage uses var(--ink), var(--gold), etc.
            Internal app pages are unaffected (they use Tailwind utilities only). */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --ink: oklch(0.18 0.02 155);
            --ink-2: oklch(0.26 0.035 155);
            --green: oklch(0.24 0.045 155);
            --green-deep: oklch(0.18 0.04 158);
            --bone: oklch(0.965 0.008 85);
            --bone-2: oklch(0.93 0.012 85);
            --paper: oklch(0.985 0.005 85);
            --rule: oklch(0.86 0.01 85);
            --rule-dark: oklch(0.32 0.03 155);
            --gold: oklch(0.78 0.13 78);
            --gold-deep: oklch(0.66 0.13 70);
            --muted: oklch(0.45 0.01 155);
            --muted-dark: oklch(0.72 0.012 90);
            --meta-font: "EB Garamond", "Times New Roman", serif;
          }
          .sl-serif { font-family: "Instrument Serif", "Times New Roman", serif; font-weight: 400; letter-spacing: -0.01em; }
          .sl-mono  { font-family: var(--meta-font, "EB Garamond"), "Times New Roman", serif; font-weight: 500; }
          ::selection { background: var(--gold); color: var(--ink); }
        ` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className={`${inter.className} bg-gray-100 antialiased overflow-x-hidden`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
