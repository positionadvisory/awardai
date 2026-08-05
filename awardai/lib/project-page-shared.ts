// lib/project-page-shared.ts — extracted from app/projects/[id]/page.tsx
// (refactor-r1r2-tabs-2026-07-13 build fix). Next.js App Router page.tsx
// files may only export `default` + the sanctioned page-export allowlist;
// these were runtime value exports (COLLAB_TYPE_LABELS, materialWordCount,
// buildAnalysisText) that tripped "X is not a valid Page export field" in
// the Vercel build (a next-build-specific check plain tsc doesn't catch).
// Moved here verbatim, no behavior change. Types imported back from
// page.tsx are type-only (erased at compile time), so this creates no
// runtime circular dependency with the page.

import type { Material, ScriptAnalysis } from '@/app/projects/[id]/page'

// ── Collaborator ──────────────────────────────────────────────────────────────
export type CollabType =
  | 'lead_agency' | 'creative_agency' | 'media_agency'
  | 'production_company' | 'pr_agency' | 'brand_team' | 'tech_partner' | 'other'

export const COLLAB_TYPE_LABELS: Record<CollabType, string> = {
  lead_agency:        'Lead Agency',
  creative_agency:    'Creative Agency',
  media_agency:       'Media Agency',
  production_company: 'Production Company',
  pr_agency:          'PR Agency',
  brand_team:         'Brand / Client Team',
  tech_partner:       'Technology Partner',
  other:              'Other',
}

// Session 52 (P-03): page load no longer fetches extracted_text — materials
// arrive as slim metadata with has_text/text_words. Fresh uploads this session
// still carry extracted_text in memory. ALWAYS use these helpers instead of
// checking m.extracted_text directly for gating/badges/word counts.
export const materialWordCount = (m: Material): number =>
  typeof m.text_words === 'number'
    ? m.text_words
    : (m.extracted_text || '').trim().split(/\s+/).filter(Boolean).length

// ── Material text read result (5 Aug 2026 defect / rebuilt 6 Aug 2026) ──────
//
// fetchMaterialText used to return a bare string and swallow the RPC error into
// ''. That left every caller unable to tell "this file genuinely has no text"
// from "the call failed", and the copy built on top of it ("Could not load the
// material text - please refresh the page") was actively false in the case that
// actually fired: an undefined material.path is DROPPED by JSON.stringify, so
// PostgREST 404s the FUNCTION and no amount of refreshing fixes it.
//
// INVARIANT: ok:true always carries NON-EMPTY text. An empty read is not a
// success with an empty payload, it is `no_text`. That is what makes the union
// worth having -- a failed read can no longer be mistaken for empty data.
export type MaterialTextFailure =
  | 'no_material'   // the index/selector resolved to nothing
  | 'no_text'       // read fine, but there is no usable text on this material
  | 'missing_path'  // Material.path absent -- the RPC cannot be called at all
  | 'fetch_failed'  // the RPC itself errored

export type MaterialTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: MaterialTextFailure }

/** User-facing copy for a failed read. One definition so every surface says the
 * same true thing, and so 'refresh the page' is only ever offered where a
 * refresh could actually help. */
export function materialTextErrorMessage(reason: MaterialTextFailure): string {
  switch (reason) {
    case 'no_material':
      return 'That file is no longer attached to this project.'
    case 'no_text':
      return 'No text could be read from that file. If it is a scanned or image-only PDF, re-upload a text version.'
    case 'missing_path':
      return 'That file is missing its storage reference, so its text cannot be loaded. Re-upload the file to fix this.'
    default:
      return 'Could not load the material text. Please refresh the page and try again.'
  }
}

/** Collapse a result to a context-override string. Use ONLY where an absent
 * override is a legitimate outcome and nothing is claimed to the user. */
export const materialTextOrUndefined = (r: MaterialTextResult): string | undefined =>
  r.ok && r.text ? r.text : undefined

export function buildAnalysisText(
  analysis: ScriptAnalysis,
  campaignName: string,
  show: string,
  category: string
): string {
  const lines = [
    'SCRIPT ANALYSIS REPORT',
    '================================',
    `Project:  ${campaignName}`,
    ...(show ? [`Show:     ${show}`] : []),
    ...(category ? [`Category: ${category}`] : []),
    '',
    'OVERALL ASSESSMENT',
    '================================',
    analysis.summary,
    '',
  ]
  if (analysis.key_improvements.length > 0) {
    lines.push('KEY IMPROVEMENTS', '================================')
    analysis.key_improvements.forEach((item, i) => {
      lines.push(`${i + 1}. ${item}`)
    })
    lines.push('')
  }
  if (analysis.changes.length > 0) {
    lines.push('SCENE-BY-SCENE CHANGES', '================================')
    analysis.changes.forEach((change, i) => {
      lines.push(`\n[${i + 1}] ${change.section}`)
      if (change.original) lines.push(`Original: "${change.original}"`)
      lines.push(`Rationale: ${change.reason}`)
    })
    lines.push('')
  }
  lines.push('---', 'Generated by Shortlist · shortlist.app')
  return lines.join('\n')
}
