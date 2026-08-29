'use client'
// Deploy to: app/invite/[token]/page.tsx
//
// 29 Aug 2026 (INVITE-PATH-REPAIR, second PR). This page used to render
// "You've been invited to Shortlist / Click below to join your team's
// workspace" on mount with zero network requests, which meant it said that
// to an expired invite, a spent invite, an invented token, and to a visitor
// signed in as somebody other than the invited person. The only way to find
// out was to click and take an error whose copy named the problem and no fix.
//
// It now validates against GET /api/invite/accept first and states what is
// actually true before offering the button. Where the fix is to be someone
// else, it offers that as an action rather than describing it.
//
// It also warns before an acceptance orphans a workspace (R5). Accepting an
// invite MOVES the user: profiles.org_id is scalar, there is no join table
// and no switcher, and the accept route deliberately keeps an org that holds
// projects rather than deleting it. So the projects survive with nobody able
// to reach them, and the person clicking deserves to know that in advance.

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status =
  | 'ok'
  | 'email_mismatch'
  | 'expired'
  | 'used'
  | 'not_found'
  | 'already_member'

type LeavingOrg = { name: string; projectCount: number; memberCount: number }

type Preview = {
  status: Status
  invitedEmail?: string
  sessionEmail?: string
  orgName?: string
  role?: string
  expiresAt?: string
  leavingOrg?: LeavingOrg | null
}

type View = 'loading' | 'ready' | 'blocked' | 'accepting' | 'done' | 'error'

const CARD: CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  padding: '48px 40px',
  maxWidth: 460,
  width: '100%',
  textAlign: 'center',
}

