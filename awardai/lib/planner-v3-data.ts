/**
 * lib/planner-v3-data.ts — Portfolio Planner v3 (P2) input DATA layer.
 * =============================================================================
 * V3-P2 builds NOTHING in the engine (lib/planner-v3-engine.ts is P1, frozen
 * here). This module turns the org's live rows into the engine's input types:
 *   fetchCampaignOptions(orgId) -> CampaignOption[]   (the sorted picker feed)
 *   toSelectedCampaign(option)  -> SelectedCampaign   (engine input coercion)
 *   marketEligibleShows(...)    -> string[]           (the zero-state teaser)
 *
 * WHERE THE FIELDS COME FROM (verified live 16 Jul against the AwardAI DB):
 *   - "entry readiness" = the campaign's LATEST evaluation.overall_score that
 *     is non-null. evaluations.overall_score is nullable, so a project can have
 *     evaluations yet no usable score.
 *   - "scored show" = the best_show of the direction behind that latest scored
 *     evaluation. evaluations has NO show column and NO direction link, but
 *     evaluations.entry_draft_id is NOT NULL and entry_drafts.direction_id is
 *     NOT NULL, so the chain eval -> entry_draft -> direction -> best_show is
 *     total and deterministic. (This is the "7.4 vs MMA Smarties APAC" badge.)
 *   - has_activity per direction = the direction has an entry_draft and/or an
 *     evaluation attached (spec step 2 "prefer directions with activity").
 *   - sort_order = the direction's index in creation order (generator order),
 *     the tiebreaker reduceCampaign() uses after activity.
 *
 * All reads are client-side under RLS (org_select policies on projects/
 * directions/entry_drafts/evaluations, verified live). No writes here.
 * =============================================================================
 */

import { supabase } from '@/lib/supabase'
import type { PlannerV3Direction, SelectedCampaign } from '@/lib/planner-v3-engine'
import {
  isExcludedFacet,
  regionAdmits,
  type PlannerFacet,
  type PlannerRegion,
} from '@/lib/planner-facets'

/** The latest-eval score at or above which a campaign is preselected (spec). */
export const QUALIFY_THRESHOLD = 7

/**
 * One selectable campaign for the sorted picker. entry_readiness is nullable
 * here (a project may never have been scored) — distinct from SelectedCampaign,
 * whose entry_readiness the engine treats as a number. Coerce via
 * toSelectedCampaign() only when the campaign is actually selected.
 */
export type CampaignOption = {
  project_id: number
  campaign_name: string
  /** Latest non-null overall_score (0-10), or null if never scored. */
  entry_readiness: number | null
  /** best_show of the direction behind that latest score; null if unscored. */
  scored_show: string | null
  directions: PlannerV3Direction[]
  /** Preselected iff scored and at/above QUALIFY_THRESHOLD. */
  qualifies: boolean
}

// Local row shapes — cast the RLS query results to these rather than typing the
// builder (a `ReturnType<typeof createClient>` param types results as `never`;
// Gotchas TypeScript/Build). Only the columns this module reads are listed.
type ProjectRow = { id: number; campaign_name: string | null; client_name: string | null; created_at: string | null }
type DirectionRow = {
  id: number
  project_id: number
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null
  created_at: string | null
}
type DraftRow = { id: number; project_id: number; direction_id: number }
type EvalRow = { id: number; project_id: number; entry_draft_id: number; overall_score: number | null; created_at: string }

/**
 * Fetch every project in the org as a selectable campaign, sorted by latest
 * eval score (desc, unscored last), with the qualifying (>= threshold) ones
 * flagged. Fail-soft: a query error degrades to an empty list rather than
 * throwing into a render path (mirrors fetchPlannerFacets).
 */
