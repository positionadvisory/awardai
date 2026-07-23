'use client'
// components/EvalBreakdown.tsx — S160 projects/[id] structural refactor.
//
// THE one reusable presentational render for an evaluation's full payoff:
// score header, section-keyed breakdowns (AOY weighted / SMARTIES qualitative /
// config jury), the standard 6-dimension grid, the judge jury-read
// (talks_up / kills_it / recommendations) or coach output (focus_point /
// priority_fixes / cuts), the legacy strengths/gaps fallback, changes analysis,
// and the fix-this chips. Extracted verbatim from the inline JSX in
// app/projects/[id]/page.tsx (S152-era eval panel body) so a second surface
// (/start today, anything later) can show the full payoff without copying
// hundreds of lines (Gotchas-Critical Addendum S158).
//
// PRESENTATIONAL ONLY. No fetches, no Supabase, no page state. Everything
// page-coupled arrives through props:
//   - deltas: the page's comparison re-eval score deltas (scoreDeltas[dirId])
//   - marketContextSlot: the AOY market-context modifier block (page handlers)
//   - improveCtaSlot: the Generate Improved Draft CTA (page handlers)
//   - fixChips: selection state + handlers; the CHIP ITEMS are derived here
//     from the evaluation shape so the derivation cannot drift per surface
//   - compact: the /start variant (brief app-styled read: score line, chips
//     grid, capped-3 talk-up/kill quote cards) — S158 round 3, Ben-tested
//
// Section identity is carried ON each output.sections entry (key for weighted,
// field_key for qualitative) — everything maps by KEY, never positional index
// (the WORKBENCH AOY EVAL SHAPE rule). Thin/missing strengths/gaps/sections all
// degrade to hidden blocks, never a crash.
//
// Scoring is NEVER touched here: this renders persisted evaluations only.

import React from 'react'

// ── shared evaluation display types (moved from app/projects/[id]/page.tsx) ──

export type EvaluationScores = {
  strategic_clarity: number
  insight: number
  idea: number
  execution: number
  results: number
  jury_fit: number
  brief_alignment?: number  // coach mode only
}

// v3 evaluation output types (stored in output jsonb column)
export type JudgeOutput = {
  talks_up: string[]
  kills_it: string[]
  recommendations: string
  campaign_name_note?: string
  // Build 2 (Session 55): present only on evals run with candidates supplied.
  // [] is a valid "no stronger placements" answer; absent = pre-Build-2 eval.
  next_opportunities?: { show: string; category: string; rationale: string }[]
}
export type PriorityFix = { fix: string; why: string; action: string }
export type CoachOutput = {
  focus_point: string
  priority_fixes: PriorityFix[]
  cuts: string[]
}
export type EvaluationOutput = JudgeOutput | CoachOutput

// The minimal structural shape this component needs. The page's richer
// Evaluation type and /start's edge-fn response both satisfy it.
export type EvalDisplayData = {
  id: number
  overall_score: number
  scores?: Partial<Record<string, number>> | null
  strengths?: string[] | null
  gaps?: string[] | null
  recommendations?: string | null
  changes_analysis?: string | null
  evaluation_mode?: 'judge' | 'coach'
  created_at?: string
  output?: unknown
}

export const SCORE_DIMENSIONS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'strategic_clarity', label: 'Strategic Clarity' },
  { key: 'insight', label: 'Insight' },
  { key: 'idea', label: 'Idea' },
  { key: 'execution', label: 'Execution' },
  { key: 'results', label: 'Results' },
  { key: 'jury_fit', label: 'Jury Fit' },
]

export function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-700'
  if (score >= 6) return 'text-amber-700'
  return 'text-red-600'
}

