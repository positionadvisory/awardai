// Deploy to: app/api/billing/checkout/route.ts
// NEW FILE — create this in GitHub at app/api/billing/checkout/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt        = authHeader.replace('Bearer ', '')

  const userClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser(jwt)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id, email')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Guard: don't create a second checkout if already on pro
  const { data: org } = await admin
    .from('organizations')
    .select('plan, stripe_customer_id')
    .eq('id', profile.org_id)
    .single()
  if (org?.plan === 'pro') {
    return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
  }

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
  const session = await stripe.checkout.sessions.create({
    mode:           'subscription',
    customer_email: profile.email ?? user.email ?? undefined,
    line_items:     [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    metadata:       { org_id: String(profile.org_id) },
    subscription_data: {
      trial_period_days:        7,
      metadata:                 { org_id: String(profile.org_id) },
    },
    // Card required upfront — charges automatically after trial
    payment_method_collection: 'always',
    // Render the promo-code field on the checkout page (TNO20 and any future
    // promotion code). Mutually exclusive with `discounts` — do not add both.
    allow_promotion_codes: true,
    // Show T&C acceptance checkbox on checkout page; Stripe records consent timestamp
    consent_collection: {
      terms_of_service: 'required',
    },
    custom_text: {
      terms_of_service_acceptance: {
        message: 'I agree to the [Terms of Use](https://gotshortlisted.com/terms) and [Privacy Policy](https://gotshortlisted.com/privacy).',
      },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/start`,  // trial first-run activation route (was /settings/billing)
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
