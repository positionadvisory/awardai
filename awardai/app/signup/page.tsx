'use client'
// Deploy to: app/signup/page.tsx
//
// Safe-Links-proof signup (S101, 2 Jul 2026).
// WHY: the old flow called signUp() then signInWithPassword() immediately. With
// Supabase "Confirm email" ON, that sign-in fails ("Email not confirmed") and
// the only way through is the emailed CONFIRMATION LINK. Corporate email
// security (Microsoft Safe Links / Defender, standard at holdcos like Publicis
// and WPP) prefetches inbound links to scan them; a Supabase confirm-signup link
// is single-use, so the scan consumes it before the human clicks and the account
// never confirms. This is the same wall that blocked Soumya at WPP (S89). S89
// fixed LOGIN and RECOVERY with typed OTP codes but left SIGNUP on the link.
//
// FIX: confirm the new account with a typed 6-digit CODE (verifyOtp type:'signup'),
// exactly like the login-page OTP flow. A scanner cannot consume a code the user
// types. Two steps: (1) details -> signUp; (2) code -> verifyOtp -> session.
//
// DUAL-PATH (robust to the Supabase toggle): if signUp returns a session (i.e.
// "Confirm email" is OFF), skip the code step and go straight to /upgrade, so
// this page is correct whether confirmation is ON or OFF.
//
// REQUIRES the Supabase "Confirm signup" email template to use {{ .Token }} and
// DROP {{ .ConfirmationURL }} (the link and the code share one token, so leaving
// the link in still lets Safe Links burn it (S89 template lesson)). See deploy note.

import { useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { getRedirectParam } from '@/lib/safeRedirect'

/* ── Shared atoms (mirror login-page.tsx / public-landing-page.tsx) ────────── */

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

function Messages({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && (
        <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>{error}</p>
        </div>
      )}
      {notice && (
        <div style={{ background: 'rgba(201,169,92,0.12)', border: '1px solid rgba(201,169,92,0.3)', padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--bone)', lineHeight: 1.5 }}>{notice}</p>
        </div>
      )}
    </>
  )
}

function TextLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.04em',
        color: hov ? 'var(--gold)' : 'var(--muted-dark)',
        textDecoration: 'underline', textUnderlineOffset: 3,
        transition: 'color 180ms ease',
      }}
    >
      {children}
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

type Step = 'details' | 'code'

function SignupContent() {
  const [step,      setStep]      = useState<Step>('details')
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [code,      setCode]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [notice,    setNotice]    = useState('')
  const [inputFocus, setInputFocus] = useState<string | null>(null)

  // Step 1: create the auth user. handle_new_user creates the org + profile.
  const handleDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Confirmation OFF: Supabase returns a live session -> straight into the app.
    if (data.session) {
      window.location.href = getRedirectParam() ?? '/upgrade'
      return
    }

    // Confirmation ON: no session yet. Supabase has emailed a 6-digit code
    // (template must use {{ .Token }}, see the header note). Move to the code
    // step; the user types the code, we verify, and that opens the session.
    setLoading(false)
    setCode('')
    setStep('code')
    setNotice('We emailed a 6-digit code to ' + email.trim() + '. Look for a number in the email, not a link, and type it below.')
  }

  // Step 2: confirm the account with the typed code (Safe-Links-proof).
  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type:  'signup',
    })

    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }

    // Verified and signed in. Review Pro benefits before Stripe.
    window.location.href = getRedirectParam() ?? '/upgrade'
  }

  const resendCode = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    const { error: resendError } = await supabase.auth.resend({
      type:  'signup',
      email: email.trim(),
    })
    setLoading(false)
    if (resendError) { setError(resendError.message); return }
    setNotice('New code sent to ' + email.trim() + '. It replaces the previous one.')
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

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--muted-dark)', marginBottom: 6, letterSpacing: '0.04em',
  }

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
          {step === 'details' ? 'Create your account' : 'Confirm your email'}
        </div>

        {step === 'details' ? (
          <>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
              7-day free trial. No commitment required.
            </p>

            <form onSubmit={handleDetails} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Full name</label>
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
                <label style={labelStyle}>Work email</label>
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
                <label style={labelStyle}>Password</label>
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

              <Messages error={error} notice={notice} />

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
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
              We emailed a 6-digit code to confirm your account. Type it in here. No link to click, so it works even behind strict corporate email security.
            </p>

            <form onSubmit={handleCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  onFocus={() => setInputFocus('code')}
                  onBlur={() => setInputFocus(null)}
                  required
                  autoComplete="one-time-code"
                  style={{ ...inputStyle('code'), letterSpacing: '0.3em' }}
                  placeholder="123456"
                />
              </div>

              <Messages error={error} notice={notice} />

              <GoldButton loading={loading}>
                {loading ? 'Confirming...' : 'Confirm and continue'}
              </GoldButton>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <TextLink onClick={() => { if (!loading) resendCode() }}>Send a new code</TextLink>
                <TextLink onClick={() => { setError(''); setNotice(''); setCode(''); setStep('details') }}>Change email</TextLink>
              </div>
            </form>
          </>
        )}
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
