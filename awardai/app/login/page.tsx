'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  // ── Sign-in state ──────────────────────────────────────────────────────────
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // ── Request access state ───────────────────────────────────────────────────
  const [showRequest, setShowRequest]       = useState(false)
  const [reqName, setReqName]               = useState('')
  const [reqEmail, setReqEmail]             = useState('')
  const [reqAgency, setReqAgency]           = useState('')
  const [reqNote, setReqNote]               = useState('')
  const [reqSubmitting, setReqSubmitting]   = useState(false)
  const [reqDone, setReqDone]               = useState(false)
  const [reqError, setReqError]             = useState('')

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

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    setReqSubmitting(true)
    setReqError('')

    try {
      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:   reqName.trim(),
          email:  reqEmail.trim(),
          agency: reqAgency.trim(),
          note:   reqNote.trim(),
        }),
      })

      if (!res.ok) throw new Error('Request failed')
      setReqDone(true)
    } catch {
      setReqError('Something went wrong — please email ben@positionadvisory.com directly.')
    } finally {
      setReqSubmitting(false)
    }
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

        {/* Sign-in card */}
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

        {/* Request access */}
        <div className="mt-5">
          {!showRequest ? (
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-3">Don&apos;t have an account?</p>
              <button
                onClick={() => setShowRequest(true)}
                className="w-full border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                Request access
              </button>
            </div>
          ) : reqDone ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-5 text-center">
              <p className="text-green-800 font-medium text-sm mb-1">Request sent ✓</p>
              <p className="text-green-700 text-xs leading-relaxed">
                We&apos;ll be in touch at {reqEmail}. Alpha cohort is limited — we appreciate your patience.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-gray-900 font-semibold text-base">Request access</h2>
                <button
                  onClick={() => { setShowRequest(false); setReqError('') }}
                  className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRequestAccess} className="space-y-3.5">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Your name</label>
                  <input
                    type="text"
                    value={reqName}
                    onChange={e => setReqName(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                    placeholder="Jane Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Work email</label>
                  <input
                    type="email"
                    value={reqEmail}
                    onChange={e => setReqEmail(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                    placeholder="you@agency.com"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Agency name</label>
                  <input
                    type="text"
                    value={reqAgency}
                    onChange={e => setReqAgency(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm"
                    placeholder="Ogilvy, TBWA, etc."
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Anything else? <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={reqNote}
                    onChange={e => setReqNote(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors text-sm resize-none"
                    placeholder="Which shows are you targeting? When's your next deadline?"
                  />
                </div>

                {reqError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                    <p className="text-red-600 text-xs">{reqError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={reqSubmitting}
                  className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm mt-1"
                >
                  {reqSubmitting ? 'Sending…' : 'Send request'}
                </button>
              </form>

              <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">
                Alpha cohort is limited to 20 agencies.<br />
                We&apos;ll reply within 24 hours.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
