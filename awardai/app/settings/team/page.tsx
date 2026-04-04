'use client'
// Deploy to: app/settings/team/page.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  created_at: string
}

type Invitation = {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [members,     setMembers]     = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [myRole,      setMyRole]      = useState<string>('member')
  const [orgName,     setOrgName]     = useState('')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviting,    setInviting]    = useState(false)
  const [inviteLink,  setInviteLink]  = useState('')
  const [inviteError, setInviteError] = useState('')

  // ── Redirect if not logged in ─────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  // ── Fetch team data ───────────────────────────────────────────────────
  const fetchTeam = async () => {
    setLoading(true)
    setError('')
    try {
      // Members — query profiles in same org
      const { data: membersData, error: membersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .order('created_at', { ascending: true })

      if (membersError) throw membersError
      setMembers(membersData ?? [])

      // My own role
      const me = membersData?.find(m => m.id === user?.id)
      if (me) setMyRole(me.role)

      // Org name
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .single()
      if (orgData) setOrgName(orgData.name)

      // Pending invitations (only visible to owner/admin via RLS)
      if (me && ['owner', 'admin'].includes(me.role)) {
        const { data: invData } = await supabase
          .from('invitations')
          .select('id, email, role, expires_at, created_at')
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
        setInvitations(invData ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load team')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchTeam()
  }, [user])

  // ── Send invite ────────────────────────────────────────────────────────
  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    setInviteLink('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { router.replace('/login'); return }

      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { setInviteError(data.error ?? 'Invite failed'); return }

      setInviteLink(data.link)
      setInviteEmail('')
      fetchTeam()
    } catch {
      setInviteError('Network error — please try again')
    } finally {
      setInviting(false)
    }
  }

  // ── Revoke invite ──────────────────────────────────────────────────────
  const revokeInvite = async (inviteId: string) => {
    await supabase.from('invitations').delete().eq('id', inviteId)
    setInvitations(prev => prev.filter(i => i.id !== inviteId))
  }

  const canManage = ['owner', 'admin'].includes(myRole)

  // ── Render ────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '40px 24px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>
              {orgName}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>Team</h1>
          </div>
          <Link href="/projects" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back to projects
          </Link>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Invite form — owners and admins only */}
        {canManage && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16, marginTop: 0 }}>
              Invite someone
            </h2>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="email"
                placeholder="colleague@agency.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                style={{
                  flex: 1, padding: '9px 14px', borderRadius: 8,
                  border: '1px solid #e5e7eb', fontSize: 14, outline: 'none',
                }}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                style={{
                  padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                  fontSize: 14, background: '#fff', color: '#374151', outline: 'none',
                }}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={sendInvite}
                disabled={inviting || !inviteEmail.trim()}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  background: inviting || !inviteEmail.trim() ? '#d1d5db' : '#111827',
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {inviting ? 'Sending…' : 'Invite'}
              </button>
            </div>

            {inviteError && (
              <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{inviteError}</p>
            )}

            {/* Invite link — copy & share manually until email is wired up */}
            {inviteLink && (
              <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: '#15803d', fontWeight: 600, marginBottom: 6 }}>
                  ✓ Invite created — copy this link and send it to them:
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 12, color: '#374151', wordBreak: 'break-all', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1fae5' }}>
                    {inviteLink}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#15803d', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12, marginBottom: 0 }}>
              Links expire after 7 days. The recipient will join your team when they sign up or log in with the invited email.
            </p>
          </div>
        )}

        {/* Current members */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>
              Members · {members.length}
            </h2>
          </div>
          {members.map((m, i) => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', padding: '14px 20px',
              borderBottom: i < members.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: m.id === user?.id ? '#111827' : '#e5e7eb',
                color: m.id === user?.id ? '#fff' : '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, marginRight: 12, flexShrink: 0,
              }}>
                {(m.full_name ?? m.email ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                  {m.full_name ?? m.email}
                  {m.id === user?.id && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>(you)</span>}
                </div>
                {m.full_name && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{m.email}</div>
                )}
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                background: m.role === 'owner' ? '#fef3c7' : m.role === 'admin' ? '#ede9fe' : '#f3f4f6',
                color:      m.role === 'owner' ? '#92400e' : m.role === 'admin' ? '#6d28d9' : '#6b7280',
              }}>
                {m.role}
              </span>
            </div>
          ))}
        </div>

        {/* Pending invitations */}
        {canManage && invitations.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>
                Pending invitations · {invitations.length}
              </h2>
            </div>
            {invitations.map((inv, i) => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', padding: '12px 20px',
                borderBottom: i < invitations.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: '#374151' }}>{inv.email}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  background: '#f3f4f6', color: '#6b7280', marginRight: 12,
                }}>
                  {inv.role}
                </span>
                <button
                  onClick={() => revokeInvite(inv.id)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca',
                    background: '#fff', color: '#dc2626', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
