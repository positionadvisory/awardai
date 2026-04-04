'use client'
// Deploy to: app/settings/billing/page.tsx
//
// BILLING STATUS: Framework only — Stripe not yet connected.
// When ready to activate:
//   1. Set STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY + STRIPE_WEBHOOK_SECRET in Vercel env
//   2. Set STRIPE_PRO_PRICE_ID to your Stripe Price ID
//   3. Uncomment the TODO sections in this file and in api/billing/checkout/route.ts
//   4. Deploy app/api/billing/webhook/route.ts as a Stripe webhook endpoint

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

type OrgPlan = {
  plan: string
  trial_unlimited: boolean
  max_projects: number
  usage_last_30d: number
}

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [org,     setOrg]     = useState<OrgPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

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
    // TODO: uncomment when Stripe is configured
    // const { data: { session } } = await supabase.auth.getSession()
    // const token = session?.access_token
    // const res = await fetch('/api/billing/checkout', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${token}` },
    // })
    // const { url } = await res.json()
    // window.location.href = url
    alert('Billing coming soon — you\'re on an unlimited trial in the meantime!')
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  const isPro     = org?.plan === 'pro'
  const isTrial   = org?.trial_unlimited
  const isFree    = !isPro && !isTrial

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '40px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>Billing</h1>
          <Link href="/projects" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back to projects
          </Link>
        </div>

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
                <span style={{ fontSize: 22, fontWeight: 700, color: '#111827', textTransform: 'capitalize' }}>
                  {isPro ? 'Pro' : 'Free'}
                </span>
                {isTrial && (
                  <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: '#dcfce7', color: '#15803d' }}>
                    Super Trial — Unlimited
                  </span>
                )}
              </div>
            </div>
            {!isPro && (
              <button
                onClick={handleUpgrade}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: '#111827', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Upgrade to Pro
              </button>
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
                {isTrial ? '∞' : org?.max_projects ?? 5}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Project limit</div>
            </div>
          </div>
        </div>

        {/* Plan comparison */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Feature</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', color: '#374151', fontWeight: 600 }}>Free</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', color: '#7c3aed', fontWeight: 600 }}>Pro</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Projects',           '5',         'Unlimited'],
                ['AI extractions / hr','5',          '50'],
                ['Team members',       '1',          'Unlimited'],
                ['Multi-season context','✓',         '✓'],
                ['Outcome tracking',   '✓',         '✓'],
                ['Priority support',   '—',         '✓'],
              ].map(([feature, free, pro], i, arr) => (
                <tr key={feature} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '12px 20px', color: '#374151' }}>{feature}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', color: '#6b7280' }}>{free}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', color: '#7c3aed', fontWeight: 500 }}>{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 16 }}>
          Pricing details coming soon · Questions? Contact ben@positionadvisory.com
        </p>
      </div>
    </div>
  )
}
