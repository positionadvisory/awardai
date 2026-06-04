'use client'
// Deploy to: app/settings/billing/page.tsx
// Redirects to /settings/account (consolidated account + billing page)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BillingRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/settings/account') }, [router])
  return null
}

/* ── Original billing page preserved below for reference ── */
/*
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

type OrgPlan = {
  plan:            string
  trial_unlimited: boolean
  max_projects:    number
  usage_last_30d:  number
}

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [org,       setOrg]       = useState<OrgPlan | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [error,     setError]     = useState('')
  const [upgraded,  setUpgraded]  = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  // Detect ?upgraded=1 in URL
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('upgraded=1')) {
      setUpgraded(true)
      // Clean the URL without reload
      window.history.replaceState({}, '', '/settings/billing')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const fetchOrg = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      if (!profile) { setLoading(false); return }

      const { data: orgData } = await supabase
        .from('organizations')
        .select('plan, trial_unlimited, max_projects')
        .eq('id', profile.org_id)
        .single()

      const { count } = await supabase
        .from('usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      setOrg({
        plan:            orgData?.plan ?? 'free',
        trial_unlimited: orgData?.trial_unlimited ?? false,
        max_projects:    orgData?.max_projects ?? 5,
        usage_last_30d:  count ?? 0,
      })
      setLoading(false)
    }
    fetchOrg()
  }, [user])

  const handleUpgrade = async () => {
    setUpgrading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { router.replace('/login'); return }

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — please try again.')
        setUpgrading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong — please try again.')
      setUpgrading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  const isPro   = org?.plan === 'pro'
  const isTrial = org?.trial_unlimited

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '40px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>Billing</h1>
          <Link href="/projects" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back to projects
          </Link>
        </div>

        {/* Success banner */}
        {upgraded && (
          <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', color: '#166534', fontSize: 14, marginBottom: 20, fontWeight: 500 }}>
            🎉 You're on Shortlist Pro — your 14-day trial has started. You won't be charged until the trial ends.
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Current plan card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 28, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>Current plan</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
                  {isPro ? 'Pro' : 'Free'}
                </span>
                {isTrial && (
                  <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
                    Unlimited Trial
                  </span>
                )}
                {isPro && !isTrial && (
                  <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
                    Active
                  </span>
                )}
              </div>
              {isPro && (
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>$299 / month · cancel anytime</div>
              )}
            </div>
            {!isPro && !isTrial && !upgraded && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: upgrading ? '#4ade80' : '#166534',
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: upgrading ? 'default' : 'pointer',
                  opacity: upgrading ? 0.8 : 1,
                }}
              >
                {upgrading ? 'Redirecting…' : 'Start free trial'}
              </button>
            )}
            {upgraded && (
              <Link href="/projects" style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#166534', color: '#fff', fontSize: 14,
                fontWeight: 600, textDecoration: 'none',
              }}>
                Back to projects →
              </Link>
            )}
          </div>

          {/* Usage stats */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{org?.usage_last_30d ?? 0}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>AI actions · last 30 days</div>
            </div>
            <div style={{ flex: 1, background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                {isTrial || isPro ? '∞' : org?.max_projects ?? 5}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Project limit</div>
            </div>
          </div>
        </div>

        {/* Pricing card — only show if not yet pro and not just upgraded */}
        {!isPro && !isTrial && !upgraded && (
          <div style={{ background: '#fff', borderRadius: 12, border: '2px solid #166534', padding: 28, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Shortlist Pro</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Everything you need for award season</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>$299</span>
                <span style={{ fontSize: 14, color: '#6b7280' }}> / month</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#166534', background: '#dcfce7', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
              14-day free trial · card required · cancel anytime before trial ends
            </div>
            {[
              '5 active projects per month',
              'Unlimited AI evaluations and directions',
              'Full entry draft generation',
              'Jury intelligence for 30+ shows',
              'Press kit and video script generation',
              'Show calendar, budget planner, ROI index',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#166534', fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 14, color: '#374151' }}>{f}</span>
              </div>
            ))}
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              style={{
                width: '100%', marginTop: 20, padding: '12px 0',
                borderRadius: 8, border: 'none',
                background: upgrading ? '#4ade80' : '#166534',
                color: '#fff', fontSize: 15, fontWeight: 600,
                cursor: upgrading ? 'default' : 'pointer',
              }}
            >
              {upgrading ? 'Redirecting to checkout…' : 'Start your 14-day free trial'}
            </button>
          </div>
        )}

        {/* Plan comparison table */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Feature</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', color: '#374151', fontWeight: 600 }}>Free</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', color: '#166534', fontWeight: 600 }}>Pro — $299/mo</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Active projects',        '5',           '5 (upsell available)'],
                ['AI actions / hr',        '5',           '50'],
                ['Team members',           '1',           'Unlimited'],
                ['Jury intelligence',      '✓',           '✓'],
                ['Outcome tracking',       '✓',           '✓'],
                ['Priority support',       '—',           '✓'],
              ].map(([feature, free, pro], i, arr) => (
                <tr key={feature} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '12px 20px', color: '#374151' }}>{feature}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', color: '#6b7280' }}>{free}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', color: '#166534', fontWeight: 500 }}>{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 16 }}>
          Questions? Contact <a href="mailto:ben@positionadvisory.com" style={{ color: '#166534' }}>ben@positionadvisory.com</a>
        </p>

      </div>
    </div>
  )
}
