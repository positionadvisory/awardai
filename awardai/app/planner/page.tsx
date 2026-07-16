'use client'
/**
 * app/planner/page.tsx — Portfolio Planner v2, the five-step flow.
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA + USER
 * MODEL & FLOW v2 sections (the amendments win). Build session P2; revised P2.1.
 *
 * The page owns the input STATE and calls lib/planner-engine.ts's derivePlan
 * for ALL allocation — it computes nothing of its own. Odds render only via
 * <GatedNumber/> (lib/rate-facts.ts); fees via lib/fx.ts's dated conversion.
 * agency_profiles has ZERO client writes by rule (Gotchas): planner_prefs is
 * saved only through the existing /api/agency-profile PATCH, on explicit action.
 *
 * P2.1: campaignsReady is now part of PlannerInput (persisted, feeds the engine)
 * — the old UI-only "capacity" page state is gone. The home-market region is
 * normalised to a PlannerRegion enum (normalizeUserRegion) so the region gate is
 * deterministic.
 *
 * FLAG: PLANNER_V2_DEFAULT=false. Enable with ?planner_v2=1 (persisted to
 * localStorage, cleared with ?planner_v2=0). Query params read via
 * window.location.search in an effect, NEVER useSearchParams (Gotchas).
 *
 * Next page-export-shape rule (Gotchas S161): this file exports ONLY a default.
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { fetchPlannerFacets, normalizeUserRegion, type PlannerFacet } from '@/lib/planner-facets'
import { fetchRateFacts, type RateFact } from '@/lib/rate-facts'
import {
  derivePlan,
  type PlannerInput,
  type PlannerLens,
  type PlannerMaturity,
  type PlannerAgencyDiscipline,
  type PlannerOrgType,
  type PlannerPrefs,
} from '@/lib/planner-engine'
import type { CurrencyCode } from '@/lib/fx'
import { DISPLAY_CURRENCIES } from '@/lib/planner-display'
import PlannerIdentity from '@/components/planner/PlannerIdentity'
import PlannerTarget from '@/components/planner/PlannerTarget'
import PlannerEnvelope from '@/components/planner/PlannerEnvelope'
import PortfolioResult from '@/components/planner/PortfolioResult'
import PlannerV3 from '@/components/planner/PlannerV3'

// ── Feature flag (soft gate; see file header) ────────────────────────────────
const PLANNER_V2_DEFAULT = false
const FLAG_KEY = 'planner_v2'
// V3-P2 ships behind its own query param/localStorage gate, same pattern as v2.
const FLAG_KEY_V3 = 'planner_v3'

// ── Defaults ──────────────────────────────────────────────────────────────
const DEFAULT_BUDGET = 50000
const DEFAULT_CURRENCY: CurrencyCode = 'USD'
const DEFAULT_LENS: PlannerLens = 'maximize_visibility'
const DEFAULT_DISCIPLINE: PlannerAgencyDiscipline = 'full_service'
const DEFAULT_MATURITY: PlannerMaturity = 'beginner'
const ORG_TYPES: PlannerOrgType[] = ['agency', 'brand', 'production_company', 'media_agency', 'consultancy']

type Step = 'identity' | 'target' | 'envelope' | 'result'

function isCurrency(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (DISPLAY_CURRENCIES as string[]).includes(v)
}

/** Suggest a maturity tier from project count. Never applied silently (spec). */
function suggestMaturity(projectCount: number): PlannerMaturity {
  if (projectCount >= 9) return 'advanced'
  if (projectCount >= 3) return 'intermediate'
  return 'beginner'
}

