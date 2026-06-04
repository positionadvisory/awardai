// Deploy to: app/api/billing/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
  const sig    = req.headers.get('stripe-signature') ?? ''
  const body   = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId   = session.metadata?.org_id
      if (!orgId) break
      await admin.from('organizations').update({
        plan:               'pro',
        stripe_customer_id: session.customer as string,
        max_projects:       999,
      }).eq('id', parseInt(orgId))
      break
    }

    case 'customer.subscription.updated': {
      const sub      = event.data.object as Stripe.Subscription
      const orgId    = sub.metadata?.org_id
      if (!orgId) break
      const isActive = ['active', 'trialing'].includes(sub.status)
      await admin.from('organizations').update({
        plan:         isActive ? 'pro' : 'free',
        max_projects: isActive ? 999 : 5,
      }).eq('id', parseInt(orgId))
      break
    }

    case 'customer.subscription.deleted': {
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break
      await admin.from('organizations').update({
        plan:         'free',
        max_projects: 5,
      }).eq('id', parseInt(orgId))
      break
    }

    case 'customer.subscription.trial_will_end': {
      // Fires 3 days before trial ends — send reminder email
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      const { data: profile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('org_id', parseInt(orgId))
        .eq('role', 'owner')
        .single()

      if (profile?.email && process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Ben at Shortlist <ben@gotshortlisted.com>',
            to:   profile.email,
            subject: 'Your Shortlist trial ends in 3 days',
            html: `
<p>Hi ${profile.full_name ?? 'there'},</p>
<p>Your 14-day Shortlist trial ends in 3 days. After that, your subscription activates at $299/month — no action needed if you want to keep going.</p>
<p>If you\'d like to cancel before then, you can do so in <a href="https://gotshortlisted.com/settings/billing">your billing settings</a>.</p>
<p>Any questions, just reply to this email.</p>
<p>— Ben</p>
            `.trim(),
          }),
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