const PRIMARY_BTN: CSSProperties = {
  width: '100%',
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

const SECONDARY_BTN: CSSProperties = {
  width: '100%',
  padding: '11px 0',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#374151',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 10,
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [view,    setView]    = useState<View>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState('')
  const [confirmedMove, setConfirmedMove] = useState(false)

  // Validate on mount, before anything is offered.
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`)
        return
      }

      try {
        const res = await fetch(`/api/invite/accept?token=${encodeURIComponent(String(token))}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setMessage(data.error ?? 'Could not check this invitation')
          setView('error')
          return
        }

        setPreview(data as Preview)
        setView(data.status === 'ok' ? 'ready' : 'blocked')
      } catch {
        if (cancelled) return
        setMessage('Network error. Please reload the page.')
        setView('error')
      }
    }

    check()
    return () => { cancelled = true }
  }, [token, router])

  // Sign out and come back to this same invite.
  const switchAccount = async () => {
    await supabase.auth.signOut()
    router.replace(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`)
  }

  const accept = async () => {
    setView('accepting')
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
        setView('error')
        return
      }

      setView('done')
      setTimeout(() => router.replace('/projects'), 2000)
    } catch {
      setMessage('Network error. Please try again.')
      setView('error')
    }
  }

  const leaving = preview?.leavingOrg ?? null
  const mustConfirm = Boolean(leaving) && !confirmedMove

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
      padding: 24,
    }}>
      <div style={CARD}>

        {/* Logo mark */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#111827', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, margin: '0 auto 24px',
        }}>
          🏆
        </div>

        {view === 'loading' && (
          <p style={{ color: '#6b7280', fontSize: 15 }}>Checking your invitation…</p>
        )}

        {view === 'ready' && preview && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Join {preview.orgName} on Shortlist
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15, marginBottom: leaving ? 20 : 32, lineHeight: 1.6 }}>
              You're signed in as <strong>{preview.sessionEmail}</strong>, which is the
              address this invitation was sent to. You'll join as a{' '}
              <strong>{preview.role}</strong>.
            </p>

            {leaving && (
              <div style={{
                textAlign: 'left',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 20,
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: '0 0 8px' }}>
                  This will move you out of {leaving.name}
                </p>
                <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, margin: '0 0 10px' }}>
                  A Shortlist account belongs to one workspace at a time. {leaving.name} holds{' '}
                  <strong>{leaving.projectCount} {leaving.projectCount === 1 ? 'project' : 'projects'}</strong>
                  {leaving.memberCount <= 1
                    ? ', and you are its only member, so nobody will be able to open them after you move.'
                    : ', which will stay with the other members of that workspace.'}
                </p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#78350f', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmedMove}
                    onChange={e => setConfirmedMove(e.target.checked)}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                  <span>I understand, move my account to {preview.orgName}.</span>
                </label>
              </div>
            )}

            <button
              onClick={accept}
              disabled={mustConfirm}
              style={{
                ...PRIMARY_BTN,
                background: mustConfirm ? '#d1d5db' : '#111827',
                cursor: mustConfirm ? 'not-allowed' : 'pointer',
              }}
            >
              Accept invitation →
            </button>

            {preview.expiresAt && (
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 14, marginBottom: 0 }}>
                This invitation expires on {formatDate(preview.expiresAt)}.
              </p>
            )}
          </>
        )}

        {view === 'blocked' && preview?.status === 'email_mismatch' && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
              This invitation is for a different account
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              It was sent to <strong style={{ color: '#111827' }}>{preview.invitedEmail}</strong>,
              but you're signed in as <strong style={{ color: '#111827' }}>{preview.sessionEmail}</strong>.
            </p>
            <button onClick={switchAccount} style={PRIMARY_BTN}>
              Sign out and use {preview.invitedEmail}
            </button>
            <a
              href="/projects"
              style={{ display: 'block', color: '#6b7280', fontSize: 14, textDecoration: 'none', marginTop: 16 }}
            >
              Stay signed in as {preview.sessionEmail} →
            </a>
          </>
        )}

        {view === 'blocked' && preview?.status === 'expired' && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
              This invitation has expired
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              It lapsed on {formatDate(preview.expiresAt)}. Ask whoever invited you to
              send a new one from their team settings, and the new link will reach{' '}
              <strong style={{ color: '#111827' }}>{preview.invitedEmail}</strong>.
            </p>
            <a href="/projects" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}>
              Go to app →
            </a>
          </>
        )}

        {view === 'blocked' && preview?.status === 'used' && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
              This invitation has already been used
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              It was sent to <strong style={{ color: '#111827' }}>{preview.invitedEmail}</strong> and
              has already been accepted. If that was not you, ask them to send a new invitation.
            </p>
            <a href="/projects" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}>
              Go to app →
            </a>
          </>
        )}

        {view === 'blocked' && preview?.status === 'not_found' && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
              This invitation link is not valid
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              It may have been revoked, or the link may have been cut short in transit.
              Ask whoever invited you to send it again.
            </p>
            <a href="/projects" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }}>
              Go to app →
            </a>
          </>
        )}

        {view === 'blocked' && preview?.status === 'already_member' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              You're already in
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              Your account is a member of {preview.orgName}. Nothing left to do here.
            </p>
            <a href="/projects" style={{ ...PRIMARY_BTN, display: 'block', textDecoration: 'none', lineHeight: '1.5' }}>
              Go to your workspace →
            </a>
          </>
        )}

        {view === 'accepting' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Joining your team…
            </h1>
            <p style={{ color: '#6b7280', fontSize: 15 }}>Just a moment.</p>
          </>
        )}

        {view === 'done' && (
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

        {view === 'error' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              Couldn't accept invite
            </h1>
            <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 24, background: '#fef2f2', borderRadius: 8, padding: '10px 14px' }}>
              {message}
            </p>
            <button onClick={switchAccount} style={SECONDARY_BTN}>
              Sign in as someone else
            </button>
            <a
              href="/projects"
              style={{ display: 'block', color: '#6b7280', fontSize: 14, textDecoration: 'none', marginTop: 16 }}
            >
              Go to app →
            </a>
          </>
        )}

      </div>
    </div>
  )
}