export async function fetchCampaignOptions(orgId: number): Promise<CampaignOption[]> {
  const { data: projectData, error: projErr } = await supabase
    .from('projects')
    .select('id, campaign_name, client_name, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  const projects = (projErr ? [] : (projectData as ProjectRow[] | null) ?? [])
  if (projects.length === 0) return []
  const projectIds = projects.map(p => p.id)

  const [dirRes, draftRes, evalRes] = await Promise.all([
    supabase
      .from('directions')
      .select('id, project_id, best_show, best_category, win_likelihood, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('entry_drafts')
      .select('id, project_id, direction_id')
      .in('project_id', projectIds),
    supabase
      .from('evaluations')
      .select('id, project_id, entry_draft_id, overall_score, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
  ])

  const directions = (dirRes.data as DirectionRow[] | null) ?? []
  const drafts = (draftRes.data as DraftRow[] | null) ?? []
  const evals = (evalRes.data as EvalRow[] | null) ?? []

  // entry_draft_id -> direction_id, and which directions carry a draft.
  const draftDirection = new Map<number, number>()
  const directionsWithDraft = new Set<number>()
  for (const d of drafts) {
    draftDirection.set(d.id, d.direction_id)
    directionsWithDraft.add(d.direction_id)
  }

  // A direction has an eval iff any of its drafts was evaluated.
  const directionsWithEval = new Set<number>()
  for (const e of evals) {
    const dirId = draftDirection.get(e.entry_draft_id)
    if (dirId !== undefined) directionsWithEval.add(dirId)
  }

  // Latest NON-NULL-score eval per project (evals are pre-sorted newest-first,
  // so the first non-null hit per project is the latest).
  const latestScored = new Map<number, { score: number; entry_draft_id: number }>()
  for (const e of evals) {
    if (e.overall_score === null || e.overall_score === undefined) continue
    if (!latestScored.has(e.project_id)) {
      latestScored.set(e.project_id, { score: Number(e.overall_score), entry_draft_id: e.entry_draft_id })
    }
  }

  // Directions grouped by project (already in creation order).
  const dirsByProject = new Map<number, DirectionRow[]>()
  for (const d of directions) {
    const arr = dirsByProject.get(d.project_id)
    if (arr) arr.push(d)
    else dirsByProject.set(d.project_id, [d])
  }

  const options: CampaignOption[] = projects.map(p => {
    const projDirs = dirsByProject.get(p.id) ?? []
    const pv3dirs: PlannerV3Direction[] = projDirs.map((d, idx) => ({
      direction_id: d.id,
      best_show: d.best_show ?? null,
      best_category: d.best_category ?? null,
      win_likelihood: d.win_likelihood ?? null,
      has_activity: directionsWithDraft.has(d.id) || directionsWithEval.has(d.id),
      sort_order: idx,
    }))

    const scored = latestScored.get(p.id) ?? null
    const entry_readiness = scored ? scored.score : null
    let scored_show: string | null = null
    if (scored) {
      const dirId = draftDirection.get(scored.entry_draft_id)
      const dir = dirId !== undefined ? projDirs.find(d => d.id === dirId) : undefined
      scored_show = dir?.best_show ?? null
    }

    const campaign_name = p.campaign_name || p.client_name || `Project ${p.id}`
    const qualifies = entry_readiness !== null && entry_readiness >= QUALIFY_THRESHOLD

    return { project_id: p.id, campaign_name, entry_readiness, scored_show, directions: pv3dirs, qualifies }
  })

  options.sort((a, b) => {
    const ar = a.entry_readiness ?? -1
    const br = b.entry_readiness ?? -1
    if (br !== ar) return br - ar
    return a.campaign_name.localeCompare(b.campaign_name)
  })

  return options
}

/**
 * Coerce a selected option into the engine's SelectedCampaign. A manually-added
 * campaign with no eval has entry_readiness null -> 0: the honest floor. The
 * engine reads it as minimum readiness, so an unscored campaign can never
 * surface a hard show at the top of the plan (spec: weak campaigns must not
 * surface Cannes).
 */
export function toSelectedCampaign(option: CampaignOption): SelectedCampaign {
  return {
    project_id: option.project_id,
    campaign_name: option.campaign_name,
    entry_readiness: option.entry_readiness ?? 0,
    scored_show: option.scored_show,
    directions: option.directions,
  }
}

/**
 * Top market-eligible show names for the zero-state teaser (spec: "top 3-5
 * market-eligible shows for the profile"). Work-lane facets only, excluded
 * shows dropped, region-gated exactly as the engine gates. De-duped by show
 * name, capped. This is a teaser hint, NOT a derivation — no scoring, no fees.
 */
export function marketEligibleShows(
  facets: PlannerFacet[],
  region: PlannerRegion,
  limit = 5,
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const eligible = facets.filter(
    f => f.kind === 'work' && !isExcludedFacet(f) && regionAdmits(region, f),
  )
  for (const f of eligible) {
    const key = f.show_name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(f.show_name)
    if (names.length >= limit) break
  }
  return names
}
