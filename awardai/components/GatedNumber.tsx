'use client'
/**
 * GatedNumber.tsx — renders a rate as a number ONLY when it is publishable,
 * otherwise a qualitative phrase plus a "why no number" tooltip.
 * =============================================================================
 * Win-rate reconciliation, Phase 2 (WinRate-Reconciliation-PLAN-2026-07.md §5;
 * Planner-v2-SPEC-2026-07.md Part 2). This is the SINGLE UI enforcement point for
 * the publish gate, and the same component the Portfolio Planner v2 build consumes
 * (built once here). It reads the gate from lib/rate-facts.ts — it never decides
 * publishability itself.
 *
 * Honesty is the surfaced feature, not a hidden limitation: when a show publishes
 * no rate, we say so, and never invent a number.
 * =============================================================================
 */

import type { RateFact } from '@/lib/rate-facts'
import { mayDisplayNumber, rateFactLabel } from '@/lib/rate-facts'

type Props = {
  /** The single best fact for this show + metric (from getRateFact), or null. */
  fact: RateFact | null
  /**
   * Qualitative phrase to show when no number may render, e.g.
   * "structurally harder for a boutique" or "strong indie odds".
   */
  qualitative?: string
  /** Optional caption under the value, e.g. "win rate" / "shortlist rate". */
  caption?: string
  className?: string
}

/** Format a percentage value, trimming trailing zeros: 3.00 → "3", 7.30 → "7.3". */
function formatPct(value: number): string {
  return `${parseFloat(value.toFixed(2))}%`
}

/** The honest reason no number is shown, for the tooltip. */
function whyNoNumber(fact: RateFact | null): string {
  if (!fact) return 'No published rate for this show. We don\'t invent one.'
  if (fact.grade === 'NONE_PUBLISHED') {
    return 'This show does not publish a rate. We don\'t invent one.'
  }
  if (fact.grade === 'ESTIMATE') {
    return 'Only an internal estimate exists for this show. We don\'t show it as a rate.'
  }
  if (fact.grade === 'THIRD_PARTY') {
    return 'Only an unofficial third-party figure exists, with no attribution to stand behind. We don\'t show it as a rate.'
  }
  return 'No sourced rate for this show. We don\'t invent one.'
}

export default function GatedNumber({ fact, qualitative, caption, className }: Props) {
  if (mayDisplayNumber(fact) && fact && fact.value !== null) {
    const label = rateFactLabel(fact)
    return (
      <span className={className}>
        <span className="font-semibold tabular-nums">{formatPct(fact.value)}</span>
        {label && <span className="text-gray-400 text-xs ml-1">({label})</span>}
        {caption && <span className="block text-gray-400 text-xs">{caption}</span>}
      </span>
    )
  }

  // No publishable number: qualitative phrase + a "why no number" tooltip.
  const reason = whyNoNumber(fact)
  return (
    <span className={className}>
      <span className="text-gray-600">{qualitative || 'No published rate'}</span>
      <span
        className="ml-1 text-gray-400 cursor-help border-b border-dotted border-gray-300"
        title={reason}
        aria-label={reason}
      >
        &#9432;
      </span>
      {caption && <span className="block text-gray-400 text-xs">{caption}</span>}
    </span>
  )
}
