'use client'
// Deploy to: app/settings/account/page.tsx

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useEngagement } from '@/lib/useEngagement'

/* ─── Types ─────────────────────────────────────────────────────────────── */

type BillingStatus = {
  status: 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | string
  plan: string
  trial_unlimited: boolean
  trial_end: number | null
  current_period_end: number | null
  cancel_at_period_end: boolean
  cancel_at: number | null
}

type ProfileData = {
  full_name: string
  email: string
  role: string
  org_id: number
  org_name: string
  project_count: number
  max_projects: number
  ai_actions_30d: number
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    trialing:  { label: 'Trial active',   bg: '#dbeafe', color: '#1e40af' },
    active:    { label: 'Active',         bg: '#dcfce7', color: '#166534' },
    past_due:  { label: 'Payment failed', bg: '#fef3c7', color: '#92400e' },
    canceled:  { label: 'Canceled',       bg: '#f3f4f6', color: '#6b7280' },
    free:      { label: 'Free',           bg: '#f3f4f6', color: '#6b7280' },
  }
  const s = map[status] ?? { label: status, bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

/* ─── Section card ───────────────────────────────────────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px 28px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#111827', textAlign: 'right' }}>{children}</span>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // Build 2 (Session 55): Help & Guidance section. updateState checks the
  // returned row (DM-16 silent no-op class) — a null return MUST surface as
  // an error here, never as a pretend-save. Tracking is independent of the
  // guidance toggle (Ben, Session 53): the toggle gates guidance UI only.
  const { stateLoaded, updateState, guidanceEnabled, track } = useEngagement(user?.id)
  const [guidanceSaving, setGuidanceSaving] = useState(false)
  const [guidanceError, setGuidanceError] = useState('')
  const [tipsReset, setTipsReset] = useState(false)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [portalLoading, setPortalLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [error, setError] = useState('')

  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      // Profile + org
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, email, role, org_id')
        .eq('id', user.id)
        .single()
      if (!prof) { setLoading(false); return }

      const { data: org } = await supabase
        .from('organizations')
        .select('name, max_projects')
        .eq('id', prof.org_id)
        .single()

      const { count: projectCount } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', prof.org_id)

      const { count: aiCount } = await supabase
        .from('usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', prof.org_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      setProfile({
        full_name: prof.full_name ?? '',
        email: prof.email ?? user.email ?? '',
        role: prof.role ?? 'member',
        org_id: prof.org_id,
        org_name: org?.name ?? '',
        project_count: projectCount ?? 0,
        max_projects: org?.max_projects ?? 5,
        ai_actions_30d: aiCount ?? 0,
      })
      setNameValue(prof.full_name ?? '')

      // Billing status
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        const res = await fetch('/api/billing/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setBilling(data)
        }
      }

      setLoading(false)
    }
    load()
  }, [user])

  const handleSaveName = async () => {
    if (!user || !nameValue.trim()) { setEditingName(false); return }
    setSavingName(true)
    await supabase.from('profiles').update({ full_name: nameValue.trim() }).eq('id', user.id)
    setProfile(p => p ? { ...p, full_name: nameValue.trim() } : p)
    setSavingName(false)
    setEditingName(false)
  }

  const handleOpenPortal = async () => {
    setPortalLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { router.replace('/login'); return }
    const res = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setPortalLoading(false); return }
    window.location.href = data.url
  }

  const handleUpgrade = async () => {
    setUpgradeLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { router.replace('/login'); return }
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setUpgradeLoading(false); return }
    window.location.href = data.url
  }

  const handleResetPassword = async () => {
    if (!user?.email) return
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setResetSent(true)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ── Help & Guidance handlers (Build 2, Session 55) ────────────────────────
  const handleToggleGuidance = async () => {
    if (guidanceSaving || !stateLoaded) return
    setGuidanceSaving(true)
    setGuidanceError('')
    const next = !guidanceEnabled
    const saved = await updateState({ guidance_enabled: next })
    if (!saved) {
      // DM-16 class: never pretend the save happened
      setGuidanceError('Your preference could not be saved. Please try again.')
    } else {
      track(next ? 'guidance_enabled' : 'guidance_disabled', { source: 'settings' })
    }
    setGuidanceSaving(false)
  }

  const handleResetTips = async () => {
    if (guidanceSaving) return
    setGuidanceSaving(true)
    setGuidanceError('')
    const saved = await updateState({ nudges: {} })
    if (!saved) {
      setGuidanceError('Tips could not be reset. Please try again.')
    } else {
      setTipsReset(true)
    }
    setGuidanceSaving(false)
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  const isTrialing    = billing?.status === 'trialing'
  const isActive      = billing?.status === 'active'
  const isPastDue     = billing?.status === 'past_due'
  const isCanceled    = billing?.status === 'canceled'
  const hasBilling    = isTrialing || isActive || isPastDue || isCanceled
  const isFree        = !hasBilling
  const cancelPending = billing?.cancel_at_period_end ?? false

  const initial = (profile?.full_name || profile?.email || '?')[0].toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: '"Geist", ui-sans-serif, system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/projects" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>S</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Shortlist</span>
            </Link>
            <span style={{ color: '#d1d5db' }}>›</span>
            <span style={{ fontSize: 14, color: '#6b7280' }}>Account</span>
          </div>
          <Link href="/projects" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
            ← Back to projects
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Page title + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{initial}</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>{profile?.full_name || profile?.email}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{profile?.org_name}</span>
              <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: '#f3f4f6', color: '#6b7280', textTransform: 'capitalize' }}>{profile?.role}</span>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', color: '#dc2626', fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Past-due warning */}
        {isPastDue && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>⚠ Payment failed</div>
            <div style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>
              Your last payment didn't go through. Update your payment method to keep access.{' '}
              <button onClick={handleOpenPortal} style={{ background: 'none', border: 'none', color: '#92400e', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}>
                Update now →
              </button>
            </div>
          </div>
        )}

        {/* ── Subscription ─────────────────────────────────────────────────── */}
        <Card title="Subscription">
          <Row label="Plan">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600 }}>
                {isFree ? 'Free' : 'Shortlist Pro — $299/month'}
              </span>
              {billing && <StatusBadge status={billing.status} />}
            </div>
          </Row>

          {isTrialing && billing?.trial_end && (
            <Row label="Trial ends">
              <div>
                <span style={{ fontWeight: 600, color: '#1e40af' }}>{fmt(billing.trial_end)}</span>
                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                  (card charged after trial)
                </span>
              </div>
            </Row>
          )}

          {isActive && !cancelPending && billing?.current_period_end && (
            <Row label="Next renewal">
              <span>{fmt(billing.current_period_end)}</span>
            </Row>
          )}

          {cancelPending && billing?.cancel_at && (
            <Row label="Access until">
              <div>
                <span style={{ fontWeight: 600, color: '#6b7280' }}>{fmt(billing.cancel_at)}</span>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>(subscription canceled)</span>
              </div>
            </Row>
          )}

          {isCanceled && !cancelPending && (
            <Row label="Status">
              <span style={{ color: '#6b7280' }}>Subscription ended</span>
            </Row>
          )}

          {/* Upgrade CTA */}
          {isFree && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: '#166534', background: '#dcfce7', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                14-day free trial · $299/month after · card required
              </div>
              <button
                onClick={handleUpgrade}
                disabled={upgradeLoading}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: upgradeLoading ? '#4ade80' : '#166534', color: '#fff', fontSize: 14, fontWeight: 600, cursor: upgradeLoading ? 'default' : 'pointer' }}
              >
                {upgradeLoading ? 'Redirecting…' : 'Start free trial'}
              </button>
            </div>
          )}

          {/* Stripe portal button */}
          {hasBilling && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={handleOpenPortal}
                disabled={portalLoading}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500, cursor: portalLoading ? 'default' : 'pointer', opacity: portalLoading ? 0.7 : 1 }}
              >
                {portalLoading ? 'Opening…' : 'Manage billing, invoices & payment method →'}
              </button>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                Opens Stripe portal · cancel, update card, download receipts
              </div>
            </div>
          )}
        </Card>

        {/* ── Usage ────────────────────────────────────────────────────────── */}
        <Card title="Usage">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '16px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                {profile?.project_count ?? 0}
                <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 400 }}> / {profile?.max_projects ?? 5}</span>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Active projects</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '16px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                {profile?.ai_actions_30d ?? 0}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>AI actions · last 30 days</div>
            </div>
          </div>
        </Card>

        {/* ── Profile ──────────────────────────────────────────────────────── */}
        <Card title="Profile">
          {/* Name row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>Name</span>
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={nameInputRef}
                  autoFocus
                  type="text"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                  style={{ fontSize: 14, border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', outline: 'none', width: 180 }}
                />
                <button onClick={handleSaveName} disabled={savingName} style={{ fontSize: 13, fontWeight: 600, color: '#166534', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {savingName ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingName(false)} style={{ fontSize: 13, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: '#111827' }}>{profile?.full_name || '—'}</span>
                <button onClick={() => setEditingName(true)} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Edit
                </button>
              </div>
            )}
          </div>

          <Row label="Email">
            <span style={{ color: '#6b7280' }}>{profile?.email}</span>
          </Row>
          <Row label="Organisation">{profile?.org_name}</Row>
          <Row label="Role">
            <span style={{ textTransform: 'capitalize' }}>{profile?.role}</span>
          </Row>
        </Card>

        {/* ── Team ─────────────────────────────────────────────────────────── */}
        <Card title="Team">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
              Manage team members and invitations.
            </p>
            <Link href="/settings/team" style={{ fontSize: 14, fontWeight: 500, color: '#166534', textDecoration: 'none' }}>
              Team settings →
            </Link>
          </div>
        </Card>

        {/* ── Help & Guidance (Build 2 Session 55; tour added Session 56) ──── */}
        {/* Master guidance switch: gates empty-state copy and (from Build 3)
            nudges + the Welcome Router re-offer. The Progress Spine and Next
            Step card are navigation/product output and stay on regardless.
            "Take the tour" navigates to /projects?tour=settings — the wizard
            mounts on the projects page, which logs tour_restarted on open
            (logging there, not here, so the event is never lost to the
            navigation cancelling an in-flight insert). */}
        <Card title="Help & Guidance">
          {guidanceError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 8 }}>
              {guidanceError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Show guidance</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                Tips and getting-started prompts across Shortlist. Turning this off is instant and global.
              </div>
            </div>
            <button
              onClick={handleToggleGuidance}
              disabled={guidanceSaving || !stateLoaded}
              aria-pressed={guidanceEnabled}
              aria-label={guidanceEnabled ? 'Turn guidance off' : 'Turn guidance on'}
              style={{ background: 'none', border: 'none', padding: 9, cursor: guidanceSaving || !stateLoaded ? 'default' : 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <span style={{ width: 46, height: 26, borderRadius: 99, background: guidanceEnabled ? '#166534' : '#d1d5db', position: 'relative', display: 'inline-block', transition: 'background 0.15s ease', opacity: guidanceSaving || !stateLoaded ? 0.6 : 1 }}>
                <span style={{ position: 'absolute', top: 3, left: guidanceEnabled ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
              </span>
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Take the tour</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                Replay the three-frame welcome tour at any time.
              </div>
            </div>
            <button
              onClick={() => router.push('/projects?tour=settings')}
              style={{ fontSize: 13, fontWeight: 500, color: '#374151', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', minHeight: 36, flexShrink: 0 }}
            >
              Start tour
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Reset tips</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                Bring back any tips you have dismissed.
              </div>
              {tipsReset && (
                <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>Tips reset.</div>
              )}
            </div>
            <button
              onClick={handleResetTips}
              disabled={guidanceSaving || tipsReset}
              style={{ fontSize: 13, fontWeight: 500, color: tipsReset ? '#9ca3af' : '#374151', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', cursor: guidanceSaving || tipsReset ? 'default' : 'pointer', minHeight: 36, flexShrink: 0 }}
            >
              {tipsReset ? 'Done' : 'Reset'}
            </button>
          </div>
        </Card>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <Card title="Security">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Password</div>
              {resetSent && (
                <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>Reset link sent — check your email.</div>
              )}
            </div>
            <button
              onClick={handleResetPassword}
              disabled={resetSent}
              style={{ fontSize: 13, fontWeight: 500, color: resetSent ? '#9ca3af' : '#374151', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', cursor: resetSent ? 'default' : 'pointer' }}
            >
              {resetSent ? 'Email sent' : 'Send reset email'}
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Sign out of Shortlist</span>
            <button
              onClick={handleSignOut}
              style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}
            >
              Sign out
            </button>
          </div>
        </Card>

        {/* ── Danger zone ──────────────────────────────────────────────────── */}
        <Card title="Danger zone">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Delete account</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Permanently remove your organisation and all data.</div>
            </div>
            <a
              href="mailto:ben@positionadvisory.com?subject=Account deletion request"
              style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', textDecoration: 'none' }}
            >
              Request deletion
            </a>
          </div>
        </Card>

      </main>
    </div>
  )
}
