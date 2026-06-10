// Deploy to: app/api/billing/status/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// This route reads the Authorization header, so it can never be prerendered.
// Declaring it dynamic stops Next from attempting static generation at build
// time (the red DYNAMIC_SERVER_USAGE noise in Vercel build logs — Session 50).
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get org
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('plan, stripe_customer_id, trial_unlimited')
      .eq('id', profile.org_id)
      .single()
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

    // No Stripe customer yet — free plan
    if (!org.stripe_customer_id) {
      return NextResponse.json({
        status: 'free',
        plan: org.plan,
        trial_unlimited: org.trial_unlimited,
        trial_end: null,
        current_period_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
      })
    }

    // Fetch active/trialing subscription from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: org.stripe_customer_id,
      limit: 1,
      status: 'all',
    })

    const sub = subscriptions.data[0] ?? null

    if (!sub) {
      return NextResponse.json({
        status: 'free',
        plan: org.plan,
        trial_unlimited: org.trial_unlimited,
        trial_end: null,
        current_period_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
      })
    }

    return NextResponse.json({
      status: sub.status,                              // 'trialing' | 'active' | 'past_due' | 'canceled' | etc.
      plan: org.plan,
      trial_unlimited: org.trial_unlimited,
      trial_end: sub.trial_end,                        // Unix timestamp or null
      current_period_end: sub.current_period_end,      // Unix timestamp
      cancel_at_period_end: sub.cancel_at_period_end,  // true if scheduled to cancel
      cancel_at: sub.cancel_at,                        // Unix timestamp or null
    })
  } catch (err) {
    console.error('billing/status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
