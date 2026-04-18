'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Countdown deadlines ───────────────────────────────────────────────────────
const COUNTDOWN_SHOWS = [
  { name: 'MMA Smarties',  date: new Date('2026-06-12T23:59:59'), region: 'Asia Pacific' },
  { name: 'Spikes Asia',   date: new Date('2026-09-11T23:59:59'), region: 'Asia Pacific' },
  { name: 'Campaign AOTY', date: new Date('2026-10-16T23:59:59'), region: 'Asia Pacific' },
]

function pad(n: number): string { return String(n).padStart(2, '0') }

interface CountdownUnit { d: number; h: number; m: number; s: number }

function getCountdown(target: Date): CountdownUnit {
  const diff = Math.max(0, target.getTime() - Date.now())
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  }
}

// ─── Countdown card ────────────────────────────────────────────────────────────
function CountdownCard({ show }: { show: typeof COUNTDOWN_SHOWS[0] }) {
  const [time, setTime] = useState<CountdownUnit>(getCountdown(show.date))

  useEffect(() => {
    const id = setInterval(() => setTime(getCountdown(show.date)), 1000)
    return () => clearInterval(id)
  }, [show.date])

  const unit = (val: number | string, label: string) => (
    <div style={{ textAlign: 'center', minWidth: '54px' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f0eeeb', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {val}
      </div>
      <div style={{ fontSize: '10px', color: 'rgba(240,238,235,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>{label}</div>
    </div>
  )

  const sep = (
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'rgba(240,238,235,0.35)', alignSelf: 'flex-start', paddingTop: '4px' }}>:</div>
  )

  return (
    <div style={{
      flex: 1, minWidth: '260px',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '16px', padding: '2rem',
    }}>
      <p style={{ color: 'rgba(240,238,235,0.6)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{show.region}</p>
      <p style={{ color: '#f0eeeb', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1.5rem', lineHeight: 1.2 }}>{show.name}</p>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        {unit(time.d, 'days')}
        {sep}
        {unit(pad(time.h), 'hrs')}
        {sep}
        {unit(pad(time.m), 'min')}
        {sep}
        {unit(pad(time.s), 'sec')}
      </div>
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ loggedIn }: { loggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? 'rgba(240,238,235,0.94)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(15,29,44,0.08)' : 'none',
        transition: 'all 0.2s ease',
        padding: '0 1.5rem',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '64px', gap: '2rem' }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            background: '#1a6640',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>S</span>
          </div>
          <span style={{ color: '#0f1d2c', fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: '16px', letterSpacing: '-0.01em' }}>Shortlist</span>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', marginLeft: 'auto' }}
          className="hide-on-mobile">
          {loggedIn ? (
            <Link href="/projects" style={{
              background: '#1a6640', color: 'white', padding: '0.5rem 1.125rem',
              borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>Open Shortlist →</Link>
          ) : (
            <>
              <Link href="/login" style={{ color: '#5a6a77', fontSize: '14px', textDecoration: 'none' }}>Sign in</Link>
              <Link href="/login" style={{
                background: '#1a6640', color: 'white', padding: '0.5rem 1.125rem',
                borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              }}>Request access</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#5a6a77' }}
          className="show-on-mobile"
          aria-label="Menu"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          background: '#f0eeeb', borderTop: '1px solid rgba(15,29,44,0.08)',
          padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
        }}>
          {loggedIn ? (
            <Link href="/projects" style={{ color: '#1a6640', fontSize: '15px', fontWeight: 500, textDecoration: 'none' }}>Open Shortlist →</Link>
          ) : (
            <Link href="/login" style={{ color: '#1a6640', fontSize: '15px', fontWeight: 500, textDecoration: 'none' }}>Request access →</Link>
          )}
        </div>
      )}
    </nav>
  )
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'How do I get access during the alpha?',
    a: 'Click "Request access" and we\'ll review your application. During the alpha we\'re working with a limited cohort of agencies and studios. Most requests are approved within 24 hours.',
  },
  {
    q: 'Does my content train your AI models?',
    a: 'No. Your briefs, scripts, and entry drafts are never used to train any AI model. Shortlist\'s knowledge base is built from professional experience and publicly available award show guidance — not from client submissions.',
  },
  {
    q: 'Can my whole team use it?',
    a: 'Yes. Invite team members from the Settings tab. Agency plan supports up to 5 users, Studio up to 15, Enterprise is unlimited.',
  },
  {
    q: 'How private is my work?',
    a: 'Your workspace is logically isolated from other organisations. All data is encrypted in transit and at rest. No Shortlist team member accesses your campaign materials without your explicit request.',
  },
  {
    q: 'Which award shows does it cover?',
    a: 'Shortlist currently covers 12+ shows including Cannes Lions, D&AD, The One Show, Effies (global and regional), Clio Awards, Spikes Asia, AWARD, AME Awards, Dubai Lynx, Eurobest, New York Festivals, and Campaign Asia-Pacific Awards.',
  },
  {
    q: 'What happens to founding pricing after the alpha?',
    a: 'Agencies that join before May 31, 2026 lock in founding pricing for life — the rate never increases as long as your subscription stays active. After the alpha closes, standard pricing applies to new sign-ups.',
  },
]

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} style={{ borderBottom: '1px solid rgba(15,29,44,0.08)', overflow: 'hidden' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '1.25rem 0', gap: '1rem',
            }}
          >
            <span style={{
              color: '#0f1d2c', fontSize: '15px', fontWeight: 600,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}>{item.q}</span>
            <span style={{ color: '#3aad6f', fontSize: '18px', flexShrink: 0, transition: 'transform 0.2s', transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
          </button>
          {open === i && (
            <p style={{ color: '#5a6a77', fontSize: '14px', lineHeight: '1.7', paddingBottom: '1.25rem', margin: 0 }}>
              {item.a}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLoggedIn(true)
    })
  }, [])

  const serif = "Georgia, 'Times New Roman', serif"

  return (
    <div style={{ background: '#f0eeeb', minHeight: '100vh', color: '#0f1d2c', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @media (max-width: 640px) {
          .hide-on-mobile { display: none !important; }
          .show-on-mobile { display: flex !important; }
          .hero-headline { font-size: 2.25rem !important; }
          .three-col { flex-direction: column !important; }
          .two-col { flex-direction: column !important; }
          .countdown-row { flex-direction: column !important; }
          .stat-row { flex-direction: column !important; gap: 2rem !important; }
        }
        @media (min-width: 641px) {
          .show-on-mobile { display: none !important; }
        }
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.8; }
        * { box-sizing: border-box; }
      `}</style>

      <Nav loggedIn={loggedIn} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: '140px 1.5rem 100px', textAlign: 'center' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(58,173,111,0.1)', border: '1px solid rgba(58,173,111,0.3)',
            borderRadius: '100px', padding: '0.375rem 0.875rem', marginBottom: '2rem',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3aad6f', display: 'inline-block' }} />
            <span style={{ color: '#1a6640', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Private Alpha Trial</span>
          </div>

          <h1 className="hero-headline" style={{
            fontSize: '3.5rem', fontWeight: 700, lineHeight: 1.1,
            letterSpacing: '-0.03em', marginBottom: '2.5rem',
            color: '#0f1d2c',
            fontFamily: serif,
          }}>
            Your scalable awards partner,<br />operating 24/7/365.
          </h1>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              background: '#1a6640', color: 'white',
              padding: '0.875rem 2rem', borderRadius: '10px',
              fontSize: '15px', fontWeight: 600, textDecoration: 'none',
              display: 'inline-block',
            }}>
              Try it before your next entry →
            </Link>
            <a href="#how-it-works" style={{
              color: '#0f1d2c', border: '1px solid rgba(15,29,44,0.2)',
              padding: '0.875rem 2rem', borderRadius: '10px',
              fontSize: '15px', fontWeight: 500, textDecoration: 'none',
              display: 'inline-block',
              background: 'rgba(255,255,255,0.5)',
            }}>
              See how it works
            </a>
          </div>

          <p style={{ color: '#5a6a77', fontSize: '13px', marginTop: '1.25rem' }}>
            No card required. Alpha closes May 31, 2026.
          </p>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid rgba(15,29,44,0.08)', borderBottom: '1px solid rgba(15,29,44,0.08)', padding: '3rem 1.5rem', background: 'rgba(255,255,255,0.5)' }}>
        <div className="stat-row" style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-around', gap: '2rem', textAlign: 'center' }}>
          {[
            { stat: '$30K+', label: 'Average agency spend per awards season' },
            { stat: '>60%', label: 'Of entries fail to shortlist' },
            { stat: '0', label: 'Dedicated award writers at most agencies' },
          ].map(item => (
            <div key={item.stat} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#3aad6f', letterSpacing: '-0.03em', margin: 0, fontFamily: serif }}>{item.stat}</p>
              <p style={{ color: '#5a6a77', fontSize: '13px', marginTop: '0.5rem', maxWidth: '200px', margin: '0.5rem auto 0' }}>{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center', marginBottom: '4rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>The problem</span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', lineHeight: 1.2, color: '#0f1d2c', fontFamily: serif }}>
              Great work loses to<br />great writing.
            </h2>
            <p style={{ color: '#5a6a77', fontSize: '1rem', lineHeight: 1.7, marginTop: '1rem' }}>
              Award shows judge what you write, not just what you made. Most agencies - especially in Asia - are brilliant at the work, yet miss the mark at explaining critical cultural context to international juries.
            </p>
          </div>

          <div className="three-col" style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              {
                icon: '✍',
                title: 'The writing gap',
                body: 'Your campaign was brilliant. The entry was generic. Juries reward entries that are specific, structured, and strategically framed — not just accurate.',
              },
              {
                icon: '💸',
                title: 'The cost problem',
                body: 'Agencies spend $30K+ per season on entry fees alone — before writer fees, strategy time, or internal coordination. Most of that budget goes on entries that were never going to shortlist.',
              },
              {
                icon: '🌏',
                title: 'The language disadvantage',
                body: 'Agencies in Asia have a track record of punching below their weight at global shows where juries are unfortunately often over indexed towards Western markets.',
              },
            ].map(card => (
              <div key={card.title} style={{
                flex: 1, background: '#ffffff', border: '1px solid #dedad4',
                borderRadius: '16px', padding: '2rem',
              }}>
                <h3 style={{ color: '#0f1d2c', fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: serif, lineHeight: 1.2 }}>{card.title}</h3>
                <p style={{ color: '#5a6a77', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ──────────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 1.5rem', background: 'rgba(58,173,111,0.04)', borderTop: '1px solid rgba(58,173,111,0.12)', borderBottom: '1px solid rgba(58,173,111,0.12)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center', marginBottom: '4.5rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>The solution</span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', lineHeight: 1.2, color: '#0f1d2c', fontFamily: serif }}>
              An awards intelligence system that also happens to write.
            </h2>
            <p style={{ color: '#5a6a77', fontSize: '1rem', lineHeight: 1.7, marginTop: '1rem' }}>
              Shortlist is trained on how award juries actually think, built from decades of professional experience and public award show guidance. It knows what juries at Cannes wants differently from an Effies.
            </p>
          </div>

          <div className="three-col" style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'Agency intelligence', body: 'Upload your brief and campaign materials. Shortlist reads everything and builds a complete picture of your work before writing a single word.' },
              { label: 'Show calibration', body: 'Each entry direction is calibrated to the show and category it\'s targeting - not a generic template. Your strategy for Cannes will be fundamentally different to your strategy at Festival of Media.' },
              { label: 'Outcome tracking', body: 'Every evaluation, draft, and direction is stored. Over time, your agency builds a private intelligence layer that gets sharper with every entry.' },
            ].map(card => (
              <div key={card.label} style={{ flex: 1, textAlign: 'center', padding: '0 1rem' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: 'rgba(58,173,111,0.12)', border: '1px solid rgba(58,173,111,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}>
                  <svg width="20" height="20" fill="none" stroke="#3aad6f" strokeWidth="1.75" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 style={{ color: '#0f1d2c', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: serif }}>{card.label}</h3>
                <p style={{ color: '#5a6a77', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '100px 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>How it works</span>
            <h2 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', color: '#0f1d2c', fontFamily: serif }}>
              Four steps. Confident entries.
            </h2>
          </div>

          <div className="two-col" style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
            {[
              {
                step: '01',
                title: 'Upload your materials',
                body: 'Drop in your brief, case study, video links, or campaign documents. Shortlist reads everything — PDFs, decks, Word docs — and extracts what matters.',
              },
              {
                step: '02',
                title: 'Get entry directions',
                body: 'Shortlist recommends which shows and categories give your campaign the best chance of shortlisting — ranked by fit, not just by prestige.',
              },
              {
                step: '03',
                title: 'Draft and evaluate',
                body: 'Generate show-specific entry drafts. Then run them through a dual evaluation: a Coach Review for improvement, and a Jury Evaluation scored against real criteria.',
              },
              {
                step: '04',
                title: 'Confident and confidential',
                body: 'Refine with targeted feedback, generate a production brief for your case study film, and submit. Your work never leaves your workspace.',
              },
            ].map(item => (
              <div key={item.step} style={{
                flex: '1 1 calc(50% - 1px)', minWidth: '280px',
                background: '#ffffff', border: '1px solid #dedad4',
                borderRadius: '16px', padding: '2.5rem',
                margin: '1px',
              }}>
                <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em' }}>{item.step}</span>
                <h3 style={{ color: '#0f1d2c', fontSize: '1.125rem', fontWeight: 700, margin: '0.75rem 0', fontFamily: serif }}>{item.title}</h3>
                <p style={{ color: '#5a6a77', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Deadline Countdown ────────────────────────────────────────────── */}
      <section style={{ padding: '80px 1.5rem', background: '#0f1d2c' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Upcoming deadlines</span>
            <h2 style={{
              fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em',
              marginTop: '0.75rem', color: '#f0eeeb', fontFamily: serif,
            }}>
              The clock is always running.
            </h2>
            <p style={{ color: 'rgba(240,238,235,0.5)', fontSize: '13px', marginTop: '0.5rem' }}>
              Entry deadlines — not festival dates. Always verify with the official show website.
            </p>
          </div>

          <div className="countdown-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {COUNTDOWN_SHOWS.map(show => (
              <CountdownCard key={show.name} show={show} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 1.5rem', background: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(15,29,44,0.06)', borderBottom: '1px solid rgba(15,29,44,0.06)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Privacy</span>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', color: '#0f1d2c', fontFamily: serif }}>
              Your work stays yours.
            </h2>
          </div>
          <div className="two-col" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {[
              { icon: '🔒', title: 'Never trains AI', body: 'Your briefs, entries, and materials are never used to train any AI model — ours or anyone else\'s.' },
              { icon: '🏛', title: 'Logically isolated', body: 'Each agency\'s workspace is isolated from all others. No cross-contamination of data between clients or competitors.' },
              { icon: '🔐', title: 'Encrypted end-to-end', body: 'All data encrypted in transit (TLS) and at rest. Files stored in private buckets with no public access.' },
              { icon: '🧠', title: 'Knowledge built responsibly', body: 'Shortlist\'s award show intelligence is built from professional experience and public guidance — not from your work.' },
            ].map(item => (
              <div key={item.title} style={{
                flex: '1 1 calc(50% - 0.5rem)', minWidth: '260px',
                background: '#ffffff', border: '1px solid #dedad4',
                borderRadius: '12px', padding: '1.5rem',
              }}>
                <h3 style={{ color: '#0f1d2c', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem', fontFamily: serif, lineHeight: 1.2 }}>{item.title}</h3>
                <p style={{ color: '#5a6a77', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 1.5rem' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{ color: '#3aad6f', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>FAQ</span>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', marginTop: '0.75rem', color: '#0f1d2c', fontFamily: serif }}>
              Common questions.
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '120px 1.5rem', textAlign: 'center', background: '#0f1d2c' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#f0eeeb', lineHeight: 1.2, marginBottom: '1.25rem', fontFamily: serif }}>
            Try it before your next entry.
          </h2>
          <p style={{ color: 'rgba(240,238,235,0.6)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            No credit card. No long-term commitment. Join the founding cohort before May 31 and your price is locked in for life.
          </p>
          <Link href="/login" style={{
            background: '#3aad6f', color: 'white',
            padding: '1rem 2.5rem', borderRadius: '12px',
            fontSize: '16px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>
            Request access →
          </Link>
          <p style={{ color: 'rgba(240,238,235,0.3)', fontSize: '13px', marginTop: '1.25rem' }}>
            gotshortlisted.com · Private alpha trial
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(15,29,44,0.08)', padding: '2.5rem 1.5rem', background: '#f0eeeb' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#1a6640', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '10px' }}>S</span>
            </div>
            <span style={{
              color: '#0f1d2c', fontSize: '14px', fontWeight: 700,
              fontFamily: serif,
            }}>Shortlist</span>
            <span style={{ color: '#5a6a77', fontSize: '13px' }}>· gotshortlisted.com</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link href="/login" style={{ color: '#5a6a77', fontSize: '13px', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
