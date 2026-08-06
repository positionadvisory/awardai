'use client'
/**
 * PlannerV3.tsx — Portfolio Planner v3 controller (the P2 input step).
 * =============================================================================
 * Planner-v3-SPEC-campaign-driven-2026-07-16.md. Owns the v3 input STATE and
 * the 2-3 step flow (campaigns -> confirm -> result); delegates ALL derivation
 * to lib/planner-v3-engine.ts derivePlanV3 (V3-P1) and computes nothing of its
 * own. page.tsx renders this behind the v3 flag so page.tsx stays default-only
 * (Next page-export-shape rule, Gotchas S161).
 *
 * Data: lib/planner-v3-data.ts (fetchCampaignOptions / toSelectedCampaign /
 * marketEligibleShows). Facets + rate facts reuse the P2.1 loaders, never
 * forked. agency_profiles has ZERO client writes (Gotchas): the v3 plan
 * snapshot saves only through the existing /api/agency-profile PATCH, on
 * explicit action, merged under planner_prefs.v3 (v2 prefs preserved).
 *
 * SNAPSHOT SEMANTICS (spec): a saved plan snapshots its campaign selection. On
 * revisit, if the live >= threshold set has changed since, a diff note is shown
 * and the SAVED selection is kept — never silently re-derived. Re-derive from
 * current campaigns is an explicit action only.
 *
 * The output layout here is a MINIMAL placeholder (PlannerV3Result); the
 * recommendation-first layout is V3-P3.
 *
 * INSTRUMENTATION (6 Aug 2026): five engagement_events fire from this file.
 * They exist because v3 went default-on 17 Jul with zero telemetry, so adoption
 * of the whole feature was unmeasurable. Design notes that are load-bearing:
 *   - planner_opened carries options_count / qualifying_count. Without them a
 *     drop-off reads as a UX problem when the real cause is an org with nothing
 *     to plan with (live: 14 of the 18 orgs holding projects have NO campaign
 *     at or above QUALIFY_THRESHOLD). An open with no campaigns is the single
 *     most likely thing this instrument will find; it must be distinguishable.
 *   - planner_plan_derived fires on ENTERING the result step, never inside the
 *     derivation memo: `plan` recomputes on every budget keystroke and every
 *     campaign toggle, so a memo-side fire would emit dozens of rows per
 *     session and destroy the denominator. It also carries `source`, because a
 *     user with a saved plan is dropped straight onto `result` by the loader
 *     and never passes through campaigns or confirm. Counting those as
 *     completed funnels would overstate the flow; ignoring them would
 *     understate usage.
 *   - Context stays counts-only. Campaign names are client-confidential
 *     (unpublished award entries) and never go into an events table.
 * Adding another event here needs the CHECK constraint extended FIRST: track()
 * is fire-and-forget and swallows the insert error, so the event just vanishes.
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useEngagement } from '@/lib/useEngagement'
import { fetchPlannerFacets, normalizeUserRegion, type PlannerFacet, type PlannerRegion } from '@/lib/planner-facets'
import { fetchRateFacts, type RateFact } from '@/lib/rate-facts'
import { derivePlanV3, type PlannerV3Input } from '@/lib/planner-v3-engine'
import type { PlannerAgencyDiscipline, PlannerLens } from '@/lib/planner-engine'
import type { CurrencyCode } from '@/lib/fx'
import { DISPLAY_CURRENCIES } from '@/lib/planner-display'
import {
  fetchCampaignOptions,
  marketEligibleShows,
  toSelectedCampaign,
  QUALIFY_THRESHOLD,
  type CampaignOption,
} from '@/lib/planner-v3-data'
import PlannerCampaignPicker from '@/components/planner/PlannerCampaignPicker'
import PlannerV3Confirm, { type PlannerV3ConfirmValue } from '@/components/planner/PlannerV3Confirm'
import PlannerV3Result from '@/components/planner/PlannerV3Result'

// ── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_BUDGET = 50000
const DEFAULT_CURRENCY: CurrencyCode = 'USD'
const DEFAULT_DISCIPLINE: PlannerAgencyDiscipline = 'full_service'
const DEFAULT_LENS: PlannerLens = 'maximize_visibility'

type Step = 'campaigns' | 'confirm' | 'result'

/** The v3 slice of planner_prefs (stored under planner_prefs.v3). */
type PlannerV3Prefs = {
  schema_version: 1
  selected_project_ids: number[]
  /** The >= threshold set at save time — the snapshot the diff note compares against. */
  qualifying_project_ids: number[]
  budget: number
  budget_currency: string
  region: string
  discipline: PlannerAgencyDiscipline
  lens: PlannerLens
  saved_at: string
}

