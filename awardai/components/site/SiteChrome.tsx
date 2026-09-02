// components/site/SiteChrome.tsx
//
// Shared public-site chrome for the content surfaces: /articles, /articles/[slug]
// and /about. Server components only — no hooks, no 'use client'. Responsive
// behaviour is CSS media queries, deliberately NOT the homepage's JS
// useIsMobile() breakpoint, so there is no desktop-to-mobile flash on a
// server-rendered page.
//
// S2-PREP (2 Sep 2026). Before this file, those three pages carried ZERO
// var(--token) references between them and 73 hardcoded hex values, on a blue
// -black (#0b1120) ground with an emerald accent, Inter, and 8-16px radii. The
// homepage runs green-black + gold + Instrument Serif + Geist at radius 0, and
// every one of those tokens was already loaded globally in layout.tsx on these
// exact pages. They just used none of them.
//
// The layout language here is lifted from public/tno-report.html, which is the
// site's published editorial design: paper ground, serif display, gold rules,
// letterspaced uppercase eyebrows, dark bands for emphasis. The VALUES are the
// homepage's, not the report's — the report predates the token set and its gold
// (#c9a86a) sits 13.1 dE2000 from var(--gold), which would read as a second gold
// on a reader who arrives from the homepage.

import Link from 'next/link'

/* ── Logo ───────────────────────────────────────────────────────────────────
   Byte-identical to the homepage's Logo atom (app/page.tsx). Do not restyle
   here: it is the brand lockup and it must match / exactly.           ── */
export const Logo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

/* ── Eyebrow ────────────────────────────────────────────────────────────────
   The homepage's Eyebrow atom, which is also the TNO report's .seceyebrow:
   uppercase, 0.18em tracking, 6px gold dot, EB Garamond via .sl-mono. The one
   difference from the report is the dot, square here because the homepage is
   radius 0 throughout.                                                ── */
export const Eyebrow = ({
  children,
  tone = 'dark',
}: {
  children: React.ReactNode
  tone?: 'dark' | 'light'
}) => (
  <div
    className="sl-mono"
    style={{
      fontSize: 11,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: tone === 'light' ? 'var(--muted-dark)' : 'var(--muted)',
      fontWeight: 500,
    }}
  >
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        background: 'var(--gold)',
        marginRight: 10,
        marginBottom: 2,
        verticalAlign: 'middle',
      }}
    />
    {children}
  </div>
)

/* ── Chrome CSS ─────────────────────────────────────────────────────────────
   One <style> block, emitted once per page by SiteNav. Media queries replace
   the homepage's JS breakpoint. The 390px nav wrap the S1 render found ("Sign
   in" and "Request access" each breaking to two lines) is fixed by dropping the
   section links below 720px, not by shrinking type.                   ── */
const chromeCss = `
.sl-shell { font-family: "Geist", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  background: var(--bone); color: var(--ink); line-height: 1.45;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; min-height: 100vh; }

.sl-nav { position: sticky; top: 0; z-index: 30; background: var(--green-deep); color: var(--bone);
  border-bottom: 1px solid rgba(245,238,224,0.08); }
.sl-nav-in { width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 40px;
  display: flex; align-items: center; justify-content: space-between; height: 64px; }
.sl-nav-brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; }
.sl-nav-wm { font-size: 22px; line-height: 1; }
.sl-nav-r { display: flex; align-items: center; gap: 36px; font-size: 13px; }
.sl-nav-link { text-decoration: none; opacity: 0.85; color: inherit; }
.sl-nav-link:hover { opacity: 1; }
.sl-nav-cta { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  padding: 8px 14px; border: 1px solid rgba(245,238,224,0.25); background: transparent;
  color: var(--bone); text-decoration: none; white-space: nowrap; }
.sl-nav-cta:hover { border-color: var(--gold); color: var(--gold); }

@media (max-width: 860px) { .sl-nav-in { padding: 0 20px; height: 56px; } .sl-nav-r { gap: 18px; } }
@media (max-width: 720px) { .sl-nav-sec { display: none; } .sl-nav-wm { font-size: 18px; } }

.sl-read { width: 100%; max-width: 720px; margin: 0 auto; padding: 0 24px; }
@media (max-width: 560px) { .sl-read { padding: 0 20px; } }

.sl-foot { background: var(--green-deep); color: var(--bone); margin-top: 96px; padding: 56px 0 40px; }
.sl-foot-in { width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 40px; }
.sl-foot-line { font-size: clamp(24px, 3.4vw, 34px); line-height: 1.22; letter-spacing: -0.015em;
  margin: 22px 0 0; max-width: 18em; font-weight: 400; }
.sl-foot-line i { font-style: italic; color: var(--gold); }
.sl-foot-cta { display: inline-flex; align-items: center; gap: 14px; margin-top: 30px;
  padding: 16px 26px; background: var(--gold); color: var(--ink); text-decoration: none;
  font-size: 15px; font-weight: 600; border-radius: 0; }
.sl-foot-cta span { display: inline-block; width: 18px; height: 1px; background: var(--ink); }
/* Footer link row. It exists because the nav hides the section links below
   720px, so on a phone the nav is wordmark + one CTA and nothing else. Without
   this row a phone reader has no path to About or Sign in from an article. */
.sl-foot-nav { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 40px; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; }
.sl-foot-nav a { color: var(--muted-dark); text-decoration: none; }
.sl-foot-nav a:hover { color: var(--gold); }
.sl-foot-bar { margin-top: 56px; padding-top: 22px; border-top: 1px solid rgba(245,238,224,0.18);
  display: flex; justify-content: space-between; align-items: center; gap: 24px; font-size: 11px; }
.sl-foot-meta { letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-dark); }
.sl-foot-meta a { color: var(--muted-dark); text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 720px) {
  .sl-foot { margin-top: 64px; padding: 44px 0 32px; }
  .sl-foot-in { padding: 0 20px; }
  .sl-foot-bar { flex-direction: column; align-items: flex-start; margin-top: 48px; text-align: left; }
  .sl-foot-cta { width: 100%; justify-content: center; }
}
`

