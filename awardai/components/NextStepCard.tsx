'use client'

// ─── NextStepCard (Build 2, Session 55 → Session 57 rework) ─────────────────
// Session 55: rendered inline at the end of judge evaluation results.
// Session 57 (Ben's review): relocated into the "✦ Recommended Next Steps"
// tab on the evaluation panel tab strip, and made STATE-AWARE — the card is
// now a recommendation ladder, not just a placement list:
//
//   1. Coach run only (no jury eval)  → nudge to run the Jury Evaluation
//      (placements and score framing need a judge score to exist).
//   2. Jury run, Coach never run      → score framing + "you have run the
//      Jury Evaluation N times, Coach Review shows the potential you are
//      leaving on the table" + run-coach CTA, then placements.
//   3. Both modes run                 → score framing + "have you considered
//      alternative categories?" + placements + Generate Alt Categories CTA
//      (wired by the page to the same generateSmartDirections call as the
//      header button, so the button and the nudge are ONE system).
//
// Rules (binding, from the v3 brief — unchanged by the rework):
// - This card is PRODUCT OUTPUT, not guidance. It does NOT respect the
//   guidance toggle. Never gate it on guidance_enabled.
// - opportunities === null means the eval lacks next_opportunities
//   (pre-Build-2 evals). Session 57: the card no longer renders nothing in
//   that case (it is now an explicitly opened tab) — it renders the ladder
//   and simply omits the placements section. An EMPTY array is still valid
//   ("no stronger placements") and says so.
// - No data access of its own (A-08 discipline) — everything via props.
// - No hover-dependent content; tap targets ≥ 44px. No em-dashes in copy.
// - Score framing follows the evaluate-entry calibration anchors:
//   8+ contention / 6–7.9 in contention not comfortable / <6 wrong home.

import { useEffect, useRef } from 'react'

export type NextStepOpportunity = {
  show: string
  category: string
  rationale: string
  // Set by the page when a direction already exists for this show
  // (deep-link CTA instead of generate CTA)
  existingDirectionId?: number | null
}

// An already-generated direction that ranks a stronger placement
export type NextStepDirectionRef = {
  id: number
  name: string
  show: string | null
  category: string | null
  fit: number | null // win_likelihood column = Category Fit (0–100)
}

export type NextStepAction =
  | { type: 'view_directions' }
  | { type: 'generate_directions' }
  | { type: 'run_coach' }
  | { type: 'run_jury' }
  | { type: 'alt_categories' }
  | { type: 'view_direction'; directionId: number; source: 'opportunity' | 'existing'; show?: string; category?: string }

type NextStepCardProps = {
  // null = next_opportunities absent on the active judge eval → placements
  // section omitted (the rest of the ladder still renders)
  opportunities: NextStepOpportunity[] | null
  evaluatedShow: string
  // Active judge eval score; null when no judge eval exists (coach-only state)
  overallScore: number | null
  // Total judge evals run for this direction (active + history)
  judgeRunCount: number
  hasJudge: boolean
  hasCoach: boolean
  // true when the project has at least one generated (non-quick-eval) direction
  hasDirections: boolean
  // Strongest existing directions by category fit (page filters to those
  // ranking HIGHER than the evaluated placement; may be empty)
  strongerDirections: NextStepDirectionRef[]
  // Spinner state for the Alt Categories CTA (page's smartDirectionsLoading)
  altCategoriesLoading?: boolean
  // Disables run/generate CTAs while an eval or draft is in flight
  actionsDisabled?: boolean
  // Fired once per mount (page logs nextstep_shown)
  onShown: (opportunityCount: number) => void
  // Fired on any CTA (page logs nextstep_clicked + acts)
  onAction: (action: NextStepAction) => void
}

const TAP_TARGET = { minHeight: '44px' } as const

// Calibration-anchored score framing (judge score only — never coach)
function scoreSentence(score: number | null, show: string): string | null {
  if (score === null) return null
  const showName = show || 'this show'
  const s = score.toFixed(1)
  if (score >= 8) {
    return `This entry scored ${s} against the ${showName} jury standard. It is in genuine contention there.`
  }
  if (score >= 6) {
    return `This entry scored ${s} against the ${showName} jury standard. That is in contention, but not a comfortable position.`
  }
  return `This entry scored ${s} against the ${showName} jury standard. At that level, ${showName} is unlikely to be the right home for this work as written.`
}

