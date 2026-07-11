// lib/section-rescore.ts — Workbench P3 (S146)
//
// Pure, source-agnostic helpers for the section-level DIRECTIONAL re-score feature.
// No React, no Supabase, no Deno globals: unit-testable in plain Node and portable to
// the future AOY v2 migration. ES-target safe: no /u regex flag, no \p{...}, no Set
// spread, no for...of over a Set (S113 + the downlevel-iteration constraint).
//
// PARITY: hashText below is BYTE-COPIED into edge-functions/evaluate-aoy-section.ts
// (Deno cannot import from lib/). The two copies must stay identical or a section will
// look permanently "stale" (the stored hash would never match the recomputed one).
// scripts/evaluate-aoy-section-parity-fixture.mjs asserts the two copies match.

// A directional rescore as stored in evaluations.section_rescores[section_key] and as
// returned by the edge fn. NEVER overwrites the official evaluation's section score.
export type SectionRescore = {
  score: number
  rationale: string
  at: string
  text_hash: string
}

// Stable 32-bit FNV-1a over the string, returned as 8 hex chars. Not cryptographic:
// this only detects "did the scored text change since?" for the stale badge. Must be
// byte-identical to the copy in evaluate-aoy-section.ts so a hash written server-side
// matches one recomputed client-side. Deterministic and ES5-safe (no BigInt).
export function hashText(s: string): string {
  const str = s || ''
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // h *= 16777619, done with shifts to stay in 32-bit unsigned range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8)
}

// True when the section's current text differs from the text that produced the rescore,
// i.e. the user edited it again after re-checking. Drives the "edited since, re-check"
// badge. A rescore with no stored hash is treated as never-stale (fail-soft).
export function isRescoreStale(rescore: SectionRescore | null | undefined, currentText: string): boolean {
  if (!rescore || !rescore.text_hash) return false
  return rescore.text_hash !== hashText((currentText || '').trim())
}

export type IndicativeSectionInput = {
  weight: number | null | undefined
  // The official jury section score (0-10) from the evaluation of record.
  official: number | null | undefined
  // The fresh directional rescore for this section, if the user re-checked it.
  rescore: number | null | undefined
}

// Recompute the weighted total on the 0-10 scale, substituting the fresh directional
// rescore for the official section score wherever one exists. This mirrors the frozen
// scorer's own math exactly: sum(score * weight) / sum(weight). An absent score counts
// as 0 (an unaddressed weighted section loses its weight), never inflated. Returns null
// when there is nothing weighted to total. The result is DIRECTIONAL only; the official
// overall_score is never touched.
export function computeIndicativeTotal(sections: IndicativeSectionInput[]): number | null {
  let weightSum = 0
  let accum = 0
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const weight = typeof s.weight === 'number' && isFinite(s.weight) ? s.weight : 0
    if (weight <= 0) continue
    const effective =
      typeof s.rescore === 'number' && isFinite(s.rescore) ? s.rescore
        : typeof s.official === 'number' && isFinite(s.official) ? s.official
          : 0
    accum += effective * weight
    weightSum += weight
  }
  if (weightSum <= 0) return null
  return Math.round((accum / weightSum) * 10) / 10
}
