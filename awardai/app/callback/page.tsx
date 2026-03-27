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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">A</span>
          </div>
          <span className="text-white font-semibold text-lg">AwardAI</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h1 className="text-white font-semibold text-xl mb-6">Sign in</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                placeholder="you@agency.com"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">Access by invitation only.</p>
      </div>
    </div>
  )
}
