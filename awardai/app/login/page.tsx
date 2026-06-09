'use client'
// Deploy to: app/login/page.tsx

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/* ── Shared atoms (mirrors public-landing-page.tsx) ──────────────────────── */

const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [inputFocus, setInputFocus] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    window.location.href = '/projects'
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(245,238,224,0.06)',
    border: `1px solid ${inputFocus === field ? 'rgba(201,169,92,0.7)' : 'rgba(245,238,224,0.18)'}`,
    borderRadius: 0,
    padding: '12px 16px',
    color: 'var(--bone)',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 180ms ease',
    boxSizing: 'border-box',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--green-deep)', color: 'var(--bone)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>

      {/* Logo */}
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48, textDecoration: 'none', color: 'var(--bone)' }}>
        <Logo size={22} />
        <span className="sl-serif" style={{ fontSize: 22, lineHeight: 1 }}>Shortlist</span>
      </a>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 400, border: '1px solid rgba(245,238,224,0.12)', padding: '40px 36px', background: 'rgba(245,238,224,0.03)' }}>

        <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 20 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', marginRight: 10, marginBottom: 1, verticalAlign: 'middle' }} />
          Sign in
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-dark)', marginBottom: 6, letterSpacing: '0.04em' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setInputFocus('email')}
              onBlur={() => setInputFocus(null)}
              required
              autoComplete="email"
              style={inputStyle('email')}
              placeholder="you@agency.com"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-dark)', marginBottom: 6, letterSpacing: '0.04em' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setInputFocus('password')}
              onBlur={() => setInputFocus(null)}
              required
              autoComplete="current-password"
              style={inputStyle('password')}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', padding: '10px 14px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{error}</p>
            </div>
          )}

          <GoldButton loading={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </GoldButton>
        </form>
      </div>

      {/* Sign up link */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-dark)' }}>
          Don&apos;t have an account?
        </p>
        <a
          href="/signup"
          style={{ display: 'inline-block', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bone)', textDecoration: 'none', border: '1px solid rgba(245,238,224,0.2)', padding: '10px 24px', transition: 'border-color 180ms ease' }}
          className="sl-mono"
        >
          Start free trial
        </a>
      </div>

      {/* Footer links */}
      <p className="sl-mono" style={{ marginTop: 40, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-dark)', opacity: 0.6 }}>
        <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Terms</a>
        {' · '}
        <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</a>
      </p>

    </div>
  )
}

/* ── Gold CTA button (stateless, mirrors PrimaryCTA) ─────────────────────── */

function GoldButton({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="submit"
      disabled={loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        padding: '14px 20px',
        background: loading ? 'rgba(201,169,92,0.5)' : hov ? 'var(--gold-deep, #b8932a)' : 'var(--gold)',
        color: 'var(--ink)',
        border: 'none',
        borderRadius: 0,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 180ms ease',
        marginTop: 4,
      }}
    >
      <span>{children}</span>
      {!loading && (
        <span style={{ display: 'inline-block', width: 16, height: 1, background: 'var(--ink)', transform: hov ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 180ms ease' }} />
      )}
    </button>
  )
}