export function scoreBg(score: number): string {
  if (score >= 8) return 'bg-green-50 border-green-200'
  if (score >= 6) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

// Coach headroom tier (22 Jul 2026). The coach panel no longer shows a number.
// The prior display printed 10 minus overall_score on an inverse 0-10 scale
// users had to hold against the jury's; it flipped a 73-Lion ECD twice on a
// live demo. Instead a coarse WORD-ONLY tier reads how much room
// the entry has left, bucketed from overall_score (higher = closer to ceiling).
// The digit is NEVER rendered; the bucket is intentionally coarse so Opus scorer
// sampling variance (S144) cannot jitter the label the way a shown digit would.
// NOT derived from priority_fixes: production shows a constant 5 fixes on every
// coach eval (scores 0.8-7.4), so a count-based tier would be constant (Ben,
// 22 Jul: derive the hidden tier from the score instead, show only the word).
function coachHeadroom(score: number): { label: string; caption: string } {
  if (score >= 8) return { label: 'Near ceiling', caption: 'this entry is close to its potential' }
  if (score >= 5) return { label: 'Solid headroom', caption: 'targeted improvements available' }
  return { label: 'Significant headroom', caption: 'real room to strengthen this entry' }
}

// Compact-variant score colours (/start, S158 round 3): app thresholds on
// bordered chips. Kept alongside scoreColor/scoreBg so the thresholds can
// never drift between the two skins.
export function chipClasses(score?: number | null): string {
  if (score == null) return 'bg-gray-50 border-gray-200 text-gray-400'
  if (score >= 8) return 'bg-green-50 border-green-200 text-green-700'
  if (score >= 6) return 'bg-amber-50 border-amber-200 text-amber-700'
  return 'bg-red-50 border-red-200 text-red-600'
}

export function overallColor(score?: number | null): string {
  if (score == null) return 'text-gray-500'
  if (score >= 8) return 'text-green-700'
  if (score >= 6) return 'text-amber-700'
  return 'text-red-600'
}

// Thin proportional meter bar shared by the AOY panels (weight share, fit score).
// Width/colors are INLINE styles, not Tailwind arbitrary values: the purge drops
// arbitrary values in dynamic spots here (the GeneratingBar / gold-accent gotcha).
// Presentational only; the fraction is always computed from code-authoritative
// numbers (persisted section_weight, parsed rubric weight, model fit 0-10).
export function MeterBar({ fraction, color = '#15803d', track = '#e5e7eb', height = 4 }:
  { fraction: number; color?: string; track?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: track }}>
      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 9999 }} />
    </div>
  )
}

// ── fix-chip derivation (eval-shape logic, lives with the render) ────────────

export function deriveFixChipItems(evaluation: EvalDisplayData): string[] {
  const o = (evaluation.output ?? null) as EvaluationOutput | null
  const judgeOutput = evaluation.evaluation_mode === 'judge' ? o as JudgeOutput | null : null
  const coachOutput = evaluation.evaluation_mode === 'coach' ? o as CoachOutput | null : null
  return (
    judgeOutput?.kills_it?.length ? judgeOutput.kills_it :
    coachOutput?.priority_fixes?.length ? coachOutput.priority_fixes.map(pf => pf.fix) :
    evaluation.gaps?.length ? evaluation.gaps : []
  )
}

type FixChipsProps = {
  open: boolean
  selected: string[]
  onToggleOpen: () => void
  onToggleItem: (item: string) => void
}

type Props = {
  evaluation: EvalDisplayData
  /** comparison re-eval deltas, keyed 'overall' | dimension key | section key */
  deltas?: Record<string, number> | null
  /** brief /start-style read: score line + chips grid + capped-3 quote cards */
  compact?: boolean
  /** page-only AOY market-context modifier block (owns its own AOY-judge gate) */
  marketContextSlot?: React.ReactNode
  /** page-only Generate Improved Draft CTA */
  improveCtaSlot?: React.ReactNode
  /** fix-this chip selection; omit to hide the chips entirely */
  fixChips?: FixChipsProps
}

