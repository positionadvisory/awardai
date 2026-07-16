'use client'
/**
 * AxisBadge.tsx — a small colored chip naming a work show's reputation axis.
 * =============================================================================
 * Planner-v2-SPEC-2026-07.md — "Each recommended show gets a rationale line and
 * an axis tag." Build session P2. Presentational only; no data, no logic beyond
 * mapping an axis to its label + color. Inline styles for the accent colors
 * (Gotchas: Tailwind purges arbitrary color values used dynamically).
 * =============================================================================
 */

import type { PlannerAxis } from '@/lib/planner-facets'
import { AXIS_LABEL } from '@/lib/planner-display'

const AXIS_COLORS: Record<PlannerAxis, { bg: string; fg: string }> = {
  effectiveness: { bg: '#ecfdf5', fg: '#065f46' },
  craft: { bg: '#eff6ff', fg: '#1e40af' },
  creative_fame: { bg: '#fef3c7', fg: '#92400e' },
  specialist: { bg: '#f5f3ff', fg: '#5b21b6' },
}

export default function AxisBadge({ axis, className }: { axis: PlannerAxis; className?: string }) {
  const c = AXIS_COLORS[axis]
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '2px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {AXIS_LABEL[axis]}
    </span>
  )
}