export default function NextStepCard({
  opportunities,
  evaluatedShow,
  overallScore,
  judgeRunCount,
  hasJudge,
  hasCoach,
  hasDirections,
  strongerDirections,
  altCategoriesLoading,
  actionsDisabled,
  onShown,
  onAction,
}: NextStepCardProps) {
  const shownRef = useRef(false)

  useEffect(() => {
    if (shownRef.current) return
    shownRef.current = true
    onShown(opportunities?.length ?? 0)
    // Fire-once per mount by design; onShown identity changes are irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasOpportunities = Array.isArray(opportunities) && opportunities.length > 0
  const hasStronger = strongerDirections.length > 0
  const framing = scoreSentence(overallScore, evaluatedShow)
  const runsLabel = judgeRunCount <= 1 ? 'once' : `${judgeRunCount} times`

  // ── State 1: coach only — placements need a judge score first ─────────────
  if (!hasJudge) {
    return (
      <div className="rounded-xl border-2 border-green-700 bg-green-50 p-4 sm:p-5">
        <div
          className="text-green-800 mb-2"
          style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '1.55rem', lineHeight: 1.15, letterSpacing: '-0.01em' }}
        >
          ✦ What should I do next with this campaign?
        </div>
        <p className="text-sm text-gray-800 mb-4 leading-relaxed">
          Coach Review shows what this entry is leaving on the table. The Jury Evaluation scores it the way
          a jury would see it, and unlocks placement recommendations for this campaign.
        </p>
        <button
          type="button"
          onClick={() => onAction({ type: 'run_jury' })}
          disabled={actionsDisabled}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md"
          style={TAP_TARGET}
        >
          ⚖ Run the Jury Evaluation
        </button>
      </div>
    )
  }

  // ── States 2 + 3: judge run — framing, ladder step, placements, CTA ───────
  return (
    <div className="rounded-xl border-2 border-green-700 bg-green-50 p-4 sm:p-5">
      <div
        className="text-green-800 mb-2"
        style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif', fontSize: '1.55rem', lineHeight: 1.15, letterSpacing: '-0.01em' }}
      >
        ✦ What should I do next with this campaign?
      </div>

      {framing && (
        <p className="text-sm text-gray-800 mb-3 leading-relaxed">{framing}</p>
      )}

      {/* Ladder step — the single highest-value next action */}
      {!hasCoach ? (
        <div className="bg-white border border-green-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-gray-800 leading-relaxed mb-2">
            You have run the Jury Evaluation {runsLabel}. Coach Review reads the campaign brief and
            materials behind this entry and shows the potential it is leaving on the table.
          </p>
          <button
            type="button"
            onClick={() => onAction({ type: 'run_coach' })}
            disabled={actionsDisabled}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md"
            style={TAP_TARGET}
          >
            ✦ Run Coach Review
          </button>
        </div>
      ) : (
        <div className="bg-white border border-green-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-gray-800 leading-relaxed mb-2">
            You have run both the jury and coach lenses on this entry. The next gain is placement:
            have you considered alternative categories?
          </p>
          <button
            type="button"
            onClick={() => onAction({ type: 'alt_categories' })}
            disabled={actionsDisabled || altCategoriesLoading}
            className="px-4 py-2 text-green-700 hover:text-green-600 border border-green-300 hover:border-green-500 bg-white disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium rounded-md transition-colors"
            style={TAP_TARGET}
          >
            {altCategoriesLoading ? 'Finding alternative categories…' : '✦ Generate Alt Categories'}
          </button>
        </div>
      )}

      {/* Placements from the evaluation (absent on pre-Build-2 evals) */}
      {hasOpportunities && (
        <>
          <p className="text-sm text-gray-800 mb-3 leading-relaxed">
            Based on the entry as written, the work shows stronger signals elsewhere:
          </p>
          <ul className="space-y-3 mb-4">
            {(opportunities as NextStepOpportunity[]).map((opp, i) => (
              <li key={`${opp.show}-${opp.category}-${i}`} className="bg-white border border-green-200 rounded-lg px-4 py-3">
                <span className="text-sm font-semibold text-gray-900">
                  {opp.show}
                  {opp.category ? ` · ${opp.category}.` : '.'}
                </span>
                {opp.rationale ? (
                  <span className="text-sm text-gray-700"> {opp.rationale}</span>
                ) : null}
                {opp.existingDirectionId ? (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        onAction({
                          type: 'view_direction',
                          directionId: opp.existingDirectionId as number,
                          source: 'opportunity',
                          show: opp.show,
                          category: opp.category,
                        })
                      }
                      className="text-sm text-green-700 hover:text-green-600 font-medium underline-offset-2 hover:underline"
                      style={TAP_TARGET}
                    >
                      You already have a direction for this show. View it →
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {Array.isArray(opportunities) && opportunities.length === 0 && (
        <p className="text-sm text-gray-700 mb-4 leading-relaxed">
          No stronger placements surfaced from this evaluation. Most entries still have more than one
          viable home. Directions maps them for this campaign.
        </p>
      )}

      {/* Existing directions that rank stronger placements (Ben, Session 55:
          point users back to what fit higher before they chase new ground) */}
      {hasStronger && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Already mapped in your Directions
          </p>
          <p className="text-sm text-gray-800 mb-2 leading-relaxed">
            Your generated directions ranked {strongerDirections.length > 1 ? 'these placements' : 'this placement'} higher on category fit:
          </p>
          <ul className="space-y-2">
            {strongerDirections.map(dir => (
              <li key={dir.id}>
                <button
                  type="button"
                  onClick={() =>
                    onAction({
                      type: 'view_direction',
                      directionId: dir.id,
                      source: 'existing',
                      show: dir.show ?? undefined,
                      category: dir.category ?? undefined,
                    })
                  }
                  className="w-full text-left bg-white border border-green-200 hover:border-green-500 rounded-lg px-4 py-3 transition-colors"
                  style={TAP_TARGET}
                >
                  <span className="text-sm font-semibold text-gray-900">{dir.name}</span>
                  <span className="text-sm text-gray-600">
                    {dir.show ? ` · ${dir.show}` : ''}
                    {dir.category ? ` · ${dir.category}` : ''}
                  </span>
                  {typeof dir.fit === 'number' && (
                    <span className={`text-sm font-semibold tabular-nums ml-2 ${dir.fit >= 70 ? 'text-green-700' : dir.fit >= 45 ? 'text-amber-700' : 'text-red-600'}`}>
                      {dir.fit}% fit
                    </span>
                  )}
                  <span className="text-sm text-green-700 font-medium"> · View →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {hasDirections ? (
          <button
            type="button"
            onClick={() => onAction({ type: 'view_directions' })}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white text-sm font-medium rounded-md"
            style={TAP_TARGET}
          >
            See your Entry Directions →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction({ type: 'generate_directions' })}
            disabled={actionsDisabled}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md"
            style={TAP_TARGET}
          >
            Generate directions for this campaign
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Placement suggestions are based on the entry as written, not your campaign brief.
        {hasDirections ? ' Your existing directions were mapped from the campaign itself.' : ''}
      </p>
    </div>
  )
}