function isCurrency(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (DISPLAY_CURRENCIES as string[]).includes(v)
}

export default function PlannerV3() {
  const { user, loading: authLoading } = useAuth()
  const { track } = useEngagement(user?.id ?? null)

  const [fetching, setFetching] = useState(true)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [options, setOptions] = useState<CampaignOption[]>([])
  const [facets, setFacets] = useState<PlannerFacet[]>([])
  const [rateFacts, setRateFacts] = useState<RateFact[]>([])
  const [existingPrefs, setExistingPrefs] = useState<Record<string, unknown> | null>(null)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Optional per-campaign first-aired dates (project_id -> ISO), persisted to
  // projects.first_aired (P1 planner demo polish, 19 Jul) and fed into the
  // engine's eligibility check. origFirstAired is the as-loaded snapshot, used
  // only to diff "changed" dates before writing back on Run.
  const [firstAired, setFirstAired] = useState<Record<number, string>>({})
  const [origFirstAired, setOrigFirstAired] = useState<Record<number, string>>({})
  const [confirmValue, setConfirmValue] = useState<PlannerV3ConfirmValue>({
    budget: DEFAULT_BUDGET,
    budgetCurrency: DEFAULT_CURRENCY,
    region: 'Global',
    discipline: DEFAULT_DISCIPLINE,
    lens: DEFAULT_LENS,
  })
  const [prefilled, setPrefilled] = useState<Partial<Record<keyof PlannerV3ConfirmValue, boolean>>>({})

  // Saved-snapshot qualifying set, kept to diff against the live set on revisit.
  const [snapshotQual, setSnapshotQual] = useState<number[] | null>(null)
  const [step, setStep] = useState<Step>('campaigns')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fixed as-of date for deterministic derivation across re-renders.
  const [asOfDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Instrumentation guards. React StrictMode double-invokes effects in dev, and
  // the load effect can re-run on a user object identity change, so both of
  // these fire-once checks are required for the counts to mean anything.
  const openedFired = useRef(false)
  const prevStep = useRef<Step>('campaigns')

  // ── Load: org, profile (+ v3 prefs), campaign options, facets, rate facts ───
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setFetching(true)
    ;(async () => {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      const oid = (profileRow?.org_id as number | null) ?? null
      if (cancelled) return
      setOrgId(oid)

      const [facetList, rateList] = await Promise.all([fetchPlannerFacets(), fetchRateFacts()])
      if (cancelled) return
      setFacets(facetList)
      setRateFacts(rateList)

      let agencyProfile: Record<string, unknown> | null = null
      let opts: CampaignOption[] = []
      if (oid) {
        const [{ data: ap }, fetchedOpts] = await Promise.all([
          supabase.from('agency_profiles').select('*').eq('org_id', oid).maybeSingle(),
          fetchCampaignOptions(oid),
        ])
        agencyProfile = (ap as Record<string, unknown> | null) ?? null
        opts = fetchedOpts
      }
      if (cancelled) return
      setOptions(opts)
      // Prefill each campaign's date input from the persisted column (DB is the
      // source of truth on load; in-session edits below are diffed against this
      // snapshot before any write-back).
      const seeded: Record<number, string> = {}
      for (const o of opts) {
        if (o.first_aired) seeded[o.project_id] = o.first_aired
      }
      setFirstAired(seeded)
      setOrigFirstAired(seeded)
      setExistingPrefs((agencyProfile?.planner_prefs as Record<string, unknown> | null) ?? null)

      // Prefill the confirm step from saved v3 prefs first, else agency profile.
      const prefsRoot = (agencyProfile?.planner_prefs as Record<string, unknown> | null) ?? null
      const v3 = (prefsRoot?.v3 as PlannerV3Prefs | undefined) ?? undefined
      const offices = (agencyProfile?.office_locations as string[] | null) ?? null
      const derivedRegionRaw =
        (agencyProfile?.agency_city as string | null) || (offices && offices.length > 0 ? offices[0] : '') || ''
      const region: PlannerRegion = normalizeUserRegion(v3?.region ?? derivedRegionRaw)
      const rawDiscipline = v3?.discipline
      const discipline: PlannerAgencyDiscipline =
        rawDiscipline ?? DEFAULT_DISCIPLINE

      setConfirmValue({
        budget: v3?.budget ?? DEFAULT_BUDGET,
        budgetCurrency: isCurrency(v3?.budget_currency) ? (v3!.budget_currency as CurrencyCode) : DEFAULT_CURRENCY,
        region,
        discipline,
        lens: v3?.lens ?? DEFAULT_LENS,
      })
      setPrefilled({
        budget: v3?.budget != null,
        budgetCurrency: isCurrency(v3?.budget_currency),
        region: !!(v3?.region || derivedRegionRaw),
        discipline: rawDiscipline != null,
      })

      // Selection: a saved snapshot wins (snapshot semantics); else preselect
      // the live qualifying (>= threshold) campaigns.
      if (v3 && Array.isArray(v3.selected_project_ids)) {
        setSelected(new Set(v3.selected_project_ids))
        setSnapshotQual(Array.isArray(v3.qualifying_project_ids) ? v3.qualifying_project_ids : [])
        setStep('result')
      } else {
        setSelected(new Set(opts.filter(o => o.qualifies).map(o => o.project_id)))
        setSnapshotQual(null)
      }

      // planner_opened: once per mount, AFTER the load settles so the counts are
      // real. Fires even when opts is empty, which is the case that matters most.
      if (!openedFired.current) {
        openedFired.current = true
        track('planner_opened', {
          options_count: opts.length,
          qualifying_count: opts.filter(o => o.qualifies).length,
          scored_count: opts.filter(o => o.entry_readiness !== null).length,
          has_saved_plan: !!v3,
          has_agency_profile: !!agencyProfile,
          qualify_threshold: QUALIFY_THRESHOLD,
          load_failed: false,
        })
      }
      setFetching(false)
    })().catch(() => {
      if (cancelled) return
      // A failed load still counts as an open. Without this branch a broken
      // load is indistinguishable from nobody visiting the page.
      if (!openedFired.current) {
        openedFired.current = true
        track('planner_opened', { load_failed: true })
      }
      setFetching(false)
    })
    return () => {
      cancelled = true
    }
    // track is referentially stable per userId (useCallback on [userId]).
  }, [user, track])

  // Live qualifying set (project_ids currently >= threshold).
  const liveQual = useMemo(() => options.filter(o => o.qualifies).map(o => o.project_id), [options])

  // Snapshot diff: how many campaigns have entered/left the qualifying set
  // since the saved plan (spec: "N campaigns changed since this plan").
  const changedSinceSnapshot = useMemo(() => {
    if (!snapshotQual) return 0
    const saved = snapshotQual
    const added = liveQual.filter(id => !saved.includes(id)).length
    const removed = saved.filter(id => !liveQual.includes(id)).length
    return added + removed
  }, [snapshotQual, liveQual])

  // The plan — the ONLY derivation, delegated entirely to the V3-P1 engine.
  const plan = useMemo(() => {
    const campaigns = options
      .filter(o => selected.has(o.project_id))
      .map(o => ({ ...toSelectedCampaign(o), first_aired: firstAired[o.project_id] || null }))
    const input: PlannerV3Input = {
      campaigns,
      budget: confirmValue.budget,
      budgetCurrency: confirmValue.budgetCurrency,
      region: confirmValue.region,
      discipline: confirmValue.discipline,
      lens: confirmValue.lens,
      asOfDate,
    }
    return derivePlanV3(input, facets, rateFacts)
  }, [options, selected, confirmValue, facets, rateFacts, asOfDate, firstAired])

  const teaserShows = useMemo(
    () => marketEligibleShows(facets, confirmValue.region, 5),
    [facets, confirmValue.region],
  )

  // How many of the SELECTED campaigns carry a first-aired date. This is the
  // capture rate for the parked `first_aired` decision (where should the date
  // be collected), which is why it rides on both derive and save.
  const selectedWithFirstAired = useMemo(
    () => Array.from(selected).filter(pid => !!firstAired[pid]).length,
    [selected, firstAired],
  )

  // ── Step-transition instrumentation ─────────────────────────────────────────
  // Driven off `step` rather than off the click handlers so the loader's direct
  // jump to `result` (saved-snapshot path) is captured too. The ref comparison
  // makes each transition fire exactly once.
  useEffect(() => {
    if (prevStep.current === step) return
    const from = prevStep.current
    prevStep.current = step

    if (step === 'confirm') {
      // How much of this step we could prefill. A step that asks the user for
      // things already on their profile is a step worth removing.
      track('planner_confirm_reached', {
        from,
        selected_count: selected.size,
        prefilled_budget: !!prefilled.budget,
        prefilled_region: !!prefilled.region,
        prefilled_discipline: !!prefilled.discipline,
      })
      return
    }

    if (step === 'result') {
      track('planner_plan_derived', {
        // 'flow' = walked the wizard. 'restored_snapshot' = the loader dropped
        // them here because they already had a saved plan.
        source: from === 'confirm' ? 'flow' : 'restored_snapshot',
        zero_state: plan.zero_state,
        headline_recommended_count: plan.headline_recommended_count,
        headline_show_count: plan.headline_show_count,
        show_block_count: plan.shows.length,
        unresolved_count: plan.unresolved.length,
        region_dropped_count: plan.region_dropped.length,
        budget_total_usd: Math.round(plan.budget_total_usd),
        budget_excluded_show_count: plan.budget_excluded_shows.length,
        selected_count: selected.size,
        first_aired_count: selectedWithFirstAired,
        resolved_region: plan.resolved_region,
        lens: confirmValue.lens,
      })
    }
    // `plan` is intentionally NOT a dependency: this must fire on the step
    // transition only, never on the memo recomputing under a budget keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, track])

  const toggle = (projectId: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })

  const patchConfirm = (patch: Partial<PlannerV3ConfirmValue>) =>
    setConfirmValue(prev => ({ ...prev, ...patch }))

  // Write only CHANGED first-aired dates back to projects.first_aired (client
  // write is allowed here — projects is not on the no-client-write list,
  // Gotchas Auth/Supabase — but a client update can silently affect zero rows
  // under RLS, DM-16, so check the returned rows before trusting the write).
  // Fire-and-forget: a failed/partial write never blocks the plan, which
  // already has the value in memory for this session either way.
  const persistFirstAired = () => {
    const changedIds = Object.keys(firstAired)
      .map(Number)
      .filter(pid => (firstAired[pid] ?? '') !== (origFirstAired[pid] ?? ''))
    if (changedIds.length === 0) return
    changedIds.forEach(pid => {
      const dateVal = firstAired[pid] || null
      supabase
        .from('projects')
        .update({ first_aired: dateVal })
        .eq('id', pid)
        .select('id')
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            setOrigFirstAired(prev => ({ ...prev, [pid]: dateVal ?? '' }))
          }
        })
    })
  }

  // Re-derive from current campaigns (explicit action; clears the diff note by
  // adopting the live qualifying set as the new selection baseline).
  const refreshFromCurrent = () => {
    setSelected(new Set(liveQual))
    setSnapshotQual(null)
    setStep('campaigns')
  }

  // ── Save (explicit only) via the service-role PATCH route ───────────────────
  const savePlan = async () => {
    setSaveStatus('saving')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setSaveStatus('error')
        return
      }
      const v3: PlannerV3Prefs = {
        schema_version: 1,
        selected_project_ids: Array.from(selected),
        qualifying_project_ids: liveQual,
        budget: confirmValue.budget,
        budget_currency: confirmValue.budgetCurrency,
        region: confirmValue.region,
        discipline: confirmValue.discipline,
        lens: confirmValue.lens,
        saved_at: new Date().toISOString(),
      }
      // Merge under .v3 so v2's planner_prefs.current is preserved.
      const merged = { ...(existingPrefs ?? {}), v3 }
      const res = await fetch('/api/agency-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planner_prefs: merged }),
      })
      if (!res.ok) {
        setSaveStatus('error')
        return
      }
      const wasResave = !!(existingPrefs && existingPrefs.v3)
      setExistingPrefs(merged)
      setSnapshotQual(liveQual)
      // Only on a confirmed 2xx. A save event on a failed PATCH would be the
      // worst row in the table: the one step nobody has ever reached.
      track('planner_plan_saved', {
        is_resave: wasResave,
        selected_count: selected.size,
        qualifying_count: liveQual.length,
        zero_state: plan.zero_state,
        headline_recommended_count: plan.headline_recommended_count,
        headline_show_count: plan.headline_show_count,
        budget_total_usd: Math.round(plan.budget_total_usd),
        budget_currency: confirmValue.budgetCurrency,
        resolved_region: plan.resolved_region,
        lens: confirmValue.lens,
        first_aired_count: selectedWithFirstAired,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
    }
  }

  // ── Render gates ────────────────────────────────────────────────────────────
  if (authLoading || fetching) {
    return <p className="text-sm text-gray-500">Building your planner...</p>
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Portfolio Planner</h1>
        <p className="text-sm text-gray-500">
          From the campaigns you put forward: which shows to enter, how many, at what budget, in what order.
        </p>
      </div>

      {step !== 'result' && <StepDots step={step} />}

      {step === 'campaigns' && (
        <Card title="Your campaigns" blurb="Pick the campaigns to build a plan around. Scored campaigns start selected.">
          <PlannerCampaignPicker
            options={options}
            selected={selected}
            onToggle={toggle}
            qualifyThreshold={QUALIFY_THRESHOLD}
          />
          <NextBack
            onNext={() => {
              // The committed selection, plus whether they actually curated it
              // or just accepted the preselected qualifying set.
              const selectedIds = Array.from(selected)
              track('planner_campaigns_selected', {
                selected_count: selectedIds.length,
                options_count: options.length,
                qualifying_count: liveQual.length,
                unscored_selected_count: options.filter(
                  o => selected.has(o.project_id) && o.entry_readiness === null,
                ).length,
                changed_from_default:
                  selectedIds.length !== liveQual.length ||
                  selectedIds.some(id => liveQual.indexOf(id) === -1),
              })
              setStep('confirm')
            }}
            nextLabel="Confirm budget & market"
          />
        </Card>
      )}

      {step === 'confirm' && (
        <Card title="Budget and market" blurb="Prefilled from your profile. Confirm or change anything.">
          <PlannerV3Confirm
            value={confirmValue}
            onChange={patchConfirm}
            prefilled={prefilled}
            campaigns={options
              .filter(o => selected.has(o.project_id))
              .map(o => ({ project_id: o.project_id, campaign_name: o.campaign_name }))}
            firstAired={firstAired}
            onFirstAiredChange={(pid, date) => setFirstAired(prev => ({ ...prev, [pid]: date }))}
          />
          <NextBack
            onNext={() => { persistFirstAired(); setStep('result') }}
            onBack={() => setStep('campaigns')}
            nextLabel="See my plan"
          />
        </Card>
      )}

      {step === 'result' && (
        <div className="space-y-4">
          {snapshotQual && changedSinceSnapshot > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start justify-between gap-3">
              <span>
                {changedSinceSnapshot} campaign{changedSinceSnapshot === 1 ? '' : 's'} changed since this plan was saved.
                This plan still shows your saved selection.
              </span>
              <button
                type="button"
                onClick={refreshFromCurrent}
                className="flex-shrink-0 text-xs font-semibold underline hover:text-amber-900"
              >
                Refresh from current campaigns
              </button>
            </div>
          )}

          <PlannerV3Result plan={plan} displayCurrency={confirmValue.budgetCurrency} teaserShows={teaserShows} />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep('campaigns')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back to campaigns
            </button>
            <div className="flex items-center gap-3">
              {saveStatus === 'saved' && <span className="text-xs text-green-700">Saved</span>}
              {saveStatus === 'error' && <span className="text-xs text-red-600">Save failed</span>}
              <button
                type="button"
                onClick={savePlan}
                disabled={saveStatus === 'saving'}
                className="text-sm bg-green-800 hover:bg-green-700 text-white rounded-lg px-4 py-2 disabled:opacity-60"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save this plan'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            <Link href="/projects" className="underline">Back to your projects</Link>
          </p>
        </div>
      )}
    </div>
  )
}

// ── Local presentational helpers (component file: non-default exports are fine) ─

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {blurb && <p className="text-xs text-gray-500 mt-0.5 mb-4">{blurb}</p>}
      {children}
    </div>
  )
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ['campaigns', 'confirm', 'result']
  const labels = ['Campaigns', 'Budget & market']
  const index = order.indexOf(step)
  return (
    <div className="flex items-center gap-2 mb-4">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-1">
          <span
            className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
              i <= index ? 'bg-green-800 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i + 1}
          </span>
          <span className="text-xs text-gray-500">{l}</span>
        </div>
      ))}
    </div>
  )
}

function NextBack({
  onNext,
  onBack,
  nextLabel,
}: {
  onNext: () => void
  onBack?: () => void
  nextLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mt-5">
      {onBack ? (
        <button type="button" onClick={onBack} className="text-sm text-gray-600 hover:text-gray-900">
          Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        className="text-sm bg-green-800 hover:bg-green-700 text-white rounded-lg px-4 py-2"
      >
        {nextLabel ?? 'Next'}
      </button>
    </div>
  )
}
