// app/robots.ts: served at /robots.txt (SEO pass, 21 Oct 2026; it was a 404).
// Public marketing pages are crawlable. The signed-in app is disallowed: it is
// auth-gated, so a crawler only ever sees a login redirect there. /login and
// /signup are NOT disallowed; they carry their own noindex tag instead, which a
// crawler can only read if it is allowed to fetch the page.
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/dashboard',
          '/projects',
          '/campaigns',
          '/planner',
          '/settings',
          '/upgrade',
          '/start',
          '/invite',
          '/callback',
        ],
      },
    ],
    sitemap: 'https://www.gotshortlisted.com/sitemap.xml',
    host: 'https://www.gotshortlisted.com',
  }
}
