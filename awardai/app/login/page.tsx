'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    // Full page reload ensures session is available everywhere
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
          <h1 className="text-gray-900 font-semibold text-xl mb-6">Sign in</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">Email</label>
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
              <label className="block text-sm text-gray-600 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                placeholder="••••••••"
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
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6 leading-relaxed">
          We&apos;re currently in a private trial phase.<br />
          Want to get shortlisted in more awards?{' '}
          <a
            href="mailto:ben@positionadvisory.com?subject=I%E2%80%99d%20like%20to%20get%20Shortlisted%20more%20often%20please"
            className="text-green-700 hover:text-green-600 underline transition-colors"
          >
            Email ben@positionadvisory.com
          </a>
        </p>
      </div>
    </div>
  )
}
