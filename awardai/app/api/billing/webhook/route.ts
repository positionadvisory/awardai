// Deploy to: app/api/billing/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ── Session 49 (audit P-5): grace policy for failed payments ──────────────────
// Pre-Session-49 behavior was INSTANT cutoff: subscription.updated fired on
// past_due and downgraded to free on the first declined charge, with no email.
//
// Policy now:
//   * Failed renewal charge, customer has paid before:
//       7-day grace. Stamp organizations.payment_failed_at on first failure,
//       keep pro access, email the owner. Downgrade happens at the first Stripe
//       retry event AFTER grace expires (~day 7-10 depending on retry schedule).
//   * Failed first charge after trial (customer has never paid a real invoice):
//       no grace - immediate downgrade + email. They already had 7 free days.
//   * invoice.paid or subscription back to active: clear flag, restore pro.
//
// ⚠️ Stripe Dashboard: the webhook endpoint must be subscribed to
// invoice.payment_failed, invoice.paid, invoice.marked_uncollectible
// in addition to the existing events, or none of this fires.
const GRACE_DAYS = 7
const GRACE_MS   = GRACE_DAYS * 24 * 60 * 60 * 1000

const BILLING_URL = 'https://gotshortlisted.com/settings/account'

// Resolve org_id from an invoice: subscription metadata is the source of truth
// (set via subscription_data.metadata at checkout). Try the mirrored
// subscription_details first, fall back to retrieving the subscription.
async function orgIdFromInvoice(stripe: Stripe, invoice: Stripe.Invoice): Promise<number | null> {
  const fromDetails = invoice.subscription_details?.metadata?.org_id
  if (fromDetails) return parseInt(fromDetails)
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  if (!subId) return null
  try {
    const sub = await stripe.subscriptions.retrieve(subId)
    return sub.metadata?.org_id ? parseInt(sub.metadata.org_id) : null
  } catch (err) {
    console.error('Failed to retrieve subscription for invoice', invoice.id, err)
    return null
  }
}

// Has this customer ever paid a real (non-zero) invoice? Trial-start invoices
// are $0 and status "paid", so filter on amount_paid > 0. The currently
// failing invoice is "open", not "paid" - it does not pollute this check.
async function hasEverPaid(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const paid = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 20 })
    return paid.data.some(inv => inv.amount_paid > 0)
  } catch (err) {
    // Fail toward grace (gentler outcome) if Stripe lookup errors
    console.error('hasEverPaid lookup failed for', customerId, err)
    return true
  }
}