export default function PlannerPage() {
  const { user, loading: authLoading } = useAuth()

  // Flag state — resolved from URL + localStorage in an effect (client only).
  const [flagResolved, setFlagResolved] = useState(false)
  const [enabled, setEnabled] = useState(PLANNER_V2_DEFAULT)
  const [enabledV3, setEnabledV3] = useState(false)

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get(FLAG_KEY)
    if (param === '1') {
      try { window.localStorage.setItem(FLAG_KEY, '1') } catch { /* private mode */ }
    } else if (param === '0') {
      try { window.localStorage.removeItem(FLAG_KEY) } catch { /* private mode */ }
    }
    let stored = false
    try { stored = window.localStorage.getItem(FLAG_KEY) === '1' } catch { /* private mode */ }
    setEnabled(PLANNER_V2_DEFAULT || param === '1' || stored)
    const paramV3 = new URLSearchParams(window.location.search).get(FLAG_KEY_V3)
    if (paramV3 === '1') {
      try { window.localStorage.setItem(FLAG_KEY_V3, '1') } catch { /* private mode */ }
    } else if (paramV3 === '0') {
      try { window.localStorage.removeItem(FLAG_KEY_V3) } catch { /* private mode */ }
    }
    let storedV3 = false
    try { storedV3 = window.localStorage.getItem(FLAG_KEY_V3) === '1' } catch { /* private mode */ }
    setEnabledV3(paramV3 === '1' || storedV3)
    setFlagResolved(true)
  }, [])

  // Data state.
  const [orgId, setOrgId] = useState<number | null>(null)
  const [facets, setFacets] = useState<PlannerFacet[]>([])
  const [rateFacts, setRateFacts] = useState<RateFact[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [fetching, setFetching] = useState(true)
  const [hasProfile, setHasProfile] = useState(false)

  // The single fixed as-of date for this session — keeps derivation
  // deterministic across re-renders (the engine takes it explicitly).
  const [asOfDate] = useState(() => new Date().toISOString().slice(0, 10))

  // The planner input (the thing the engine derives from).
  const [input, setInput] = useState<PlannerInput | null>(null)
  const [step, setStep] = useState<Step>('identity')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // ── Load: org, profile (+ prefs), facets, rate facts, project count ─────────
  useEffect(() => {
    if (!enabled || !user) return
    let cancelled = false
    setFetching(true)
    ;(async () => {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      const oid = profileRow?.org_id ?? null
      if (cancelled) return
      setOrgId(oid)

      const [facetList, rateList] = await Promise.all([fetchPlannerFacets(), fetchRateFacts()])
      if (cancelled) return
      setFacets(facetList)
      setRateFacts(rateList)

      let agencyProfile: Record<string, unknown> | null = null
      let count = 0
      if (oid) {
        const [{ data: ap }, { count: c }] = await Promise.all([
          supabase.from('agency_profiles').select('*').eq('org_id', oid).maybeSingle(),
          supabase.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', oid),
        ])
        agencyProfile = (ap as Record<string, unknown> | null) ?? null
        count = c ?? 0
      }
      if (cancelled) return
      setHasProfile(!!agencyProfile)
      setProjectCount(count)

      // Build the initial input: saved planner_prefs.current wins; else derive
      // sensible defaults from the profile. Region is normalised to a
      // PlannerRegion enum (P2.1 #6) from whatever we have (a saved enum value,
      // or the derived city) so the region gate is deterministic.
      const prefs = (agencyProfile?.planner_prefs as PlannerPrefs | null) ?? null
      const cur = prefs?.current ?? null
      const offices = (agencyProfile?.office_locations as string[] | null) ?? null
      const derivedRegionRaw =
        (agencyProfile?.agency_city as string | null) || (offices && offices.length > 0 ? offices[0] : '') || ''
      const rawOrgType = agencyProfile?.org_type as string | undefined
      const orgType: PlannerOrgType =
        rawOrgType && (ORG_TYPES as string[]).includes(rawOrgType) ? (rawOrgType as PlannerOrgType) : 'agency'

      const initial: PlannerInput = {
        discipline: cur?.discipline ?? DEFAULT_DISCIPLINE,
        maturity: cur?.maturity ?? suggestMaturity(count),
        region: normalizeUserRegion(cur?.region ?? derivedRegionRaw),
        budget: cur?.budget ?? DEFAULT_BUDGET,
        budgetCurrency: isCurrency(cur?.budget_currency) ? cur!.budget_currency! : DEFAULT_CURRENCY,
        campaignsReady: cur?.campaigns_ready ?? null,
        targetTitle: cur?.target_title ?? undefined,
        pins: cur?.pins ?? [],
        excludes: cur?.excludes ?? [],
        lens: cur?.lens ?? DEFAULT_LENS,
        orgType,
      }
      setInput(initial)
      // Skip straight to the result if the user has a saved, complete plan.
      setStep(cur?.discipline && cur?.maturity ? 'result' : 'identity')
      setFetching(false)
    })().catch(() => {
      if (!cancelled) setFetching(false)
    })
    return () => { cancelled = true }
  }, [enabled, user])

  const suggestedMaturity: PlannerMaturity | null = useMemo(
    () => (projectCount > 0 ? suggestMaturity(projectCount) : null),
    [projectCount],
  )

  // The plan — the ONLY derivation, delegated entirely to the engine.
  const plan = useMemo(
    () => (input ? derivePlan(input, facets, asOfDate) : null),
    [input, facets, asOfDate],
  )

  const patchInput = (patch: Partial<PlannerInput>) =>
    setInput(prev => (prev ? { ...prev, ...patch } : prev))

  // ── Save (explicit only) via the service-role PATCH route ───────────────────
  const savePrefs = async () => {
    if (!input) return
    setSaveStatus('saving')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) { setSaveStatus('error'); return }
      const prefs: PlannerPrefs = {
        schema_version: 1,
        updated_by: user?.email ?? user?.id ?? null,
        current: {
          discipline: input.discipline,
          maturity: input.maturity,
          region: input.region,
          budget: input.budget,
          budget_currency: input.budgetCurrency,
          campaigns_ready: input.campaignsReady,
          target_title: input.targetTitle ?? null,
          pins: input.pins,
          excludes: input.excludes,
          lens: input.lens,
        },
        scenarios: [],
      }
      const res = await fetch('/api/agency-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planner_prefs: prefs }),
      })
      if (!res.ok) { setSaveStatus('error'); return }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
    }
  }

  // ── Render gates ────────────────────────────────────────────────────────────
  if (!flagResolved || authLoading) {
    return <Shell><p className="text-sm text-gray-500">Loading...</p></Shell>
  }
  // V3-P2: when the v3 flag is on, render the campaign-driven planner. It owns
  // its own data load + flow; the v2 wizard below is untouched and stays the
  // fallback until V3-P4 flips the default.
  if (enabledV3) {
    return <Shell><PlannerV3 /></Shell>
  }
  if (!enabled) {
    return (
      <Shell>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h1 className="text-lg font-bold text-gray-900">Portfolio Planner</h1>
          <p className="text-sm text-gray-600 mt-2">
            This feature is in preview and not yet enabled on your account.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            <Link href="/projects" className="text-green-700 underline">Back to your projects</Link>
          </p>
        </div>
      </Shell>
    )
  }
  if (fetching || !input || !plan) {
    return <Shell><p className="text-sm text-gray-500">Building your planner...</p></Shell>
  }

  // ── Wizard chrome ─────────────────────────────────────────────────────────
  const stepOrder: Step[] = ['identity', 'target', 'envelope', 'result']
  const stepIndex = stepOrder.indexOf(step)
  const goNext = () => setStep(stepOrder[Math.min(stepIndex + 1, stepOrder.length - 1)])
  const goBack = () => setStep(stepOrder[Math.max(stepIndex - 1, 0)])

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Portfolio Planner</h1>
        <p className="text-sm text-gray-500">
          Given who you are and what you are going for, which shows should you enter.
        </p>
      </div>

      {!hasProfile && step !== 'result' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          You do not have an agency profile yet, so we started from blank defaults. You can fill these in below, or{' '}
          <Link href="/projects" className="underline">set up your profile first</Link>.
        </div>
      )}

      {step !== 'result' && (
        <StepDots index={stepIndex} />
      )}

      {step === 'identity' && (
        <Card title="Who you are" blurb="Pre-filled from your profile. Confirm or change anything.">
          <PlannerIdentity
            value={{
              discipline: input.discipline,
              orgType: input.orgType,
              region: input.region,
              maturity: input.maturity,
            }}
            suggestedMaturity={suggestedMaturity}
            onChange={patchInput}
          />
          <NextBack onNext={goNext} />
        </Card>
      )}

      {step === 'target' && (
        <Card title="What you are going for" blurb="The title to work back from. Optional.">
          <PlannerTarget
            discipline={input.discipline}
            facets={facets}
            value={input.targetTitle ?? ''}
            onChange={t => patchInput({ targetTitle: t })}
          />
          <NextBack onNext={goNext} onBack={goBack} />
        </Card>
      )}

      {step === 'envelope' && (
        <Card title="Your realistic scope" blurb="What you can spend on entry fees, and how many campaigns you have ready.">
          <PlannerEnvelope
            budget={input.budget}
            budgetCurrency={input.budgetCurrency as CurrencyCode}
            campaignsReady={input.campaignsReady}
            onChange={patchInput}
          />
          <NextBack onNext={goNext} onBack={goBack} nextLabel="See my plan" />
        </Card>
      )}

      {step === 'result' && (
        <PortfolioResult
          plan={plan}
          input={input}
          facets={facets}
          rateFacts={rateFacts}
          suggestedMaturity={suggestedMaturity}
          onInputChange={patchInput}
          onSave={savePrefs}
          saveStatus={saveStatus}
          onRequestCoverage={() => { /* P3 wires the show_requests POST (source:'planner') */ }}
        />
      )}
    </Shell>
  )
}

// ── Local presentational helpers (NOT exported — page-export-shape rule) ─────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto w-full px-4 py-8">{children}</div>
    </div>
  )
}

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {blurb && <p className="text-xs text-gray-500 mt-0.5 mb-4">{blurb}</p>}
      {children}
    </div>
  )
}

function StepDots({ index }: { index: number }) {
  const labels = ['You', 'Target', 'Scope']
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
