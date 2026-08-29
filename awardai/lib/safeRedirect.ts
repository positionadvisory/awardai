// Deploy to: awardai/lib/safeRedirect.ts
//
// Shared helper for the ?redirect= parameter used by the invite flow.
//
// WHY (29 Aug 2026): /invite/[token] sends an unauthenticated visitor to
// /login?redirect=/invite/<token>, but neither the login page nor the signup
// page ever read that parameter. Both hardcoded their destination, so every
// invitee who had to authenticate first was silently dumped on /projects or
// /upgrade and the invitation was abandoned. Acceptance was 0 for 6 across the
// whole history of the feature.
//
// Only same-origin relative paths are honored, so this cannot be used as an
// open redirect. Anything else falls back to the caller's default.
//
// Reads window.location directly rather than useSearchParams(), so it works in
// a client component with no Suspense boundary (the login page has none).

export function sanitizeRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (typeof raw !== 'string') return null
  // Must be a relative path on this origin.
  if (!raw.startsWith('/')) return null
  // Reject protocol-relative ("//evil.com") and backslash variants.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  // Reject anything that smells like a scheme sneaking through.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return raw
}

/** Read and sanitize ?redirect= from the current URL. Client-side only. */
export function getRedirectParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sanitizeRedirect(new URLSearchParams(window.location.search).get('redirect'))
  } catch {
    return null
  }
}

/** Append the current ?redirect= to another internal path, if there is one. */
export function withRedirect(path: string): string {
  const r = getRedirectParam()
  if (!r) return path
  return `${path}${path.includes('?') ? '&' : '?'}redirect=${encodeURIComponent(r)}`
}
