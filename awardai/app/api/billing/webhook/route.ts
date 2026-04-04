// Deploy to: app/api/billing/webhook/route.ts
//
// ─── BILLING STATUS: STUB — not yet active ───────────────────────────────────
// This file is complete and ready to activate. Nothing runs until you:
//   1. Create a Stripe account and add products/prices
//   2. Set these env vars in Vercel:
//        STRIPE_SECRET_KEY          (from Stripe Dashboard → Developers → API keys)
//        STRIPE_WEBHOOK_SECRET      (from Stripe Dashboard → Webhooks → signing secret)
//        STRIPE_PRO_PRICE_ID        (from Stripe Dashboard → Products)
//   3. Register this URL as a Stripe webhook endpoint:
//        https://your-domain.vercel.app/api/billing/webhook
//      Events to subscribe: checkout.session.completed,
//                           customer.subscription.updated,
//                           customer.subscription.deleted
//   4. Remove the BILLING_STUB_MODE check at the top of the handler.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BILLING_STUB_MODE = true  // ← flip to false when Stripe is live

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  if (BILLING_STUB_MODE) {
    return NextResponse.json({ received: true, note: 'Billing stub mode — not processing' })
  }

  // ── Stripe signature verification ───────────────────────────────────────
  // TODO: uncomment when Stripe is configured
  //
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
  // const sig    = req.headers.get('stripe-signature') ?? ''
  // const body   = await req.text()
  // let event: Stripe.Event
  // try {
  //   event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  // } catch (err) {
  //   return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  // }

  // ── Handle events ────────────────────────────────────────────────────────
  // const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  //
  // switch (event.type) {
  //
  //   case 'checkout.session.completed': {
  //     const session = event.data.object as Stripe.Checkout.Session
  //     const orgId   = session.metadata?.org_id
  //     if (!orgId) break
  //     await admin.from('organizations').update({
  //       plan:               'pro',
  //       stripe_customer_id: session.customer as string,
  //       max_projects:       999,
  //     }).eq('id', parseInt(orgId))
  //     break
  //   }
  //
  //   case 'customer.subscription.updated': {
  //     const sub   = event.data.object as Stripe.Subscription
  //     const orgId = sub.metadata?.org_id
  //     if (!orgId) break
  //     const isActive = ['active', 'trialing'].includes(sub.status)
  //     await admin.from('organizations').update({
  //       plan:         isActive ? 'pro' : 'free',
  //       max_projects: isActive ? 999 : 5,
  //     }).eq('id', parseInt(orgId))
  //     break
  //   }
  //
  //   case 'customer.subscription.deleted': {
  //     const sub   = event.data.object as Stripe.Subscription
  //     const orgId = sub.metadata?.org_id
  //     if (!orgId) break
  //     await admin.from('organizations').update({
  //       plan:         'free',
  //       max_projects: 5,
  //     }).eq('id', parseInt(orgId))
  //     break
  //   }
  // }

  return NextResponse.json({ received: true })
}


// ── Checkout session creator (called by billing page Upgrade button) ────────
// Deploy separately to: app/api/billing/checkout/route.ts
//
// export async function POST(req: NextRequest) {
//   if (BILLING_STUB_MODE) {
//     return NextResponse.json({ error: 'Billing not yet active' }, { status: 503 })
//   }
//   const authHeader = req.headers.get('Authorization') ?? ''
//   const jwt = authHeader.replace('Bearer ', '')
//   const userClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
//     global: { headers: { Authorization: authHeader } },
//   })
//   const { data: { user } } = await userClient.auth.getUser(jwt)
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//
//   const admin = createClient(SUPABASE_URL, SERVICE_KEY)
//   const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single()
//   if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
//
//   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
//   const session = await stripe.checkout.sessions.create({
//     mode:        'subscription',
//     line_items:  [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
//     metadata:    { org_id: String(profile.org_id) },
//     success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
//     cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
//   })
//   return NextResponse.json({ url: session.url })
// }
