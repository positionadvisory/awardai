'use client'
// Deploy to: app/upgrade/page.tsx

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

/* ── Shared atoms (mirrors public-landing-page.tsx) ──────────────────────── */

const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)', fontWeight: 500 }}>
    <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', marginRight: 10, marginBottom: 1, verticalAlign: 'middle' }} />
    {children}
  </div>
)

/* ── Feature rows ────────────────────────────────────────────────────────── */

const features: { label: string; detail: string }[] = [
  { label: 'Entry directions',   detail: 'AI-generated strategic angles, show recommendations, and category fits — ready before your team picks up the brief.' },
  { label: 'First drafts',       detail: 'Field-by-field entry copy across every section. Structured, calibrated, and editable. Your team edits, not starts from scratch.' },
  { label: 'Jury evaluation',    detail: 'Score your entry against real jury criteria before you submit. Catch weak sections. Strengthen what matters.' },
  { label: 'Video script scoring', detail: 'AI feedback on your case study film script, calibrated to what juries actually respond to.' },
  { label: 'Press kit generation', detail: 'LinkedIn, X, and Instagram copy, plus a press hook — ready to announce the shortlist before it happens.' },
  { label: 'Agency profile',     detail: 'Upload your credentials once. Every entry pulls your positioning, voice, and sector strengths automatically.' },
  { label: 'Unlimited entries',  detail: 'No per-entry charges. Unlimited drafts, evaluations, and press kits within each of your 5 active projects.' },
  { label: '30+ shows covered',  detail: 'Cannes Lions, D&AD, One Show, Clio, Effies, SABRE, PRCA, Spikes, SMARTIES, and more. Show data is baked in.' },
]

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function UpgradePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hov, setHov] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Guard: if no session, redirect to login
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
    })
  }, [router])

  const handleStartTrial = async () => {
    setLoading(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await res.json()

      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }

      setError(data.error || 'Something went wrong. Please try again.')
    } catch {
      setError('Could not connect to billing. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--green-deep)', color: 'var(--bone)' }}>

      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(245,238,224,0.08)', padding: isMobile ? '0 20px' : '0 40px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', height: isMobile ? 56 : 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--bone)' }}>
            <Logo size={20} />
            <span className="sl-serif" style={{ fontSize: isMobile ? 18 : 22, lineHeight: 1 }}>Shortlist</span>
          </a>
          <a
            href="/projects"
            className="sl-mono"
            style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-dark)', textDecoration: 'none', opacity: 0.7 }}
          >
            Skip for now
          </a>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ padding: isMobile ? '56px 20px 40px' : '80px 40px 64px', maxWidth: 1280, margin: '0 auto' }}>
        <Eyebrow>Your account is ready</Eyebrow>

        <h1 className="sl-serif" style={{ margin: '20px 0 0', fontSize: isMobile ? 'clamp(36px, 10vw, 56px)' : 'clamp(44px, 5vw, 72px)', lineHeight: 1.0, letterSpacing: '-0.02em', fontWeight: 400, maxWidth: 800 }}>
          One subscription.<br />
          <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Every tool you need.</span>
        </h1>

        <p style={{ marginTop: 24, fontSize: isMobile ? 16 : 18, lineHeight: 1.6, color: 'var(--muted-dark)', maxWidth: 560 }}>
          Shortlist Pro gives your team everything built into the platform. Start a 14-day free trial today. No commitment, and you can cancel anytime before the trial ends.
        </p>
      </div>

      {/* Main content */}
      <div style={{ padding: isMobile ? '0 20px 80px' : '0 40px 120px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? 48 : 80, alignItems: 'start' }}>

          {/* Features list */}
          <div>
            <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 24 }}>
              What is included
            </div>
            <div style={{ borderTop: '1px solid rgba(245,238,224,0.12)' }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: isMobile ? 6 : 24, padding: '20px 0', borderBottom: '1px solid rgba(245,238,224,0.08)', alignItems: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-block', width: 5, height: 5, background: 'var(--gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--bone)' }}>{f.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted-dark)' }}>{f.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing card */}
          <div style={{ position: isMobile ? 'static' : 'sticky', top: 80 }}>
            <div style={{ border: '1px solid rgba(245,238,224,0.18)', padding: '36px 32px', background: 'rgba(245,238,224,0.04)' }}>

              <Eyebrow>Shortlist Pro</Eyebrow>

              {/* Price */}
              <div style={{ marginTop: 24, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="sl-serif" style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>$299</span>
                <span style={{ fontSize: 14, color: 'var(--muted-dark)' }}>/ month</span>
              </div>

              <div style={{ marginTop: 4, paddingLeft: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--gold)' }}>14 days free to start</span>
              </div>

              {/* Divider */}
              <div style={{ margin: '28px 0', height: 1, background: 'rgba(245,238,224,0.1)' }} />

              {/* Key points */}
              {[
                'Credit card required to start trial',
                'Cancel anytime before trial ends',
                'No per-entry charges',
                'Up to 5 active projects, one user seat',
                'Full access from day one',
              ].map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <span style={{ display: 'inline-block', width: 5, height: 5, background: 'rgba(245,238,224,0.35)', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>{point}</span>
                </div>
              ))}

              {/* CTA */}
              <div style={{ marginTop: 32 }}>
                {error && (
                  <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', padding: '10px 14px', marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{error}</p>
                  </div>
                )}
                <button
                  onClick={handleStartTrial}
                  disabled={loading}
                  onMouseEnter={() => setHov(true)}
                  onMouseLeave={() => setHov(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '16px 20px',
                    background: loading ? 'rgba(201,169,92,0.5)' : hov ? 'var(--gold-deep, #b8932a)' : 'var(--gold)',
                    color: 'var(--ink)',
                    border: 'none',
                    borderRadius: 0,
                    fontFamily: 'inherit',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background 180ms ease',
                  }}
                >
                  <span>{loading ? 'Redirecting to checkout...' : 'Start 14-day free trial'}</span>
                  {!loading && (
                    <span style={{ display: 'inline-block', width: 18, height: 1, background: 'var(--ink)', transform: hov ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 180ms ease' }} />
                  )}
                </button>
              </div>

              <p className="sl-mono" style={{ marginTop: 16, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-dark)', opacity: 0.6, textAlign: 'center', lineHeight: 1.6 }}>
                Secured by Stripe. You will not be charged until your trial ends.
              </p>
            </div>

            {/* Skip link */}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <a
                href="/projects"
                style={{ fontSize: 12, color: 'var(--muted-dark)', textDecoration: 'underline', textUnderlineOffset: 3, opacity: 0.6 }}
              >
                Continue without subscribing
              </a>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
