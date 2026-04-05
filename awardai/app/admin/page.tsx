'use client'
// Deploy to: app/admin/page.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

const ADMIN_EMAIL = 'ben@positionadvisory.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gotshortlisted.com'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgRow = {
  id: number
  name: string
  slug: string
  plan: string
  trial_unlimited: boolean
  max_projects: number
  created_at: string
  member_count: number
  member_emails: string | null
  usage_last_30d: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [orgs, setOrgs]       = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [toggling, setToggling] = useState<number | null>(null)
  const [search, setSearch]   = useState('')

  // Platform invite state
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviting, setInviting]         = useState(false)
  const [inviteLink, setInviteLink]     = useState('')
  const [inviteError, setInviteError]   = useState('')
  const [copied, setCopied]             = useState(false)

  // ── Gate: only ben ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (user.email !== ADMIN_EMAIL) { router.replace('/projects'); return }
  }, [user, authLoading, router])

  // ── Fetch all orgs ────────────────────────────────────────────────────────
  const fetchOrgs = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) { router.replace('/login'); return }

      const res = await fetch('/api/admin/orgs', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to load orgs (${res.status})`)
      const data = await res.json()
      setOrgs(data.orgs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) fetchOrgs()
  }, [user])

  // ── Toggle trial_unlimited ─────────────────────────────────────────────────
  const toggleTrial = async (orgId: number, current: boolean) => {
    setToggling(orgId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch('/api/admin/trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ org_id: orgId, trial_unlimited: !current }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      setOrgs(prev =>
        prev.map(o => o.id === orgId ? { ...o, trial_unlimited: !current } : o)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  // ── Platform invite ───────────────────────────────────────────────────────
  const generatePlatformInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteError('Enter a valid email address.')
      return
    }
    setInviting(true)
    setInviteError('')
    setInviteLink('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch('/api/platform-invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate invite')
      setInviteLink(data.link)
      setInviteEmail('')
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setInviting(false)
    }
  }

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    return (
      o.name.toLowerCase().includes(q) ||
      (o.member_emails ?? '').toLowerCase().includes(q) ||
      o.slug.toLowerCase().includes(q)
    )
  })

  // ── Render ────────────────────────────────────────────────────────────────
  if (authLoading || (!user && !error)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>
              Shortlist Admin
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>
              Organisations
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search orgs or users…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                fontSize: 14, outline: 'none', width: 240, background: '#fff',
              }}
            />
            <button
              onClick={fetchOrgs}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', fontSize: 14, cursor: 'pointer', color: '#374151',
              }}
            >
              Refresh
            </button>
            <a
              href="/projects"
              style={{
                padding: '8px 16px', borderRadius: 8, background: '#111827',
                color: '#fff', fontSize: 14, textDecoration: 'none',
              }}
            >
              ← App
            </a>
          </div>
        </div>

        {/* ── Platform Invite ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            Invite someone to Shortlist
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Generates a sign-up link for a new user to create their own agency account. Copy the link and paste it into your invite email.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="their@agency.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generatePlatformInvite()}
              style={{
                flex: '1 1 240px', padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 14, outline: 'none', background: '#fff',
              }}
            />
            <button
              onClick={generatePlatformInvite}
              disabled={inviting}
              style={{
                padding: '9px 20px', borderRadius: 8, background: '#166534',
                color: '#fff', fontSize: 14, fontWeight: 500, border: 'none',
                cursor: inviting ? 'wait' : 'pointer', opacity: inviting ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {inviting ? 'Generating…' : 'Generate invite link'}
            </button>
          </div>

          {inviteError && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{inviteError}</div>
          )}

          {inviteLink && (
            <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                ✓ Invite link ready — valid for 30 days
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{
                  flex: 1, fontSize: 12, background: '#fff', border: '1px solid #d1fae5',
                  borderRadius: 6, padding: '6px 10px', color: '#374151', wordBreak: 'break-all',
                }}>
                  {inviteLink}
                </code>
                <button
                  onClick={copyLink}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: '1px solid #166534',
                    background: copied ? '#166534' : '#fff',
                    color: copied ? '#fff' : '#166534',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Paste this link into your invite email. The recipient will create their own account and organisation on Shortlist.
              </div>
            </div>
          )}
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total orgs',    value: orgs.length },
            { label: 'Trial unlimited', value: orgs.filter(o => o.trial_unlimited).length },
            { label: 'Total users',   value: orgs.reduce((s, o) => s + o.member_count, 0) },
            { label: 'Actions (30d)', value: orgs.reduce((s, o) => s + o.usage_last_30d, 0) },
          ].map(stat => (
            <div key={stat.label} style={{
              flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            Loading organisations…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            {search ? 'No orgs match that search.' : 'No organisations yet.'}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Organisation', 'Members', 'Plan', 'Actions (30d)', 'Super Trial'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((org, i) => (
                  <tr
                    key={org.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                      background: org.trial_unlimited ? '#f0fdf4' : '#fff',
                    }}
                  >
                    {/* Org name + members */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                        {org.member_emails ?? '—'}
                      </div>
                    </td>

                    {/* Member count */}
                    <td style={{ padding: '14px 16px', color: '#374151' }}>
                      {org.member_count}
                    </td>

                    {/* Plan */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 600,
                        background: org.plan === 'pro' ? '#ede9fe' : org.plan === 'enterprise' ? '#fef9c3' : '#f3f4f6',
                        color:      org.plan === 'pro' ? '#7c3aed' : org.plan === 'enterprise' ? '#854d0e'  : '#6b7280',
                      }}>
                        {org.plan}
                      </span>
                    </td>

                    {/* Usage */}
                    <td style={{ padding: '14px 16px', color: '#374151' }}>
                      {org.usage_last_30d}
                    </td>

                    {/* Trial toggle */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => toggleTrial(org.id, org.trial_unlimited)}
                        disabled={toggling === org.id}
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          width: 44,
                          height: 24,
                          borderRadius: 99,
                          border: 'none',
                          cursor: toggling === org.id ? 'wait' : 'pointer',
                          background: org.trial_unlimited ? '#22c55e' : '#d1d5db',
                          transition: 'background 0.2s',
                          padding: 0,
                        }}
                        title={org.trial_unlimited ? 'Click to remove Super Trial' : 'Click to grant Super Trial'}
                      >
                        <span style={{
                          position: 'absolute',
                          left: org.trial_unlimited ? 22 : 2,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                      {org.trial_unlimited && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                          Unlimited
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
          Accessible only from ben@positionadvisory.com
        </div>
      </div>
    </div>
  )
}
