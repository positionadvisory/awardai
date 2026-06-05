'use client'
// Deploy to: app/signup/page.tsx

import { useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'

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

function SignupContent() {
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      window.location.href = '/login'
      return
    }

    window.location.href = '/projects'
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
          <h1 className="text-gray-900 font-semibold text-xl mb-1">Start your free trial</h1>
          <p className="text-sm text-gray-400 mb-6">14 days free. Card required to continue.</p>

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
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                placeholder="you@agency.com"
              />
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

            <p className="text-xs text-gray-400 text-center leading-relaxed mt-3">
              By creating your account, you agree to our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-green-700 underline hover:text-green-600">
                Terms of Use
              </a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-green-700 underline hover:text-green-600">
                Privacy Policy
              </a>.
            </p>
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
