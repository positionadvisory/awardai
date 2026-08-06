'use client'
// ─────────────────────────────────────────────────────────────────────────────
// useEngagement — Session 54 (Build 1, Brief-Onboarding-Engagement-v3 §4)
//
// Fire-and-forget first-party event capture + per-user product state.
//
// Deploys to: lib/useEngagement.ts
//
// Rules this file enforces (do not weaken):
//   • track() is NEVER awaited in UI paths. Failures are swallowed with a
//     console.warn. An analytics insert must never block or break product UX.
//   • section_view fires at most once per tab per session (in-memory ref).
//   • user_product_state writes CHECK THE RETURNED ROW. Under RLS, an
//     UPDATE/UPSERT that matches no visible row "succeeds" with zero rows
//     (the DM-16 silent no-op class). If data comes back null, we warn —
//     never pretend a save happened.
//   • Tracking is INDEPENDENT of the guidance toggle (Ben, Session 53):
//     guidance_enabled gates guidance UI, not event capture. It feeds the
//     Phase 2 Cycle Wrap, which is a user deliverable.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Mirror of the engagement_events_event_check constraint
// (session-54-engagement-migration.sql). Adding an event here requires a
// migration to extend the CHECK constraint first, or inserts will fail.
export type EngagementEventName =
  // Milestone events (slim mirror of key AI actions; survives the 90-day usage_logs purge)
  | 'eval_completed'
  | 'directions_generated'
  | 'draft_generated'
  | 'presskit_generated'
  | 'script_generated'
  | 'quick_eval_used'
  | 'outcome_recorded'
  // Engagement events
  | 'section_view'
  | 'spine_step_clicked'
  | 'nextstep_shown'
  | 'nextstep_clicked'
  | 'nudge_shown'
  | 'nudge_clicked'
  | 'nudge_dismissed'
  | 'wizard_frame_viewed'
  | 'wizard_route_selected'
  | 'guidance_disabled'
  | 'guidance_enabled'
  | 'tour_restarted'
  // Trial first-run activation flow (/start) — see engagement CHECK constraint
  | 'first_run_landed'
  | 'first_run_upload_started'
  | 'first_run_score_shown'
  | 'first_run_sample_used'
  | 'first_run_nextstep_selected'
  // Portfolio Planner v3 funnel (6 Aug 2026) - see engagement CHECK constraint
  // migration add_planner_engagement_events_2026_08_06. Fired from
  // components/planner/PlannerV3.tsx only; the v2 wizard is deliberately
  // uninstrumented (it needs ?planner_v2=1 AND ?planner_v3=0, so it has no
  // real traffic and would only dilute the funnel).
  | 'planner_opened'
  | 'planner_campaigns_selected'
  | 'planner_confirm_reached'
  | 'planner_plan_derived'
  | 'planner_plan_saved'

// Context stays slim: IDs, section keys, score bands, show names. Never put
// entry text or any user-authored content in here.
export type EngagementContext = Record<string, string | number | boolean | null | undefined>

export type NudgeState = { fired_at?: string; dismissed_at?: string }

export type UserProductState = {
  user_id: string
  guidance_enabled: boolean
  wizard_completed_at: string | null
  wizard_route: 'evaluate' | 'new_entry' | 'scope_season' | 'skipped' | null
  section_visits: Record<string, number>
  nudges: Record<string, NudgeState>
  created_at?: string
  updated_at?: string
}

// org_id resolved once per browser session and shared across hook instances —
// the project page already calls get_my_org_id for its own needs; this cache
// keeps the hook from adding a second RPC on every mount.
let cachedOrgId: number | null = null
let orgIdPromise: Promise<number | null> | null = null

// NOTE: async IIFE (not builder.then) — a Supabase query builder's .then()
// types as PromiseLike, which is not assignable to Promise and can fail the
// Vercel build depending on the installed @supabase/supabase-js typings
// (same failure class as the Session 50 webhook build break).
function resolveOrgId(): Promise<number | null> {
  if (cachedOrgId !== null) return Promise.resolve(cachedOrgId)
  if (orgIdPromise) return orgIdPromise
  orgIdPromise = (async () => {
    const { data, error } = await supabase.rpc('get_my_org_id')
    if (error || !data) {
      console.warn('engagement: org lookup failed', error)
      orgIdPromise = null // allow retry on next event
      return null
    }
    cachedOrgId = data as number
    return cachedOrgId
  })()
  return orgIdPromise
}

export function useEngagement(userId: string | null | undefined) {
  const [state, setState] = useState<UserProductState | null>(null)
  const [stateLoaded, setStateLoaded] = useState(false)

  // Ref mirror so callbacks read fresh state without re-creating per render
  const stateRef = useRef<UserProductState | null>(null)
  stateRef.current = state

  // section_view debounce: once per section per browser session
  const seenSections = useRef<Set<string>>(new Set())

  // ── Load user_product_state once per user ─────────────────────────────────
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('user_product_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.warn('engagement: state load failed', error)
        if (data) setState(data as UserProductState)
        setStateLoaded(true)
      })
    return () => { cancelled = true }
  }, [userId])

  // ── track: fire-and-forget event insert ───────────────────────────────────
  const track = useCallback((event: EngagementEventName, context: EngagementContext = {}) => {
    if (!userId) return
    void (async () => {
      try {
        const orgId = await resolveOrgId()
        if (!orgId) return
        // INSERT-only table: an RLS or CHECK violation errors loudly here
        // (unlike RLS-filtered updates) — the warn is our canary.
        const { error } = await supabase.from('engagement_events').insert({
          user_id: userId,
          org_id: orgId,
          event,
          context,
        })
        if (error) console.warn('engagement: event insert failed', event, error)
      } catch (err) {
        console.warn('engagement: event failed', event, err)
      }
    })()
  }, [userId])

  // ── updateState: partial upsert of user_product_state ─────────────────────
  // Returns the saved row or null. Callers that care about persistence (e.g.
  // the guidance toggle in Settings, Build 2) must check for null.
  const updateState = useCallback(async (patch: Partial<UserProductState>): Promise<UserProductState | null> => {
    if (!userId) return null
    try {
      const { data, error } = await supabase
        .from('user_product_state')
        .upsert(
          { user_id: userId, ...patch, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select()
        .single()
      if (error || !data) {
        // DM-16 class: if this warns in dev, verify the RLS policies live
        // (pg_policies) before assuming the frontend is at fault.
        console.warn('engagement: user_product_state save failed', error)
        return null
      }
      const saved = data as UserProductState
      setState(saved)
      return saved
    } catch (err) {
      console.warn('engagement: user_product_state save failed', err)
      return null
    }
  }, [userId])

  // ── trackSectionView: once per section per session + persistent counter ───
  const trackSectionView = useCallback((section: string, context: EngagementContext = {}) => {
    if (!userId) return
    if (seenSections.current.has(section)) return
    seenSections.current.add(section)
    track('section_view', { section, ...context })
    // Bump the persistent visit counter (counts sessions in which the section
    // was seen — nudge predicates only need "never visited" vs "visited").
    const visits: Record<string, number> = { ...(stateRef.current?.section_visits ?? {}) }
    visits[section] = (visits[section] ?? 0) + 1
    void updateState({ section_visits: visits })
  }, [userId, track, updateState])

  // guidance_enabled defaults TRUE for users with no state row yet.
  // (The Welcome Router, Build 3, creates the row for new accounts.)
  const guidanceEnabled = state?.guidance_enabled ?? true

  return { track, trackSectionView, state, stateLoaded, updateState, guidanceEnabled }
}
