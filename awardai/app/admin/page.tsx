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

type ShowRequest = {
  id: number
  show_name: string | null
  show_url: string | null
  market: string | null
  entry_kit_url: string | null
  project_id: number | null
  requested_by: string | null
  org_id: number | null
  status: 'pending' | 'researched' | 'added' | 'declined'
  research_result: ShowResearch | null
  created_at: string
}

type ShowResearch = {
  show_name: string | null
  show_url: string | null
  deadline_date: string | null
  deadline_label: string | null
  entry_fee_range: string | null
  categories: string[] | null
  description: string | null
  industry: string | null
  judging_philosophy: string | null
  scoring_emphasis: string | null
  language_guidance: string | null
  common_mistakes: string | null
  jury_composition_notes: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // ── Orgs ──────────────────────────────────────────────────────────────────
  const [orgs, setOrgs]       = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [toggling, setToggling] = useState<number | null>(null)
  const [search, setSearch]   = useState('')

  // ── Platform invite ────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviting, setInviting]         = useState(false)
  const [inviteLink, setInviteLink]     = useState('')
  const [inviteError, setInviteError]   = useState('')
  const [copied, setCopied]             = useState(false)

  // ── Show requests ──────────────────────────────────────────────────────────
  const [showRequests, setShowRequests]             = useState<ShowRequest[]>([])
  const [showRequestsLoading, setShowRequestsLoading] = useState(false)
  const [expandedRequest, setExpandedRequest]       = useState<number | null>(null)
  const [researchingId, setResearchingId]           = useState<number | null>(null)
  const [researchError, setResearchError]           = useState<Record<number, string>>({})
  const [editingResearch, setEditingResearch]       = useState<Record<number, ShowResearch>>({})
  const [addingId, setAddingId]                     = useState<number | null>(null)
  const [addError, setAddError]                     = useState<Record<number, string>>({})
  const [decliningId, setDecliningId]               = useState<number | null>(null)

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

  // ── Fetch show requests ───────────────────────────────────────────────────
  const fetchShowRequests = async () => {
    setShowRequestsLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch('/api/admin/show-requests', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to load show requests (${res.status})`)
      const data = await res.json()
      setShowRequests(data.requests ?? [])
    } catch (e) {
      console.error('fetchShowRequests error:', e)
    } finally {
      setShowRequestsLoading(false)
    }
  }

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) fetchShowRequests()
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

  // ── Research a show ───────────────────────────────────────────────────────
  const researchShow = async (req: ShowRequest) => {
    if (!req.show_url) {
      setResearchError(prev => ({ ...prev, [req.id]: 'No URL provided for this request.' }))
      return
    }
    setResearchingId(req.id)
    setResearchError(prev => { const n = { ...prev }; delete n[req.id]; return n })

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/research-show`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            show_request_id: req.id,
            url: req.show_url,
            market: req.market ?? undefined,
          }),
        }
      )

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Research failed (${res.status})`)

      const result: ShowResearch = data.result
      // Update local state — mark as researched and store result
      setShowRequests(prev =>
        prev.map(r => r.id === req.id ? { ...r, status: 'researched', research_result: result } : r)
      )
      // Pre-populate edit state from result
      setEditingResearch(prev => ({ ...prev, [req.id]: { ...result } }))
      setExpandedRequest(req.id)
    } catch (e) {
      setResearchError(prev => ({ ...prev, [req.id]: e instanceof Error ? e.message : 'Research failed.' }))
    } finally {
      setResearchingId(null)
    }
  }

  // ── Add show to system ────────────────────────────────────────────────────
  const addShow = async (req: ShowRequest) => {
    const research = editingResearch[req.id] ?? req.research_result
    if (!research?.show_name?.trim()) {
      setAddError(prev => ({ ...prev, [req.id]: 'Show name is required.' }))
      return
    }

    setAddingId(req.id)
    setAddError(prev => { const n = { ...prev }; delete n[req.id]; return n })

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const res = await fetch('/api/admin/add-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ show_request_id: req.id, ...research }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Add show failed (${res.status})`)

      // Mark as added in local state
      setShowRequests(prev =>
        prev.map(r => r.id === req.id ? { ...r, status: 'added' } : r)
      )
      setExpandedRequest(null)
    } catch (e) {
      setAddError(prev => ({ ...prev, [req.id]: e instanceof Error ? e.message : 'Failed to add show.' }))
    } finally {
      setAddingId(null)
    }
  }

  // ── Decline a request ─────────────────────────────────────────────────────
  const declineRequest = async (req: ShowRequest) => {
    setDecliningId(req.id)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      await fetch('/api/admin/show-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: req.id, status: 'declined' }),
      })

      setShowRequests(prev =>
        prev.map(r => r.id === req.id ? { ...r, status: 'declined' } : r)
      )
      if (expandedRequest === req.id) setExpandedRequest(null)
    } catch (e) {
      console.error('declineRequest error:', e)
    } finally {
      setDecliningId(null)
    }
  }

  // ── Update a research field inline ────────────────────────────────────────
  const updateField = (reqId: number, field: keyof ShowResearch, value: string | string[] | null) => {
    setEditingResearch(prev => ({
      ...prev,
      [reqId]: { ...(prev[reqId] ?? {}), [field]: value } as ShowResearch,
    }))
  }

  // ── Filtered orgs ─────────────────────────────────────────────────────────
  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    return (
      o.name.toLowerCase().includes(q) ||
      (o.member_emails ?? '').toLowerCase().includes(q) ||
      o.slug.toLowerCase().includes(q)
    )
  })

  const pendingRequests   = showRequests.filter(r => r.status === 'pending' || r.status === 'researched')
  const resolvedRequests  = showRequests.filter(r => r.status === 'added' || r.status === 'declined')

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

        {/* ── Show Requests ────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                Show Requests
                {pendingRequests.length > 0 && (
                  <span style={{
                    marginLeft: 8, display: 'inline-block', background: '#fef3c7',
                    color: '#92400e', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    padding: '2px 8px',
                  }}>
                    {pendingRequests.length} pending
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                Users requesting shows not yet in Shortlist.
              </div>
            </div>
            <button
              onClick={fetchShowRequests}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151',
              }}
            >
              Refresh
            </button>
          </div>

          {showRequestsLoading ? (
            <div style={{ fontSize: 13, color: '#9ca3af', padding: '16px 0' }}>Loading requests…</div>
          ) : showRequests.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9ca3af', padding: '16px 0' }}>No show requests yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Pending / researched */}
              {pendingRequests.map(req => (
                <ShowRequestCard
                  key={req.id}
                  req={req}
                  expanded={expandedRequest === req.id}
                  onToggleExpand={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                  researching={researchingId === req.id}
                  researchError={researchError[req.id]}
                  onResearch={() => researchShow(req)}
                  editingResearch={editingResearch[req.id] ?? req.research_result ?? null}
                  onUpdateField={(field, value) => updateField(req.id, field, value)}
                  adding={addingId === req.id}
                  addError={addError[req.id]}
                  onAdd={() => addShow(req)}
                  declining={decliningId === req.id}
                  onDecline={() => declineRequest(req)}
                />
              ))}

              {/* Resolved (collapsed by default) */}
              {resolvedRequests.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}>
                    {resolvedRequests.length} resolved request{resolvedRequests.length !== 1 ? 's' : ''}
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {resolvedRequests.map(req => (
                      <div key={req.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 8, border: '1px solid #f3f4f6',
                        background: '#fafafa',
                      }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                            {req.show_name ?? '(unnamed)'}
                          </span>
                          {req.show_url && (
                            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{req.show_url}</span>
                          )}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                          background: req.status === 'added' ? '#dcfce7' : '#fee2e2',
                          color: req.status === 'added' ? '#166534' : '#991b1b',
                        }}>
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
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

        {/* Orgs table */}
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
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                        {org.member_emails ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{org.member_count}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                        background: org.plan === 'pro' ? '#ede9fe' : org.plan === 'enterprise' ? '#fef9c3' : '#f3f4f6',
                        color:      org.plan === 'pro' ? '#7c3aed' : org.plan === 'enterprise' ? '#854d0e'  : '#6b7280',
                      }}>
                        {org.plan}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{org.usage_last_30d}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => toggleTrial(org.id, org.trial_unlimited)}
                        disabled={toggling === org.id}
                        style={{
                          position: 'relative', display: 'inline-flex', alignItems: 'center',
                          width: 44, height: 24, borderRadius: 99, border: 'none',
                          cursor: toggling === org.id ? 'wait' : 'pointer',
                          background: org.trial_unlimited ? '#22c55e' : '#d1d5db',
                          transition: 'background 0.2s', padding: 0,
                        }}
                        title={org.trial_unlimited ? 'Click to remove Super Trial' : 'Click to grant Super Trial'}
                      >
                        <span style={{
                          position: 'absolute', left: org.trial_unlimited ? 22 : 2,
                          width: 20, height: 20, borderRadius: '50%', background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                        }} />
                      </button>
                      {org.trial_unlimited && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Unlimited</span>
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

// ─── ShowRequestCard sub-component ───────────────────────────────────────────

type ShowRequestCardProps = {
  req: ShowRequest
  expanded: boolean
  onToggleExpand: () => void
  researching: boolean
  researchError: string | undefined
  onResearch: () => void
  editingResearch: ShowResearch | null
  onUpdateField: (field: keyof ShowResearch, value: string | string[] | null) => void
  adding: boolean
  addError: string | undefined
  onAdd: () => void
  declining: boolean
  onDecline: () => void
}

function ShowRequestCard({
  req, expanded, onToggleExpand,
  researching, researchError, onResearch,
  editingResearch, onUpdateField,
  adding, addError, onAdd,
  declining, onDecline,
}: ShowRequestCardProps) {
  const hasResearch = req.status === 'researched' || !!editingResearch

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 10,
      background: '#fff', overflow: 'hidden',
    }}>
      {/* Row header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {req.show_name ?? '(no name provided)'}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
              background: req.status === 'pending' ? '#fef3c7' : '#dbeafe',
              color: req.status === 'pending' ? '#92400e' : '#1e40af',
            }}>
              {req.status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {req.show_url && (
              <a href={req.show_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#166534', textDecoration: 'none' }}>
                {req.show_url.replace(/^https?:\/\//, '').slice(0, 50)}
              </a>
            )}
            {req.market && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>{req.market}</span>
            )}
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {!hasResearch && (
            <button
              onClick={onResearch}
              disabled={researching || !req.show_url}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #166534',
                background: '#fff', color: '#166534', fontSize: 13, fontWeight: 500,
                cursor: researching || !req.show_url ? 'not-allowed' : 'pointer',
                opacity: researching || !req.show_url ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {researching ? 'Researching…' : '🔍 Research'}
            </button>
          )}
          {hasResearch && !expanded && (
            <button
              onClick={onToggleExpand}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Review ↓
            </button>
          )}
          {hasResearch && expanded && (
            <button
              onClick={onToggleExpand}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
              }}
            >
              ↑ Collapse
            </button>
          )}
          <button
            onClick={onDecline}
            disabled={declining}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', color: '#9ca3af', fontSize: 13, cursor: declining ? 'wait' : 'pointer',
              opacity: declining ? 0.5 : 1,
            }}
            title="Decline — don't add this show"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Research error */}
      {researchError && (
        <div style={{ margin: '0 16px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>
          {researchError}
        </div>
      )}

      {/* Research result panel */}
      {expanded && editingResearch && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', background: '#fafafa' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Research Summary — review and edit before adding
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            {/* Show name */}
            <ResearchField
              label="Show name *"
              value={editingResearch.show_name ?? ''}
              onChange={v => onUpdateField('show_name', v)}
            />
            {/* Industry */}
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Industry</div>
              <select
                value={editingResearch.industry ?? 'marketing'}
                onChange={e => onUpdateField('industry', e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
                  fontSize: 13, background: '#fff', color: '#111827', outline: 'none',
                }}
              >
                {['marketing', 'architecture', 'legal', 'finance', 'technology', 'healthcare', 'other'].map(i => (
                  <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* Deadline */}
            <ResearchField
              label="Deadline date (YYYY-MM-DD)"
              value={editingResearch.deadline_date ?? ''}
              onChange={v => onUpdateField('deadline_date', v || null)}
            />
            {/* Deadline label */}
            <ResearchField
              label="Deadline label"
              value={editingResearch.deadline_label ?? ''}
              onChange={v => onUpdateField('deadline_label', v || null)}
            />
            {/* Entry fee */}
            <ResearchField
              label="Entry fee range"
              value={editingResearch.entry_fee_range ?? ''}
              onChange={v => onUpdateField('entry_fee_range', v || null)}
            />
            {/* Market */}
            <ResearchField
              label="Market / region"
              value={(editingResearch as ShowResearch & { market?: string }).market ?? req.market ?? ''}
              onChange={v => onUpdateField('show_name', editingResearch.show_name ?? '')}
            />
          </div>

          {/* Description */}
          <ResearchField
            label="Description"
            value={editingResearch.description ?? ''}
            onChange={v => onUpdateField('description', v || null)}
            multiline
            style={{ marginTop: 12 }}
          />

          {/* Categories */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              Categories <span style={{ color: '#9ca3af' }}>(comma-separated)</span>
            </div>
            <textarea
              value={(editingResearch.categories ?? []).join(', ')}
              onChange={e => onUpdateField('categories', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              rows={2}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
                fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Jury intelligence fields */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Jury Intelligence
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ResearchField label="Judging philosophy" value={editingResearch.judging_philosophy ?? ''} onChange={v => onUpdateField('judging_philosophy', v || null)} multiline />
              <ResearchField label="Scoring emphasis" value={editingResearch.scoring_emphasis ?? ''} onChange={v => onUpdateField('scoring_emphasis', v || null)} multiline />
              <ResearchField label="Language guidance" value={editingResearch.language_guidance ?? ''} onChange={v => onUpdateField('language_guidance', v || null)} multiline />
              <ResearchField label="Common mistakes" value={editingResearch.common_mistakes ?? ''} onChange={v => onUpdateField('common_mistakes', v || null)} multiline />
              <ResearchField label="Jury composition" value={editingResearch.jury_composition_notes ?? ''} onChange={v => onUpdateField('jury_composition_notes', v || null)} multiline />
            </div>
          </div>

          {/* Add error */}
          {addError && (
            <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>
              {addError}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onDecline}
              disabled={declining}
              style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer',
              }}
            >
              Decline
            </button>
            <button
              onClick={onAdd}
              disabled={adding}
              style={{
                padding: '9px 22px', borderRadius: 8, border: 'none',
                background: adding ? '#86efac' : '#166534',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: adding ? 'wait' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {adding ? 'Adding…' : '✓ Add to Shortlist'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ResearchField helper ─────────────────────────────────────────────────────

function ResearchField({
  label, value, onChange, multiline, style: extraStyle,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  style?: React.CSSProperties
}) {
  const shared: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
    background: '#fff', color: '#111827',
  }
  return (
    <div style={extraStyle}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ ...shared, resize: 'vertical' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={shared}
        />
      )}
    </div>
  )
}