/* ── Nav ───────────────────────────────────────────────────────────────────
   "Request access" is gone from all three pages. It was copy from a gated era:
   the homepage offers a trial and a sign-in, and nothing on the marketing site
   asks anyone to request anything, so the label contradicted the page it sat
   on. Replaced by "Start free trial" -> /signup, which is the homepage primary
   CTA word for word.                                                  ── */
export const SiteNav = ({ active }: { active?: 'articles' | 'about' }) => (
  <>
    <style dangerouslySetInnerHTML={{ __html: chromeCss }} />
    <nav className="sl-nav">
      <div className="sl-nav-in">
        <Link href="/" className="sl-nav-brand">
          <Logo size={20} />
          <span className="sl-serif sl-nav-wm">Shortlist</span>
        </Link>
        <div className="sl-nav-r">
          <Link
            href="/articles"
            className="sl-nav-link sl-nav-sec"
            style={active === 'articles' ? { opacity: 1, color: 'var(--gold)' } : undefined}
          >
            Articles
          </Link>
          <Link
            href="/about"
            className="sl-nav-link sl-nav-sec"
            style={active === 'about' ? { opacity: 1, color: 'var(--gold)' } : undefined}
          >
            About
          </Link>
          <Link href="/login" className="sl-nav-link sl-nav-sec">Sign in</Link>
          <Link href="/signup" className="sl-mono sl-nav-cta">Start free trial</Link>
        </div>
      </div>
    </nav>
  </>
)

/* ── Footer ────────────────────────────────────────────────────────────────
   The homepage's closing band, cut down. The homepage sets its headline at
   clamp(48px, 7vw, 112px) because it is the last thing on a sales page; on a
   content page that size competes with the article the reader just finished,
   so it steps down to clamp(24px, 3.4vw, 34px). Everything else — ground,
   gold italic, lockup, edition stamp, uppercase meta — is the homepage's.
                                                                       ── */
export const SiteFooter = () => (
  <footer className="sl-foot">
    <div className="sl-foot-in">
      <Eyebrow tone="light">Final word</Eyebrow>
      <h2 className="sl-serif sl-foot-line">
        Your next entry deadline<br />
        <i>is closer than you think.</i>
      </h2>
      <Link href="/signup" className="sl-foot-cta">
        Start free trial
        <span />
      </Link>
      <div className="sl-mono sl-foot-nav">
        <Link href="/articles">Articles</Link>
        <Link href="/about">About</Link>
        <Link href="/login">Sign in</Link>
        <a href="mailto:ben@positionadvisory.com">Contact</a>
      </div>
      <div className="sl-foot-bar">
        <span className="sl-mono sl-foot-meta">Shortlist · Asia</span>
        <Logo size={20} />
        <span className="sl-mono sl-foot-meta">
          gotshortlisted.com · Edition 01{' · '}
          <a href="/terms">Terms</a>{' · '}
          <a href="/privacy">Privacy</a>
        </span>
      </div>
    </div>
  </footer>
)