export default function EvalBreakdown({
  evaluation, deltas, compact, marketContextSlot, improveCtaSlot, fixChips,
}: Props) {

  // ── compact variant (/start, S158 round 3 — brief, app-styled) ─────────────
  if (compact) {
    const out = (evaluation.output ?? {}) as {
      talks_up?: string[]; kills_it?: string[]
      sections?: { key?: string; field_key?: string; label?: string; score?: number | null }[]
    }
    const chips = (out.sections && out.sections.length > 0
      ? out.sections.map(s => ({ label: s.label || s.key || '', score: s.score ?? null }))
      : SCORE_DIMENSIONS.map(d => ({ label: d.label, score: evaluation.scores?.[d.key] ?? null })))
    const talkUp = ((out.talks_up && out.talks_up.length ? out.talks_up : evaluation.strengths) ?? []).slice(0, 3)
    const leaks = ((out.kills_it && out.kills_it.length ? out.kills_it : evaluation.gaps) ?? []).slice(0, 3)
    return (
      <>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-semibold tabular-nums ${overallColor(evaluation.overall_score)}`}>{evaluation.overall_score?.toFixed(1) ?? '—'}</span>
          <span className="text-sm text-gray-400">/ 10</span>
          <span className="ml-auto text-xs font-medium uppercase tracking-wide text-gray-400">Jury read</span>
        </div>

        {chips.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {chips.map((c, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${chipClasses(c.score)}`}>
                <p className="text-[11px] font-medium leading-tight opacity-80">{c.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{c.score ?? '—'}</p>
              </div>
            ))}
          </div>
        )}

        {talkUp.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">What Jurors Will Talk Up</p>
            <div className="space-y-2">
              {talkUp.map((s, i) => (
                <div key={i} className="rounded-r-lg border-l-4 border-green-500 bg-green-50 px-4 py-3">
                  <p className="text-sm italic leading-relaxed text-gray-800">&ldquo;{s}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {leaks.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">Where Jurors Will Kill Your Entry</p>
            <div className="space-y-2">
              {leaks.map((g, i) => (
                <div key={i} className="rounded-r-lg border-l-4 border-red-400 bg-red-50 px-4 py-3">
                  <p className="text-sm italic leading-relaxed text-gray-800">&ldquo;{g}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  // ── full variant (the project page eval panel body) ────────────────────────
  return (
    <>
      {(() => {
        const isCoach = evaluation.evaluation_mode === 'coach'
        if (isCoach) {
          // Coach header (22 Jul 2026): NO numeric score. The prior display
          // rendered an inverse 0-10 gap figure users held against the jury's
          // scale; it flipped a 73-Lion ECD twice on a live demo. The coach's
          // model-written
          // focus_point is now the personalized headline, with a coarse word-only
          // headroom tier above it. No digit, no /10, no delta badge — a second
          // number just breeds a second fixation (the whole point of the change).
          const score = evaluation.overall_score
          const tier = Number.isFinite(score) ? coachHeadroom(score) : null
          const co = (evaluation.output ?? null) as CoachOutput | null
          const fixCount = Array.isArray(co?.priority_fixes) ? co!.priority_fixes.length : 0
          const focus = (co?.focus_point ?? '').trim()
          return (
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-full">✦ Coach Review</span>
            {tier && (
              /* tier colour is INLINE (Tailwind purges dynamically-selected classes, V3-P4);
                 a single calm gold, not a traffic-light — colour must not leak score magnitude */
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#a97f2f' }}>
                {tier.label}
                {fixCount > 0 && <span className="font-normal normal-case tracking-normal text-gray-400"> · {fixCount} priority {fixCount === 1 ? 'fix' : 'fixes'}</span>}
              </span>
            )}
          </div>
          {tier && <p className="text-xs text-gray-400 mt-1">{tier.caption}</p>}
          {focus && (
            <p className="text-gray-800 mt-2 leading-snug" style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '1.5rem', letterSpacing: '-0.01em' }}>
              {focus}
            </p>
          )}
        </div>
        {evaluation.created_at && (
          <p className="text-xs text-gray-400 flex-shrink-0 ml-3">
            {new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
          )
        }
        return (
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`font-bold tabular-nums ${scoreColor(evaluation.overall_score)}`}
              style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '2.8rem', lineHeight: 1, letterSpacing: '-0.02em' }}
            >
              {evaluation.overall_score.toFixed(1)}
            </span>
            <span className="text-gray-400" style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '1.25rem' }}>/10</span>
            {/* Overall delta badge — raw score change between comparison re-evals (jury only) */}
            {deltas?.['overall'] !== undefined && deltas['overall'] !== 0 && (
              <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-full ${deltas['overall'] > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {deltas['overall'] > 0 ? `↑ +${deltas['overall']}` : `↓ ${deltas['overall']}`}
              </span>
            )}
            {deltas?.['overall'] === 0 && (
              <span className="text-sm text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">— No change</span>
            )}
            <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">⚖ Jury Evaluation</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Scored on entry as written</p>
        </div>
        {evaluation.created_at && (
          <p className="text-xs text-gray-400">
            {new Date(evaluation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
        )
      })()}

      {/* AOY weight-aware jury (S75): per-section scores x section_weight.
          Replaces the fixed 6-dimension campaign grid for AOY entries. */}
      {(() => {
        const aoyOut = evaluation.output as unknown as {
          aoy?: boolean; pillar?: string; category_key?: string; weight_warning?: string | null;
          sections?: { key: string; label: string; weight: number; score: number; weighted_contribution: number; rationale: string; is_placeholder: boolean }[]
        } | null
        if (!aoyOut?.aoy) return null
        const secs = Array.isArray(aoyOut.sections) ? aoyOut.sections : []
        return (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-600">Weighted rubric: {aoyOut.category_key}</span>
              {aoyOut.pillar && <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">{aoyOut.pillar} pillar</span>}
            </div>
            {aoyOut.weight_warning && <p className="text-xs text-amber-600 mb-2">{aoyOut.weight_warning}</p>}
            {(() => {
              const maxWeight = secs.reduce((m, x) => Math.max(m, x.weight || 0), 1)
              return (
            <div className="space-y-2">
              {secs.map(s => {
                const sDelta = deltas?.[s.key]
                return (
                  <div key={s.key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label} <span className="text-gray-400 font-normal">{s.weight}% of score</span></p>
                      <div className="flex items-baseline gap-1.5 flex-shrink-0">
                        <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                        {sDelta !== undefined && sDelta !== 0 && (
                          <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5"><MeterBar fraction={(s.weight || 0) / maxWeight} /></div>
                    <p className="text-xs text-gray-400 mt-1 tabular-nums">Adds {s.weighted_contribution} to the weighted total{s.is_placeholder ? ' · section not written' : ''}</p>
                    {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                  </div>
                )
              })}
            </div>
              )
            })()}
          </div>
        )
      })()}

      {/* SMARTIES qualitative jury (S92): per-section scores
          plus a holistic overall. SMARTIES publishes no section
          weighting, so there is no weighted total. Replaces the
          fixed campaign grid for SMARTIES entries. */}
      {(() => {
        const smOut = evaluation.output as unknown as {
          smarties?: boolean; category?: string | null;
          sections?: { field_key: string; label: string; score: number; rationale: string; is_placeholder: boolean }[]
        } | null
        if (!smOut?.smarties) return null
        const secs = Array.isArray(smOut.sections) ? smOut.sections : []
        return (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-600">SMARTIES case study{smOut.category ? `: ${smOut.category}` : ''}</span>
              <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">holistic score, no published section weighting</span>
            </div>
            <div className="space-y-2">
              {secs.map(s => {
                const sDelta = deltas?.[s.field_key]
                return (
                  <div key={s.field_key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label}</p>
                      <div className="flex items-baseline gap-1.5 flex-shrink-0">
                        <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                        {sDelta !== undefined && sDelta !== 0 && (
                          <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                        )}
                      </div>
                    </div>
                    {s.is_placeholder && <p className="text-xs text-gray-400 mt-1">Section not written</p>}
                    {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Config jury (S98 Chunk 5): per-section breakdown from
          evaluate-entry-config, branching ONCE on scoring_mode.
          Weighted mirrors the AOY weighted panel (score x weight,
          weighted contribution, MeterBar); qualitative mirrors the
          SMARTIES panel (per-section 0-10, holistic overall shown
          in the header). This is the from-spec render that replaces
          per-show SMARTIES JSX. */}
      {(() => {
        const cfgOut = evaluation.output as unknown as {
          config?: boolean; scoring_mode?: 'weighted' | 'qualitative'
          category_key?: string | null; category?: string | null; weight_warning?: string | null
          sections?: { key?: string; field_key?: string; label: string; weight?: number; score: number; weighted_contribution?: number; rationale: string; is_placeholder: boolean }[]
        } | null
        if (!cfgOut?.config) return null
        const secs = Array.isArray(cfgOut.sections) ? cfgOut.sections : []
        const isWeighted = cfgOut.scoring_mode === 'weighted'
        const cat = cfgOut.category_key ?? cfgOut.category ?? null
        const maxWeight = isWeighted ? secs.reduce((m, x) => Math.max(m, x.weight || 0), 1) : 1
        return (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-600">{isWeighted ? 'Weighted rubric' : 'Case study'}{cat ? `: ${cat}` : ''}</span>
              <span className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{isWeighted ? 'config jury' : 'holistic score, no published section weighting'}</span>
            </div>
            {isWeighted && cfgOut.weight_warning && <p className="text-xs text-amber-600 mb-2">{cfgOut.weight_warning}</p>}
            <div className="space-y-2">
              {secs.map((s, i) => {
                const sKey = s.key ?? s.field_key ?? String(i)
                const sDelta = deltas?.[sKey]
                return (
                  <div key={sKey} className={`border rounded-lg px-3 py-2.5 ${scoreBg(s.score)}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-gray-700 font-medium min-w-0 flex-1">{s.label}{isWeighted && typeof s.weight === 'number' ? <span className="text-gray-400 font-normal"> {s.weight}% of score</span> : null}</p>
                      <div className="flex items-baseline gap-1.5 flex-shrink-0">
                        <p className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}<span className="text-xs text-gray-400">/10</span></p>
                        {sDelta !== undefined && sDelta !== 0 && (
                          <span className={`text-xs font-semibold tabular-nums ${sDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>{sDelta > 0 ? `↑+${sDelta}` : `↓${sDelta}`}</span>
                        )}
                      </div>
                    </div>
                    {isWeighted && <div className="mt-1.5"><MeterBar fraction={(s.weight || 0) / maxWeight} /></div>}
                    {isWeighted && typeof s.weighted_contribution === 'number' && <p className="text-xs text-gray-400 mt-1 tabular-nums">Adds {s.weighted_contribution} to the weighted total{s.is_placeholder ? ' · section not written' : ''}</p>}
                    {!isWeighted && s.is_placeholder && <p className="text-xs text-gray-400 mt-1">Section not written</p>}
                    {s.rationale && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.rationale}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* AOY market-context modifier (S85, Phase 3, Option B): page-owned slot —
          it needs the page's applyAoyMarket handler + per-direction state. The
          slot's builder owns its own AOY-judge gate and returns null otherwise. */}
      {marketContextSlot}

      {evaluation.evaluation_mode !== 'coach' && !((evaluation.output as unknown as { aoy?: boolean } | null)?.aoy) && !((evaluation.output as unknown as { smarties?: boolean } | null)?.smarties) && !((evaluation.output as unknown as { config?: boolean } | null)?.config) && (
      <div className="grid grid-cols-3 gap-2 mb-5">
        {SCORE_DIMENSIONS.map(dim => {
          const score = evaluation.scores?.[dim.key] ?? 0
          const delta = deltas?.[dim.key]
          return (
            <div key={dim.key} className={`border rounded-lg px-3 py-2.5 ${scoreBg(score)}`}>
              <p className="text-xs text-gray-500 mb-1">{dim.label}</p>
              <div className="flex items-baseline gap-1.5">
                <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</p>
                {delta !== undefined && delta !== 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {delta > 0 ? `↑+${delta}` : `↓${delta}`}
                  </span>
                )}
                {delta === 0 && (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </div>
          )
        })}
        {/* Brief Alignment — coach mode only */}
        {evaluation.scores?.brief_alignment !== undefined && (() => {
          const baScore = evaluation.scores?.brief_alignment ?? 0
          const baDelta = deltas?.['brief_alignment']
          return (
            <div className={`border-2 border-dashed rounded-lg px-3 py-2.5 ${scoreBg(baScore)}`}>
              <p className="text-xs text-gray-500 mb-1">Brief Alignment</p>
              <div className="flex items-baseline gap-1.5">
                <p className={`text-xl font-bold tabular-nums ${scoreColor(baScore)}`}>{baScore}</p>
                {baDelta !== undefined && baDelta !== 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${baDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {baDelta > 0 ? `↑+${baDelta}` : `↓${baDelta}`}
                  </span>
                )}
                {baDelta === 0 && (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </div>
          )
        })()}
      </div>
      )}

      {/* ── v3 output: mode-specific display ─────────────────────── */}
      {evaluation.output ? (
        <>
          {evaluation.evaluation_mode === 'judge' ? (
            /* ── Judge mode: talks_up / kills_it / recommendations ── */
            (() => {
              const o = evaluation.output as JudgeOutput
              return (
                <>
                  {/* What Jurors Will Talk Up */}
                  {o.talks_up && o.talks_up.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">What Jurors Will Talk Up</p>
                      <div className="space-y-2.5">
                        {o.talks_up.map((s, i) => (
                          <div key={i} className="bg-green-50 border-l-4 border-green-500 rounded-r-lg px-4 py-3">
                            <p className="text-sm text-gray-800 leading-relaxed italic">&ldquo;{s}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Where Jurors Will Kill Your Entry */}
                  {o.kills_it && o.kills_it.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Where Jurors Will Kill Your Entry</p>
                      <div className="space-y-2.5">
                        {o.kills_it.map((g, i) => (
                          <div key={i} className="bg-red-50 border-l-4 border-red-400 rounded-r-lg px-4 py-3">
                            <p className="text-sm text-gray-800 leading-relaxed italic">&ldquo;{g}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {o.recommendations && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Recommendations to Help Your Chances</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{o.recommendations}</p>
                    </div>
                  )}

                  {/* Campaign name note */}
                  {o.campaign_name_note && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">On the Campaign Name</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{o.campaign_name_note}</p>
                    </div>
                  )}

                  {/* Session 57: the Next Step card moved from here into the
                      "✦ Recommended Next Steps" tab on the eval view strip
                      (activeView === 'nextsteps'). Do not reintroduce it inline. */}
                </>
              )
            })()
          ) : (
            /* ── Coach mode: focus_point / priority_fixes / cuts ── */
            (() => {
              const o = evaluation.output as CoachOutput
              return (
                <>
                  {/* focus_point now renders as the coach headline in the header
                      block above (22 Jul 2026); not repeated here. */}

                  {/* Priority Fixes — lead the panel (the real payoff) */}
                  {o.priority_fixes && o.priority_fixes.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Priority Fixes — Biggest Impact First</p>
                      <div className="space-y-3">
                        {o.priority_fixes.map((pf, i) => (
                          <div key={i} className="border border-gray-200 rounded-xl p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-1.5">{i + 1}. {pf.fix}</p>
                            <p className="text-xs text-gray-600 mb-1"><span className="font-medium">Why: </span>{pf.why}</p>
                            <p className="text-xs text-green-700"><span className="font-medium">How: </span>{pf.action}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* What to Cut */}
                  {o.cuts && o.cuts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">What to Cut</p>
                      <ul className="space-y-2.5">
                        {o.cuts.map((c, i) => (
                          <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                            <span className="text-red-500 flex-shrink-0 mt-0.5">✗</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )
            })()
          )}
        </>
      ) : (
        /* ── Legacy display (v1/v2 evaluations — strengths/gaps/recommendations) ── */
        <>
          <div className="grid grid-cols-2 gap-5 mb-5">
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Strengths</p>
              <ul className="space-y-2.5">
                {(evaluation.strengths ?? []).map((s, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                    <span className="text-green-700 flex-shrink-0 mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Gaps</p>
              <ul className="space-y-2.5">
                {(evaluation.gaps ?? []).map((g, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
                    <span className="text-red-600 flex-shrink-0 mt-0.5">✗</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Recommendations</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{evaluation.recommendations}</p>
          </div>
        </>
      )}

      {/* Notable changes — shown when a changes_analysis is present (comparison re-evaluation) */}
      {evaluation.changes_analysis && (
        <div className="mt-5 pt-4 border-t border-gray-200">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Notable Changes</p>
          <p className="text-sm text-gray-700 leading-relaxed">{evaluation.changes_analysis}</p>
        </div>
      )}

      {/* Fix-this chips — user selects which issues to prioritise */}
      {fixChips && (() => {
        const chipItems = deriveFixChipItems(evaluation)
        if (chipItems.length === 0) return null
        const selected = fixChips.selected
        return (
          <div className="mt-5 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={fixChips.onToggleOpen}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 transition-colors"
            >
              Focus the next draft on…
              <span className="text-gray-400">{fixChips.open ? '▲' : '▼'}</span>
            </button>
            {fixChips.open && (<>
            <div className="flex flex-wrap gap-2">
              {chipItems.map((item, i) => {
                const active = selected.includes(item)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fixChips.onToggleItem(item)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors text-left ${
                      active
                        ? 'bg-green-800 text-white border-green-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-green-600 hover:text-green-700'
                    }`}
                  >
                    {active ? '✓ ' : ''}{item.length > 60 ? item.slice(0, 57) + '…' : item}
                  </button>
                )
              })}
            </div>
            {selected.length > 0 && (
              <p className="text-xs text-green-700 mt-2">{selected.length} issue{selected.length > 1 ? 's' : ''} selected — the draft will prioritise these above all others.</p>
            )}
            </>)}
          </div>
        )
      })()}

      {/* Generate Improved Draft — page-owned CTA slot (needs generateDraft + its state) */}
      {improveCtaSlot}
    </>
  )
}
