'use client'
// Deploy to: app/login/page.tsx

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getRedirectParam, withRedirect } from '@/lib/safeRedirect'

/* ── Shared atoms (mirrors public-landing-page.tsx) ──────────────────────── */

const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

type Mode = 'password' | 'otp-email' | 'otp-code' | 'forgot-email' | 'reset' | 'recovery-set'

const LABEL: Record<Mode, string> = {
  'password':     'Sign in',
  'otp-email':    'Email me a code',
  'otp-code':     'Enter your code',
  'forgot-email': 'Reset your password',
  'reset':        'Enter code and new password',
  'recovery-set': 'Set a new password',
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LoginPage() {
  const [mode, setMode]               = useState<Mode>('password')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [code, setCode]               = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')
  const [inputFocus, setInputFocus]   = useState<string | null>(null)
  // Carry ?redirect= onto the signup link: an invitee usually has no account yet,
  // and losing the param here strands them on /upgrade with the invite abandoned.
  const [signupHref, setSignupHref]   = useState('/signup')

  // On load: surface a friendly message for expired/invalid email links,
  // catch a password-recovery session arriving in the URL, and bounce
  // already-signed-in users straight to the app.
  useEffect(() => {
    setSignupHref(withRedirect('/signup'))
    const hash = window.location.hash || ''

    if (hash.includes('error')) {
      const params  = new URLSearchParams(hash.replace(/^#/, ''))
      const errCode = params.get('error_code') || ''
      const desc    = (params.get('error_description') || '').replace(/\+/g, ' ')
      if (errCode === 'otp_expired' || /expired|invalid/i.test(desc)) {
        setError('That email link expired or was already used, often because email security software opens links before you can. Request a fresh code below and type it in here instead.')
      } else if (desc) {
        setError(desc)
      }
      window.history.replaceState(null, '', window.location.pathname)
    }

    const isRecovery = hash.includes('type=recovery')

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery-set')
        setError('')
        setNotice('')
      }
    })

    if (isRecovery) {
      setMode('recovery-set')
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) window.location.href = getRedirectParam() ?? '/projects'
      })
    }

    return () => { sub.subscription.unsubscribe() }
  }, [])

  // Switch modes from a nav link: clear transient state and messages.
  const switchMode = (m: Mode) => {
    setError('')
    setNotice('')
    setCode('')
    setNewPassword('')
    setMode(m)
  }

  /* ── Handlers ──────────────────────────────────────────────────────────── */

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) { setError(err.message); setLoading(false); return }
    window.location.href = getRedirectParam() ?? '/projects'
  }

  const requestSignInCode = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setCode('')
    setMode('otp-code')
    setNotice('Code sent to ' + email.trim() + '. Look for a 6-digit number in the email, not a link.')
  }

  const verifySignInCode = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type:  'email',
    })
    if (err) { setError(err.message); setLoading(false); return }
    window.location.href = getRedirectParam() ?? '/projects'
  }

  const requestResetCode = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim())
    setLoading(false)
    if (err) { setError(err.message); return }
    setCode(''); setNewPassword('')
    setMode('reset')
    setNotice('Reset code sent to ' + email.trim() + '. Look for a 6-digit number in the email, not a link.')
  }

  // Forgot-password via code: verify the recovery code to open a session,
  // then set the new password.
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    setLoading(true); setError(''); setNotice('')
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type:  'recovery',
    })
    if (vErr) { setError(vErr.message); setLoading(false); return }
    const { error: uErr } = await supabase.auth.updateUser({ password: newPassword })
    if (uErr) { setError(uErr.message); setLoading(false); return }
    window.location.href = getRedirectParam() ?? '/projects'
  }

  // Recovery link landed here and Supabase already opened a recovery session:
  // just set the new password.
  const submitRecoverySet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    setLoading(true); setError(''); setNotice('')
    const { error: uErr } = await supabase.auth.updateUser({ password: newPassword })
    if (uErr) { setError(uErr.message); setLoading(false); return }
    window.location.href = getRedirectParam() ?? '/projects'
  }

  /* ── Field + link helpers ──────────────────────────────────────────────── */

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

  const EmailField = (
    <div>
      <label style={labelStyle}>Email</label>
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        onFocus={() => setInputFocus('email')} onBlur={() => setInputFocus(null)}
        required autoComplete="email" style={inputStyle('email')} placeholder="you@agency.com"
      />
    </div>
  )

  const CodeField = (
    <div>
      <label style={labelStyle}>6-digit code</label>
      <input
        type="text" inputMode="numeric" maxLength={6} value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        onFocus={() => setInputFocus('code')} onBlur={() => setInputFocus(null)}
        required autoComplete="one-time-code" style={{ ...inputStyle('code'), letterSpacing: '0.3em' }} placeholder="123456"
      />
    </div>
  )

  const NewPasswordField = (
    <div>
      <label style={labelStyle}>New password</label>
      <input
        type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
        onFocus={() => setInputFocus('newPassword')} onBlur={() => setInputFocus(null)}
        required autoComplete="new-password" style={inputStyle('newPassword')} placeholder="At least 8 characters"
      />
    </div>
  )

  /* ── Per-mode form ─────────────────────────────────────────────────────── */

  const renderForm = () => {
    if (mode === 'password') {
      return (
        <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {EmailField}
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onFocus={() => setInputFocus('password')} onBlur={() => setInputFocus(null)}
              required autoComplete="current-password" style={inputStyle('password')} placeholder="••••••••"
            />
          </div>
          <Messages error={error} notice={notice} />
          <GoldButton loading={loading}>{loading ? 'Signing in...' : 'Sign in'}</GoldButton>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <TextLink onClick={() => switchMode('otp-email')}>Email me a code</TextLink>
            <TextLink onClick={() => switchMode('forgot-email')}>Forgot password?</TextLink>
          </div>
          <div style={{ textAlign: 'center', marginTop: 2 }}>
            <TextLink onClick={() => switchMode('reset')}>Already have a reset code?</TextLink>
          </div>
        </form>
      )
    }

    if (mode === 'otp-email') {
      return (
        <form onSubmit={requestSignInCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
            We email you a 6-digit code to type in here. No link to click, so it works even behind strict email security.
          </p>
          {EmailField}
          <Messages error={error} notice={notice} />
          <GoldButton loading={loading}>{loading ? 'Sending...' : 'Send code'}</GoldButton>
          <TextLink onClick={() => switchMode('password')}>Back to password sign-in</TextLink>
        </form>
      )
    }

    if (mode === 'otp-code') {
      return (
        <form onSubmit={verifySignInCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {CodeField}
          <Messages error={error} notice={notice} />
          <GoldButton loading={loading}>{loading ? 'Verifying...' : 'Verify and sign in'}</GoldButton>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <TextLink onClick={() => switchMode('otp-email')}>Send a new code</TextLink>
            <TextLink onClick={() => switchMode('password')}>Use a password</TextLink>
          </div>
        </form>
      )
    }

    if (mode === 'forgot-email') {
      return (
        <form onSubmit={requestResetCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
            Enter your email and we send a 6-digit reset code to type in here, then you set a new password.
          </p>
          {EmailField}
          <Messages error={error} notice={notice} />
          <GoldButton loading={loading}>{loading ? 'Sending...' : 'Send reset code'}</GoldButton>
          <TextLink onClick={() => switchMode('password')}>Back to password sign-in</TextLink>
        </form>
      )
    }

    if (mode === 'reset') {
      return (
        <form onSubmit={submitReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
            Enter the 6-digit reset code from your email and choose a new password. Requested a code already and came back to a fresh page? Enter your email, that code, and a new password here.
          </p>
          {EmailField}
          {CodeField}
          {NewPasswordField}
          <Messages error={error} notice={notice} />
          <GoldButton loading={loading}>{loading ? 'Saving...' : 'Set new password'}</GoldButton>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <TextLink onClick={() => switchMode('forgot-email')}>Send a new code</TextLink>
            <TextLink onClick={() => switchMode('password')}>Back to sign-in</TextLink>
          </div>
        </form>
      )
    }

    // recovery-set
    return (
      <form onSubmit={submitRecoverySet} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-dark)', lineHeight: 1.5 }}>
          Choose a new password for your account.
        </p>
        {NewPasswordField}
        <Messages error={error} notice={notice} />
        <GoldButton loading={loading}>{loading ? 'Saving...' : 'Set new password'}</GoldButton>
      </form>
    )
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

        <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)', marginBottom: 20 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', marginRight: 10, marginBottom: 1, verticalAlign: 'middle' }} />
          {LABEL[mode]}
        </div>

        {renderForm()}
      </div>

      {/* Sign up link (password mode only) */}
      {mode === 'password' && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-dark)' }}>
            Don&apos;t have an account?
          </p>
          <a
            href={signupHref}
            style={{ display: 'inline-block', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bone)', textDecoration: 'none', border: '1px solid rgba(245,238,224,0.2)', padding: '10px 24px', transition: 'border-color 180ms ease' }}
            className="sl-mono"
          >
            Start free trial
          </a>
        </div>
      )}

      {/* Footer links */}
      <p className="sl-mono" style={{ marginTop: 40, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-dark)', opacity: 0.6 }}>
        <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Terms</a>
        {' · '}
        <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</a>
      </p>

    </div>
  )
}

/* ── Error / notice blocks ───────────────────────────────────────────────── */

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

/* ── Text link (mode switcher) ───────────────────────────────────────────── */

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
