// Deploy to: app/api/billing/portal/route.ts
// Opens the Stripe Customer Portal — handles invoices, payment method, cancel/reactivate.
// PREREQUISITE: Configure the Customer Portal in Stripe Dashboard → Billing → Customer portal
// before going live. Set return URL to https://gotshortlisted.com/settings/account

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', profile.org_id)
      .single()

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found. Start a trial first.' }, { status: 400 })
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gotshortlisted.com'}/settings/account`

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('billing/portal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
