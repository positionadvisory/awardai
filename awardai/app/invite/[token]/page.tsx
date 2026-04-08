'use client'
// Deploy to: app/invite/[token]/page.tsx

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type State = 'loading' | 'ready' | 'accepting' | 'done' | 'error'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [state,   setState]   = useState<State>('loading')
  const [message, setMessage] = useState('')
  const [user,    setUser]    = useState<{ email: string } | null>(null)

  // ── Check session on mount ─────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser({ email: session.user.email ?? '' })
        setState('ready')
      } else {
        // Not logged in — send to login with return URL
        router.replace(`/login?redirect=/invite/${token}`)
      }
    }
    check()
  }, [token, router])

  // ── Accept the invite ──────────────────────────────────────────────────
  const accept = async () => {
    setState('accepting')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) { router.replace('/login'); return }

      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage(data.error ?? 'Something went wrong')
        setState('error')
        return
      }

      setState('done')
      // Give the user a moment to see the success message, then redirect
      setTimeout(() => router.replace('/projects'), 2000)
    } catch {
      setMessage('Network error — please try again')
      setState('error')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Logo mark */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#111827', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, margin: '0 auto 24px',
        }}>
          🏆
        </div>

        {state === 'loading' && (
          <p style={{ color: '#6b7280', fontSize: 15 }}>Checking your invitation…</p>
        )}

        {state === 'ready' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              You've been invited to Shortlist
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
              You're signed in as <strong>{user?.email}</strong>.<br />
              Click below to join your team's workspace.
            </p>
            <button
              onClick={accept}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 10,
                border: 'none',
                background: '#111827',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Accept invitation →
            </button>
          </>
        )}

        {state === 'accepting' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Joining your team…
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15 }}>Just a moment.</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              You're in!
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15 }}>
              Taking you to your workspace…
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Couldn't accept invite
            </h1>
            <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 24, background: '#fef2f2', borderRadius: 8, padding: '10px 14px' }}>
              {message}
            </p>
            <a
              href="/projects"
              style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}
            >
              Go to app →
            </a>
          </>
        )}
      </div>
    </div>
  )
}
