'use client'
/**
 * PlannerV3Result.tsx — Planner v3 Step 3, MINIMAL placeholder result.
 * =============================================================================
 * V3-P2 scope note: this view exists ONLY to prove the input step wires into
 * derivePlanV3 end-to-end. The recommendation-first output layout (deadlines
 * first-class, this-cycle/next-cycle split, mix chart, per-show critical line,
 * fee detail behind a click) is V3-P3 — deliberately NOT attempted here. This
 * renders the PlannerV3Plan fields plainly so the wiring is verifiable, nothing
 * more.
 *
 * Budgets from the engine are USD (derivePlanV3 returns budget_total_usd /
 * budget_usd); currency-aware output is a P3 concern. Labelled honestly.
 * =============================================================================
 */

import Link from 'next/link'
import type { PlannerV3Plan } from '@/lib/planner-v3-engine'
import { formatMoney } from '@/lib/planner-display'

type Props = {
  plan: PlannerV3Plan
  /** Zero-state teaser shows (top market-eligible shows for the profile). */
  teaserShows: string[]
}

const TIER_LABEL: Record<string, string> = {
  core: 'Core',
  prestige: 'Prestige',
  specialist: 'Specialist',
  reserve: 'Reserve',
}

function ZeroState({ teaserShows }: { teaserShows: string[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-bold text-gray-900">No campaigns selected yet</h2>
      <p className="text-sm text-gray-600 mt-2">
        Your recommendation is built from campaigns you have scored. Run a jury eval on a campaign to unlock it.
      </p>
      {teaserShows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Shows open to you in your market
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {teaserShows.map(s => (
              <li
                key={s}
                className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link
        href="/projects"
        className="inline-block mt-5 text-sm bg-green-800 hover:bg-green-700 text-white rounded-lg px-4 py-2"
      >
        Run a jury eval to unlock your recommendation
      </Link>
    </div>
  )
}

export default function PlannerV3Result({ plan, teaserShows }: Props) {
  if (plan.zero_state) return <ZeroState teaserShows={teaserShows} />

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-lg font-bold text-gray-900">
          {plan.headline_recommended_count} recommended entr
          {plan.headline_recommended_count === 1 ? 'y' : 'ies'} across {plan.headline_show_count} show
          {plan.headline_show_count === 1 ? '' : 's'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Entry fees only, at each show&apos;s standard rate:{' '}
          <span className="font-semibold text-gray-700">{formatMoney(plan.budget_total_usd, 'USD')}</span> (USD).
        </p>
        <p className="text-[11px] text-amber-700 mt-2">
          Placeholder layout. The full recommendation view (deadlines, per-show detail, mix) ships in V3-P3.
        </p>
      </div>

      {plan.shows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Shows</h3>
          <ul className="divide-y divide-gray-100">
            {plan.shows.map(s => {
              const recommended = s.entries.filter(e => e.status === 'recommended').length
              const reserve = s.entries.filter(e => e.status === 'reserve').length
              return (
                <li key={s.show_name} className="py-2 flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-gray-900">{s.show_name}</span>
                    <span className="ml-2 text-xs text-gray-400">{TIER_LABEL[s.tier] ?? s.tier}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {recommended} recommended{reserve > 0 ? `, ${reserve} reserve` : ''}
                      {s.final_date ? ` · enter by ${s.final_date}` : ''}
                      {s.cycle_status ? ` · ${s.cycle_status}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-gray-600 flex-shrink-0 text-right">
                    {s.budget_usd !== null ? formatMoney(s.budget_usd, 'USD') : 'fee not published'}
                  </span>
                </li>
              )
            })}
          </ul>
          {plan.budget_excluded_shows.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Excluded from the budget total (fee not published): {plan.budget_excluded_shows.join(', ')}.
            </p>
          )}
        </div>
      )}

      {plan.region_dropped.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">
            {plan.region_dropped.length} entr{plan.region_dropped.length === 1 ? 'y' : 'ies'} dropped: not open in your
            market.
          </p>
        </div>
      )}

      {plan.unresolved.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1">Unrecognized or out-of-scope shows</p>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {plan.unresolved.map((u, i) => (
              <li key={`${u.campaign.project_id}-${u.rawShowName}-${i}`}>
                {u.campaign.campaign_name}: &ldquo;{u.rawShowName}&rdquo; ({u.reason.replace('_', ' ')})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
