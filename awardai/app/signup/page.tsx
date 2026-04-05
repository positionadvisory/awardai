'use client'
// Deploy to: app/signup/page.tsx
//
// New user sign-up page — only reachable via a valid platform invite link.
// URL format: /signup?token=xxx&email=user@agency.com
// On success: Supabase onboarding trigger auto-creates their org.

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Outer shell — required by Next.js 14 when using useSearchParams ───────────
export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    }>
      <SignupContent />
    </Suspense>
  )
}

// ── Inner component — reads URL params, handles all logic ─────────────────────
function SignupContent() {
  const router       = useRouter()
  const params       = useSearchParams()
  const tokenParam   = params.get('token') ?? ''
  const emailParam   = params.get('email') ?? ''

  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState(emailParam)
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid]  = useState(false)

  // ── Validate token on load ────────────────────────────────────────────────
  useEffect(() => {
    async function validate() {
      if (!tokenParam) { setValidating(false); return }
      const { data } = await supabase
        .from('platform_invitations')
        .select('email, expires_at, used_at')
        .eq('token', tokenParam)
        .maybeSingle()

      if (
        data &&
        !data.used_at &&
        new Date(data.expires_at) > new Date()
      ) {
        setTokenValid(true)
        // Pre-fill email if it matches the invite
        if (data.email) setEmail(data.email)
      }
      setValidating(false)
    }
    validate()
  }, [tokenParam])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tokenValid) return
    setLoading(true)
    setError('')

    // 1. Create the Supabase auth user
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
      // Supabase returned no error but also no user — email confirmation may be required
      setError('Please check your email to confirm your account before signing in.')
      setLoading(false)
      return
    }

    // 2. Mark the platform invite as used
    await supabase
      .from('platform_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('token', tokenParam)

    // 3. Sign in immediately (if email confirmation not required)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      // Account created but can't auto-sign-in — send to login
      window.location.href = '/login'
      return
    }

    // 4. Redirect to projects — onboarding trigger will have created their org
    window.location.href = '/projects'
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (validating) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <p className="text-sm text-gray-400">Validating your invite…</p>
      </div>
    )
  }

  if (!tokenParam || !tokenValid) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-gray-900 font-semibold text-lg">Shortlist</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
            <h1 className="text-gray-900 font-semibold text-xl mb-3">Invalid invite link</h1>
            <p className="text-sm text-gray-500 mb-6">
              This invite link is invalid, has expired, or has already been used.
              If you think this is a mistake, email{' '}
              <a
                href="mailto:ben@positionadvisory.com?subject=Shortlist%20invite%20issue"
                className="text-green-700 underline"
              >
                ben@positionadvisory.com
              </a>
            </p>
            <a
              href="/login"
              className="block w-full text-center bg-green-800 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              Go to sign in
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center">
            <span className="text-sm font-bold text-white">S</span>
          </div>
          <span className="text-gray-900 font-semibold text-lg">Shortlist</span>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-gray-900 font-semibold text-xl mb-1">Create your account</h1>
          <p className="text-sm text-gray-400 mb-6">Set up your agency&apos;s Shortlist workspace.</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Work email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                readOnly={!!emailParam}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm disabled:bg-gray-50"
                placeholder="you@agency.com"
              />
              {emailParam && (
                <p className="text-xs text-gray-400 mt-1">This invite is linked to this email address.</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Choose a password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                placeholder="Min. 8 characters"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-green-700 hover:text-green-600 underline transition-colors">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