async function sendOwnerEmail(
  admin: SupabaseClient,
  orgId: number,
  subject: string,
  html: string,
) {
  if (!process.env.RESEND_API_KEY) return
  // Explicit cast: with an untyped client, supabase-js can infer .single() data
  // as 'never' (build failure, Session 50). Do not remove the cast.
  const { data } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .single()
  const profile = data as { email: string | null; full_name: string | null } | null
  if (!profile?.email) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Ben at Shortlist <ben@gotshortlisted.com>',
      to: profile.email,
      subject,
      html: html.replace('{{NAME}}', (profile.full_name as string) ?? 'there').trim(),
    }),
  })
}

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

  // ── Session 50 (audit P-7): idempotency ─────────────────────────────────────
  // Stripe delivers at-least-once - replays and retries can re-deliver the same
  // event.id, and a replayed stale "subscription.updated: active" could
  // resurrect a deleted subscription's pro plan. Claim the event id BEFORE
  // processing; a unique violation (23505) means it was already handled.
  // Any OTHER insert error fails open (process anyway) - dropping a legitimate
  // billing event is worse than the rare double-process of an idempotent update.
  // Requires session-50-webhook-idempotency-migration.sql.
  const { error: claimError } = await admin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type })
  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('Webhook event claim failed (processing anyway):', claimError)
  }

  // The claim above is taken BEFORE processing (so concurrent duplicate
  // deliveries are blocked). If processing then throws, the catch below
  // DELETES the claim and returns 500, so Stripe's retry/resend can re-run the
  // event. Without this, a single failed process recorded the id permanently
  // and every resend returned a silent duplicate no-op.
  try {
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      // org_id is set on session.metadata at checkout, but older/edge sessions
      // may carry it only on the subscription. Fall back to the subscription
      // metadata, mirroring orgIdFromInvoice, before giving up.
      let orgId = session.metadata?.org_id ?? null
      if (!orgId && session.subscription) {
        const subId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id
        try {
          const sub = await stripe.subscriptions.retrieve(subId)
          orgId = sub.metadata?.org_id ?? null
        } catch (err) {
          console.error('checkout.session.completed: subscription retrieve failed', subId, err)
        }
      }
      if (!orgId) break
      const { error: updErr } = await admin.from('organizations').update({
        plan:               'pro',
        stripe_customer_id: session.customer as string,
        max_projects:       999,
        payment_failed_at:  null,
      }).eq('id', parseInt(orgId))
      // Throw on update failure so the outer catch releases the idempotency
      // claim and Stripe retries, instead of recording a silent 200 no-op.
      if (updErr) throw new Error(`checkout.session.completed update failed for org ${orgId}: ${updErr.message}`)
      break
    }

    case 'customer.subscription.updated': {
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break

      if (['active', 'trialing'].includes(sub.status)) {
        await admin.from('organizations').update({
          plan:              'pro',
          max_projects:      999,
          payment_failed_at: null,
        }).eq('id', parseInt(orgId))
      } else if (sub.status === 'past_due') {
        // Session 49: do NOT downgrade on past_due. Grace is owned by the
        // invoice.payment_failed handler below. Downgrading here was the old
        // instant-cutoff behavior - do not reinstate it.
      } else {
        // canceled / unpaid / incomplete_expired / paused
        await admin.from('organizations').update({
          plan:              'free',
          max_projects:      5,
          payment_failed_at: null,
        }).eq('id', parseInt(orgId))
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break
      await admin.from('organizations').update({
        plan:              'free',
        max_projects:      5,
        payment_failed_at: null,
      }).eq('id', parseInt(orgId))
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break // one-off invoices are not ours
      const orgId = await orgIdFromInvoice(stripe, invoice)
      if (!orgId) break

      const { data: org } = await admin
        .from('organizations')
        .select('plan, payment_failed_at')
        .eq('id', orgId)
        .single()
      if (!org) break

      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      const everPaid   = customerId ? await hasEverPaid(stripe, customerId) : false

      if (!everPaid) {
        // First real charge after trial failed - no grace.
        // Guard: if already free, this is a repeat retry (or a failed initial
        // checkout) - do nothing, especially do not re-send the email.
        if (org.plan === 'free') break
        // Stamp payment_failed_at (not null) so a later successful retry
        // restores pro via the invoice.paid handler below.
        await admin.from('organizations').update({
          plan:              'free',
          max_projects:      5,
          payment_failed_at: new Date().toISOString(),
        }).eq('id', orgId)
        await sendOwnerEmail(admin, orgId,
          'Your Shortlist trial has ended - payment didn\'t go through',
          `
<p>Hi {{NAME}},</p>
<p>Your 7-day Shortlist trial has ended, but we couldn\'t charge the card on file, so your account is back on the free plan for now.</p>
<p>Update your card in <a href="${BILLING_URL}">your billing settings</a> and you\'ll pick up exactly where you left off - all your projects and entries are still there.</p>
<p>Any questions, just reply to this email.</p>
<p>— Ben</p>
          `)
        break
      }

      if (!org.payment_failed_at) {
        // First failure for a paying customer - start the grace clock, keep access
        await admin.from('organizations').update({
          payment_failed_at: new Date().toISOString(),
        }).eq('id', orgId)
        await sendOwnerEmail(admin, orgId,
          'Your Shortlist payment didn\'t go through',
          `
<p>Hi {{NAME}},</p>
<p>We tried to charge your card for this month\'s Shortlist subscription and it didn\'t go through. This is usually an expired card or a one-off bank decline.</p>
<p>Nothing is interrupted - your access continues for the next ${GRACE_DAYS} days while we retry the payment automatically.</p>
<p>To sort it now, update your card in <a href="${BILLING_URL}">your billing settings</a>.</p>
<p>Any questions, just reply to this email.</p>
<p>— Ben</p>
          `)
        break
      }

      // Subsequent retry failure - enforce grace if expired
      const failedAt = new Date(org.payment_failed_at as string).getTime()
      if (Date.now() - failedAt > GRACE_MS && org.plan !== 'free') {
        await admin.from('organizations').update({
          plan:         'free',
          max_projects: 5,
          // keep payment_failed_at set - cleared on successful payment
        }).eq('id', orgId)
        await sendOwnerEmail(admin, orgId,
          'Shortlist access paused - your card is still failing',
          `
<p>Hi {{NAME}},</p>
<p>We\'ve been retrying your card for the past week without luck, so your Shortlist access is paused.</p>
<p>Update your card in <a href="${BILLING_URL}">your billing settings</a> and access comes back automatically the moment payment goes through. All your projects and entries are safe.</p>
<p>Any questions, just reply to this email.</p>
<p>— Ben</p>
          `)
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break
      const orgId = await orgIdFromInvoice(stripe, invoice)
      if (!orgId) break

      const { data: org } = await admin
        .from('organizations')
        .select('payment_failed_at')
        .eq('id', orgId)
        .single()

      // Only act when recovering from a failure state - normal renewals no-op
      if (org?.payment_failed_at) {
        await admin.from('organizations').update({
          plan:              'pro',
          max_projects:      999,
          payment_failed_at: null,
        }).eq('id', orgId)
      }
      break
    }

    case 'invoice.marked_uncollectible': {
      // Stripe has given up on collection - revoke regardless of grace
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break
      const orgId = await orgIdFromInvoice(stripe, invoice)
      if (!orgId) break
      await admin.from('organizations').update({
        plan:              'free',
        max_projects:      5,
        payment_failed_at: null,
      }).eq('id', orgId)
      break
    }

    case 'customer.subscription.trial_will_end': {
      // Fires 3 days before trial ends — send reminder email
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break
      await sendOwnerEmail(admin, parseInt(orgId),
        'Your Shortlist trial ends in 3 days',
        `
<p>Hi {{NAME}},</p>
<p>Your 7-day Shortlist trial ends in 3 days. After that, your subscription activates at $299/month — no action needed if you want to keep going.</p>
<p>If you\'d like to cancel before then, you can do so in <a href="${BILLING_URL}">your billing settings</a>.</p>
<p>Any questions, just reply to this email.</p>
<p>— Ben</p>
        `)
      break
    }
  }
  } catch (err) {
    console.error('Webhook processing failed, releasing idempotency claim:', event.id, err)
    // Release the claim so Stripe's retry/resend can re-run this event.
    await admin.from('stripe_webhook_events').delete().eq('event_id', event.id)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
