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
  // www is the primary host: the apex 308s to www, so every absolute URL the
  // site emits (canonical, og:url, sitemap, JSON-LD) names www. A canonical
  // that points at a redirect is a weaker signal than one that points at itself.
  metadataBase: new URL('https://www.gotshortlisted.com'),

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

  authors: [{ name: 'Ben Condit', url: 'https://www.gotshortlisted.com/about' }],

  openGraph: {
    type: 'website',
    siteName: 'Shortlist',
    title: 'Shortlist — Awards intelligence, built by someone who ran one',
    description:
      'Shortlist reads your brief, recommends shows, drafts entries, and evaluates them against jury criteria. Your scalable awards partner, operating 24/7/365.',
    url: 'https://www.gotshortlisted.com',
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

  // NO site-wide canonical (SEO pass, 21 Oct 2026). This block used to set
  // alternates.canonical to the homepage, and Next inherits layout metadata into
  // every page that does not override it, so /about, /articles and every article
  // told Google it was a duplicate of the homepage. Each public page now sets its
  // own canonical; a page that sets none emits none, which is safe, where an
  // inherited wrong one is not.

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-icon.png',
  },
}

// ── JSON-LD: site-wide Organization, WebSite and product ─────────────────────
// SEO pass, 21 Oct 2026. The old block was a lone SoftwareApplication carrying
// three offers, Studio $149, Agency $299 and Enterprise $599. Only $299/month
// exists. Structured data is what search engines and AI answers read first, so
// it must match the pricing section exactly: one plan, monthly. If pricing
// changes, change it here in the same commit.
// sameAs: add Ben's and Shortlist's LinkedIn URLs here when confirmed. They are
// what separate this "Shortlist" from other products of the same name.
const SITE = 'https://www.gotshortlisted.com'
const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Shortlist',
      alternateName: 'Shortlist Awards Intelligence',
      url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}/icon.png`, width: 512, height: 512 },
      founder: { '@id': `${SITE}/about#ben-condit` },
      email: 'ben@positionadvisory.com',
      sameAs: ['https://shortlistawardsintelligence.substack.com'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'Shortlist',
      url: SITE,
      publisher: { '@id': `${SITE}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#software`,
      name: 'Shortlist',
      url: SITE,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Shortlist is an awards intelligence system for agencies. It reads a campaign brief, recommends shows and categories with a category fit score, drafts entries against each show\'s jury criteria, and evaluates them in jury and coach modes before submission.',
      publisher: { '@id': `${SITE}/#organization` },
      offers: {
        '@type': 'Offer',
        price: '299',
        priceCurrency: 'USD',
        url: `${SITE}/#pricing`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '299',
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          unitText: 'month',
        },
        description: 'One user seat, up to 5 active projects, unlimited entries within each. 7-day free trial, card required.',
      },
    },
  ],
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
      </head>
      <body className={`${inter.className} bg-gray-100 antialiased overflow-x-hidden`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
