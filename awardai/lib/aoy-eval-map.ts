// lib/aoy-eval-map.ts: Workbench P2 Chunk 2 (S138)
//
// Pure, source-agnostic mapper: fold ONE stored AOY evaluation onto the
// section-workbench cards + summary bar, keyed by section key (field_key),
// NEVER by array order. The AOY eval is a single evaluations row whose
// output.sections[] carries per-section { key, label, score, weight,
// rationale } and whose gaps[] are entry-level strings, each tied by the
// prompt contract to a weighted section. Scores are also mirrored in
// evaluations.scores keyed by field_key.
//
// No React, no Supabase, no Deno globals: unit-testable in plain Node and
// portable to the future AOY v2 config-engine migration. ES-target safe: no
// /u regex flag, no \p{...}, no Set-spread, no for...of over a Set (S113 +
// the downlevel-iteration constraint documented in lib/data-needed.ts).

export type StoredEvalSection = {
  key?: string | null
  label?: string | null
  score?: number | null
  weight?: number | null
  rationale?: string | null
}

export type AoyEvalInput = {
  // evaluations.scores: per-section jury scores keyed by field_key.
  scores?: Record<string, number> | null
  // output.sections[]: carries rationale (and score/weight) keyed by `key`.
  sections?: StoredEvalSection[] | null
  // entry-level gap strings, each tied to a weighted section by the prompt.
  gaps?: string[] | null
}

export type SectionEval = {
  score: number | null
  rationale: string | null
  gaps: string[]
}

export type AoyEvalMapping = {
  // Keyed by field_key; every key passed in `fieldKeys` is present.
  bySection: Record<string, SectionEval>
  // Gaps that matched no section: surfaced in the summary bar, never dropped.
  unattributedGaps: string[]
}

// Words too generic to anchor a gap to a section on their own.
const STOPWORDS: Record<string, true> = {
  the: true, and: true, for: true, with: true, against: true, from: true,
  into: true, this: true, that: true, section: true, sections: true,
}

function significantWords(label: string): string[] {
  const raw = (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // strips & and + as well; ES5-safe (no /u)
    .split(/\s+/)
  const out: string[] = []
  for (const w of raw) {
    if (w.length > 2 && !STOPWORDS[w]) out.push(w)
  }
  return out
}

function wordSet(text: string): Record<string, true> {
  const set: Record<string, true> = {}
  const parts = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
  for (const p of parts) if (p) set[p] = true
  return set
}

// Attribute one gap to at most one section. Score each candidate by the count
// of DISTINCT significant label words present in the gap, and require at least
// min(2, sigWords) hits so a single common word (e.g. "client") cannot pull an
// unrelated gap onto a card. Highest hit count wins; ties break to the earliest
// candidate (canvas order). Heuristic and fail-soft by design: a gap that
// clears no threshold stays unattributed rather than risk a wrong card.
function attributeGap(
  gap: string,
  candidates: { key: string; sig: string[] }[],
): string | null {
  const words = wordSet(gap)
  let bestKey: string | null = null
  let bestScore = 0
  for (const c of candidates) {
    if (c.sig.length === 0) continue
    let hits = 0
    for (const w of c.sig) if (words[w]) hits++
    const threshold = Math.min(2, c.sig.length)
    if (hits >= threshold && hits > bestScore) {
      bestScore = hits
      bestKey = c.key
    }
  }
  return bestKey
}

/**
 * Map a stored AOY evaluation onto per-section cards + the summary bar.
 *
 * @param input      scores + output.sections + gaps from the evaluations row.
 * @param fieldKeys  the section field_keys currently on screen, in canvas
 *                   order. Output is keyed by these; keys absent from the eval
 *                   get a null score / null rationale / no gaps.
 */
export function mapAoyEvaluation(
  input: AoyEvalInput,
  fieldKeys: string[],
): AoyEvalMapping {
  const scores: Record<string, number> = input.scores ?? {}
  const sections: StoredEvalSection[] = Array.isArray(input.sections) ? input.sections : []
  const gaps: string[] = Array.isArray(input.gaps) ? input.gaps : []

  // Index stored sections by key for O(1) rationale/score lookup.
  const sectionByKey: Record<string, StoredEvalSection> = {}
  for (const s of sections) {
    if (s && typeof s.key === 'string') sectionByKey[s.key] = s
  }

  const bySection: Record<string, SectionEval> = {}
  for (const k of fieldKeys) {
    const stored = sectionByKey[k]
    const scoreFromScores = typeof scores[k] === 'number' ? scores[k] : null
    const scoreFromSection = stored && typeof stored.score === 'number' ? stored.score : null
    bySection[k] = {
      score: scoreFromScores != null ? scoreFromScores : scoreFromSection,
      rationale: stored && typeof stored.rationale === 'string' ? stored.rationale : null,
      gaps: [],
    }
  }

  // Attribution candidates are the STORED weighted sections (gaps tie to
  // weighted sections by contract), intersected with the fields on screen.
  const candidates: { key: string; sig: string[] }[] = []
  for (const s of sections) {
    if (s && typeof s.key === 'string' && bySection[s.key]) {
      candidates.push({ key: s.key, sig: significantWords(s.label || s.key) })
    }
  }

  const unattributedGaps: string[] = []
  for (const g of gaps) {
    if (typeof g !== 'string' || !g.trim()) continue
    const key = attributeGap(g, candidates)
    if (key && bySection[key]) bySection[key].gaps.push(g)
    else unattributedGaps.push(g)
  }

  return { bySection, unattributedGaps }
}
