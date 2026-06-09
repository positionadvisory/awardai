'use client'
// Deploy to: app/signup/page.tsx

import { useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'

/* ── Shared atoms (mirrors public-landing-page.tsx) ──────────────────────── */

const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

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

/* ── Page shell ──────────────────────────────────────────────────────────── */

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'var(--green-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="sl-mono" style={{ fontSize: 12, color: 'var(--muted-dark)', letterSpacing: '0.1em' }}>Loading...</p>
      </div>
    }>
      <SignupContent />
    </Suspense>
  )
}

/* ── Content ─────────────────────────────────────────────────────────────── */

function SignupContent() {
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [inputFocus, setInputFocus] = useState<string | null>(null)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 1. Create the Supabase auth user (triggers handle_new_user -> creates org + profile)
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Please check your email to confirm your account before signing in.')
      setLoading(false)
      return
    }

    // 2. Sign in immediately to get a session token
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      // Account created but can't auto-sign-in — send to login
      window.location.href = '/login'
      return
    }

    // 3. Redirect to the upgrade page — user reviews Pro benefits before hitting Stripe
    window.location.href = '/upgrade'
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

        <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 8 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', marginRight: 10, marginBottom: 1, verticalAlign: 'middle' }} />
          Create your account
        </div>

        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
          14-day free trial. No commitment required.
        </p>

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-dark)', marginBottom: 6, letterSpacing: '0.04em' }}>
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onFocus={() => setInputFocus('name')}
              onBlur={() => setInputFocus(null)}
              required
              autoComplete="name"
              style={inputStyle('name')}
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-dark)', marginBottom: 6, letterSpacing: '0.04em' }}>
              Work email
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
              minLength={8}
              autoComplete="new-password"
              style={inputStyle('password')}
              placeholder="Min. 8 characters"
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', padding: '10px 14px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{error}</p>
            </div>
          )}

          <GoldButton loading={loading}>
            {loading ? 'Setting up your account...' : 'Create account'}
          </GoldButton>

          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-dark)', textAlign: 'center', lineHeight: 1.6, opacity: 0.75 }}>
            By creating your account you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Terms
            </a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Privacy Policy
            </a>.
          </p>
        </form>
      </div>

      {/* Sign in link */}
      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--muted-dark)' }}>
        Already have an account?{' '}
        <a href="/login" style={{ color: 'var(--bone)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Sign in
        </a>
      </p>

      {/* Footer links */}
      <p className="sl-mono" style={{ marginTop: 32, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-dark)', opacity: 0.6 }}>
        <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Terms</a>
        {' · '}
        <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</a>
      </p>

    </div>
  )
}
