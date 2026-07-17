'use client'
/**
 * PlannerV3Result.tsx — Planner v3 Step 3, the recommendation-first output (V3-P3).
 * =============================================================================
 * Planner-v3-SPEC-campaign-driven-2026-07-16.md "Output (recommendation-first)".
 * Build session V3-P3 (output restructure, Opus). This REPLACES the V3-P2
 * minimal placeholder. It renders the PlannerV3Plan that derivePlanV3 (V3-P1)
 * returns and PlannerV3.tsx (V3-P2) holds in page state — it builds the VIEW
 * only, and changes neither the engine nor the input step.
 *
 * What this view is (spec Output section):
 *   - A per-show CRITICAL LINE: show name, tier, # entries, budget, categories,
 *     enter-by date, and ONE why line. Fee/rate detail sits behind a click. No
 *     card wall — rows with a divider, detail on expand.
 *   - Deadlines are FIRST-CLASS: the slate splits "enter this cycle" vs
 *     "next cycle" (cycle_status), and each group is ordered by closing date
 *     (final_date), soonest first — priority order respects closing dates.
 *   - Headline: "N recommended entries across M shows" (headline_recommended_
 *     count / headline_show_count — already computed by the engine).
 *   - Budget total labelled "entry fees only, at each show's standard rate";
 *     shows excluded for an unsourced fee are listed with the flag. A single
 *     per-show rate never launders into a false-precision total (the engine
 *     already excludes unsourced fees from budget_total_usd; this view says so).
 *   - The mix chart summarises the RECOMMENDATION (recommended entries by tier
 *     + reserve), not the universe. Dependency-free CSS stacked bar, inline
 *     styles (Tailwind purges arbitrary values, Gotchas).
 *   - One campaign fanning into several categories at one show renders as
 *     several entries (post-reduction) — shown in the per-show detail.
 *
 * Load-bearing honesty rules carried from the engine/spec:
 *   - Odds render ONLY through <GatedNumber/> off the entry's sourced rate_fact
 *     (lib/rate-facts.ts). Exactly ONE odds line per show — never the same
 *     fallback under two metric labels (the P2.1 duplicate-odds defect).
 *   - `win_likelihood` is rendered NOWHERE.
 *   - region-dropped and unresolved (unrecognized / out-of-scope) entries are
 *     SURFACED, never silently dropped.
 *   - The engine returns fees in USD; this view owns currency-aware display,
 *     converting through lib/fx.ts's ONE dated rate set and showing the FX date
 *     (a converted figure without its rate date is a future wrong number).
 *   - The zero-state teaser is kept from V3-P2 (refined, not rebuilt).
 * =============================================================================
 */

import Link from 'next/link'
import type { PlannerV3Plan, ShowBlock, PlacedEntry, PlannerV3Tier } from '@/lib/planner-v3-engine'
import type { CurrencyCode } from '@/lib/fx'
import { convert } from '@/lib/fx'
import { formatMoney } from '@/lib/planner-display'
import GatedNumber from '@/components/GatedNumber'

type Props = {
  plan: PlannerV3Plan
  /** The user's chosen display currency. The engine returns USD; this view converts. */
  displayCurrency: CurrencyCode
  /** Zero-state teaser (top market-eligible shows for the profile). */
  teaserShows: string[]
}

const TIER_LABEL: Record<PlannerV3Tier, string> = {
  core: 'Core',
  prestige: 'Prestige',
  specialist: 'Specialist',
  reserve: 'Reserve',
}

// Inline styles, NOT Tailwind classes: dynamic color utilities (bg-sky-100 /
// bg-emerald-100 / their text pairs) appear ONLY in this map, so Tailwind's
// scanner purges them and the badge renders with no background (confirmed live
// 17 Jul: sky/emerald absent from the served CSS, green present). Same posture
// as the mix bar. Green / violet / blue / gray are deliberately far apart so
// Core and Prestige never read as the same colour.
const TIER_BADGE: Record<PlannerV3Tier, { backgroundColor: string; color: string }> = {
  core: { backgroundColor: '#dcfce7', color: '#166534' },       // green-100 / green-800
  prestige: { backgroundColor: '#f7edcb', color: '#7c5e12' },   // pale gold / deep gold (app gold #c9a95c family)
  specialist: { backgroundColor: '#e0f2fe', color: '#075985' }, // sky-100 / sky-800
  reserve: { backgroundColor: '#f3f4f6', color: '#4b5563' },    // gray-100 / gray-600
}

// Mix-bar segment colors — INLINE styles only (Tailwind purges arbitrary
// values / dynamic classes here; same posture as the P2.1 mix bar).
const TIER_COLOR: Record<PlannerV3Tier, string> = {
  core: '#166534', // green-800
  prestige: '#c9a95c', // app gold (WelcomeRouter/GeneratingBar/direction-card); distinct from green/blue/gray
  specialist: '#0369a1', // sky-700
  reserve: '#9ca3af', // gray-400 (matches the gray badge; keeps the bar off three greens)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Format an ISO date (YYYY-MM-DD) as "12 Sep 2026", timezone-free. */
function formatDate(iso: string | null): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  if (mo < 1 || mo > 12) return iso
  return `${d} ${MONTHS[mo - 1]} ${m[1]}`
}

/**
 * Convert a USD figure into the display currency and return the formatted
 * string plus the FX date. USD passes through undated (it is the pivot).
 * convert() only throws for a currency with no dated rate; displayCurrency is
 * constrained to the FX_RATES set upstream, but this degrades to USD rather
 * than throwing into a render path.
 */
function toDisplay(usd: number, currency: CurrencyCode): { text: string; rateDate: string } {
  if (currency === 'USD') return { text: formatMoney(usd, 'USD'), rateDate: '' }
  try {
    const c = convert(usd, 'USD', currency)
    return { text: formatMoney(c.value, currency), rateDate: c.rate_date }
  } catch {
    return { text: formatMoney(usd, 'USD'), rateDate: '' }
  }
}

function pluralEntries(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`
}

/** Light suggestion for a common near-miss so the "couldn't match" note is actionable. */
function suggestShow(raw: string | null | undefined): string | null {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('agency of the year') && s.includes('campaign')) return 'Campaign Asia Agency of the Year'
  return null
}

function hasRecommended(s: ShowBlock): boolean {
  return s.entries.some(e => e.status === 'recommended')
}

/** Sort by closing date ascending; shows with no date sort last (stable). */
function byClosingDate(a: ShowBlock, b: ShowBlock): number {
  const ad = a.final_date
  const bd = b.final_date
  if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0
  if (ad && !bd) return -1
  if (!ad && bd) return 1
  return 0
}

/**
 * ONE honest why line per show. Built off the top-priority entry's campaign:
 * its entry readiness always carries its scored-show context (spec: never
 * "campaign quality", always "7.4 vs MMA Smarties APAC"). No invented number.
 */
function whyLine(s: ShowBlock): string {
  const rec = s.entries.filter(e => e.status === 'recommended')
  const pool = rec.length > 0 ? rec : s.entries
  const top = pool.slice().sort((a, b) => b.priority_score - a.priority_score)[0]
  if (!top) return ''
  const c = top.campaign
  if (c.entry_readiness <= 0) return `Led by ${c.campaign_name}: added manually, not yet scored.`
  const readiness = parseFloat(c.entry_readiness.toFixed(1))
  const ctx = c.scored_show ? ` vs ${c.scored_show}` : ''
  return `Led by ${c.campaign_name}: ${readiness} entry readiness${ctx}.`
}

// ── Zero-state teaser (kept from V3-P2, refined) ─────────────────────────────

function ZeroState({ teaserShows }: { teaserShows: string[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-bold text-gray-900">No campaigns selected yet</h2>
      <p className="text-sm text-gray-600 mt-2">
        Your recommendation is built from campaigns you have scored. Run a jury eval on a campaign to unlock it.
      </p>
      {teaserShows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shows open to you in your market</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {teaserShows.map(show => (
              <li key={show} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                {show}
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

// ── Mix chart — recommended entries by tier + reserve (the RECOMMENDATION) ────

function MixChart({ plan }: { plan: PlannerV3Plan }) {
  const tierRec: Record<PlannerV3Tier, number> = { core: 0, prestige: 0, specialist: 0, reserve: 0 }
  for (const s of plan.shows) {
    tierRec[s.tier] += s.entries.filter(e => e.status === 'recommended').length
  }
  const reserveCount = plan.shows.reduce((n, s) => n + s.entries.filter(e => e.status === 'reserve').length, 0)

  const segments = ([
    { key: 'core' as const, label: 'Core', count: tierRec.core },
    { key: 'prestige' as const, label: 'Prestige', count: tierRec.prestige },
    { key: 'specialist' as const, label: 'Specialist', count: tierRec.specialist },
    { key: 'reserve' as const, label: 'Reserve', count: reserveCount },
  ]).filter(s => s.count > 0)

  const total = segments.reduce((n, s) => n + s.count, 0)
  if (total === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-900">Your recommended mix</h2>
        <span className="text-xs text-gray-500">{pluralEntries(total)}</span>
      </div>
      <div className="flex w-full h-4 rounded-full overflow-hidden" role="img" aria-label="Recommended mix by tier">
        {segments.map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: TIER_COLOR[s.key] }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap mt-3" style={{ columnGap: '1.5rem', rowGap: '0.5rem' }}>
        {segments.map(s => (
          <span key={s.key} className="inline-flex items-center whitespace-nowrap text-xs text-gray-600">
            <span
              className="inline-block rounded-sm shrink-0"
              style={{ width: 10, height: 10, backgroundColor: TIER_COLOR[s.key], marginRight: 8 }}
            />
            <span style={{ marginRight: 6 }}>{s.label}</span>
            <span className="font-semibold tabular-nums text-gray-900">{s.count}</span>
          </span>
        ))}
      </div>
      {reserveCount > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          Reserve entries are ranked but sit beyond your current budget. They are held, never dropped.
        </p>
      )}
    </div>
  )
}

// ── One show row: critical line + fee/rate detail behind a click ─────────────

function ShowRow({ show, currency }: { show: ShowBlock; currency: CurrencyCode }) {
  const recEntries = show.entries.filter(e => e.status === 'recommended')
  const reserveEntries = show.entries.filter(e => e.status === 'reserve')
  const recCount = recEntries.length

  const recBudgetUsd = recEntries.reduce((sum, e) => sum + (e.fee_usd ?? 0), 0)
  const knownRec = recEntries.filter(e => e.fee_usd !== null)
  const budget = knownRec.length > 0 ? toDisplay(recBudgetUsd, currency) : null
  const anyEstimate = recEntries.some(e => e.fee_is_estimate)

  // Odds are a property of the show (all entries share the canonical show).
  const factEntry = show.entries[0]
  const shortlistFact = factEntry ? factEntry.shortlist_fact : null
  const winFact = factEntry ? factEntry.win_fact : null

  const enterBy = formatDate(show.final_date)
  const twoCol = { display: 'grid', gridTemplateColumns: '1fr auto', columnGap: '0.75rem' } as const

  return (
    <li className="py-3">
      {/* Header: show + tier + count | budget + deadline */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{show.show_name}</span>
            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={TIER_BADGE[show.tier]}>
              {TIER_LABEL[show.tier]}
            </span>
            <span className="text-[11px] text-gray-400">
              {pluralEntries(recCount)}{reserveEntries.length > 0 ? ` (+${reserveEntries.length} reserve)` : ''}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{whyLine(show)}</p>
        </div>
        <div className="flex-shrink-0 text-left sm:text-right">
          <p className="text-sm font-semibold text-gray-900">
            {budget ? budget.text : 'fee not published'}
            {anyEstimate && budget && <span className="text-[11px] font-normal text-gray-500"> est.</span>}
          </p>
          {enterBy ? (
            <p className="text-xs text-gray-500 mt-0.5">enter by {enterBy}</p>
          ) : (
            <p className="text-xs text-amber-700 mt-0.5">no open deadline</p>
          )}
        </div>
      </div>

      {/* Entries: each category listed ONCE, aligned fee column, always visible */}
      <ul className="mt-2 border-t border-gray-100 pt-1.5">
        {show.entries.map(e => {
          const fee = e.fee_usd !== null ? toDisplay(e.fee_usd, currency) : null
          const reserve = e.status === 'reserve'
          return (
            <li key={e.direction_id} className="py-1 text-xs" style={twoCol}>
              <span className="min-w-0">
                <span className={reserve ? 'text-gray-400' : 'text-gray-800'}>{e.category ?? 'Category not set'}</span>
                {e.categoryFlag === 'drift' && <span className="text-gray-400"> &middot; not on this show&apos;s list</span>}
                {reserve && <span className="text-gray-400"> &middot; reserve</span>}
                <span className="block text-[11px] text-gray-400">{e.campaign.campaign_name}</span>
              </span>
              <span className={`text-right tabular-nums ${reserve ? 'text-gray-400' : 'text-gray-600'}`}>
                {fee ? fee.text : 'not published'}
                {e.fee_is_estimate && fee && <span className="text-gray-400"> est.</span>}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Published odds: two labelled figures, always visible */}
      <div
        className="mt-2 text-xs"
        style={{ display: 'flex', flexWrap: 'wrap', columnGap: '1.25rem', rowGap: '0.125rem', alignItems: 'baseline' }}
      >
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Published odds</span>
        <span className="flex items-baseline gap-1.5"><span className="text-gray-500">Shortlist</span><GatedNumber fact={shortlistFact} /></span>
        <span className="flex items-baseline gap-1.5"><span className="text-gray-500">Win</span><GatedNumber fact={winFact} /></span>
      </div>

      {anyEstimate && (
        <p className="text-[11px] text-gray-400 mt-1">
          Fees marked est. use the family&apos;s published rate as a sourced upper bound, never an invented discount.
        </p>
      )}
      {(shortlistFact ?? winFact)?.source_url && (
        <p className="text-[11px] text-gray-400 mt-0.5 break-words">Rate source: {(shortlistFact ?? winFact)!.source_url}</p>
      )}
    </li>
  )
}

// ── A titled group of show rows ──────────────────────────────────────────────

function ShowGroup({
  title,
  blurb,
  shows,
  currency,
}: {
  title: string
  blurb?: string
  shows: ShowBlock[]
  currency: CurrencyCode
}) {
  if (shows.length === 0) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">
          {shows.length} show{shows.length === 1 ? '' : 's'}
        </span>
      </div>
      {blurb && <p className="text-xs text-gray-500 mt-0.5">{blurb}</p>}
      <ul className="divide-y divide-gray-100 mt-2">
        {shows.map(s => (
          <ShowRow key={s.show_name} show={s} currency={currency} />
        ))}
      </ul>
    </div>
  )
}

// ── The recommendation-first result ──────────────────────────────────────────

export default function PlannerV3Result({ plan, displayCurrency, teaserShows }: Props) {
  if (plan.zero_state) return <ZeroState teaserShows={teaserShows} />

  const recommendedShows = plan.shows.filter(hasRecommended)
  const reserveOnlyShows = plan.shows.filter(s => !hasRecommended(s))

  // Deadlines first-class: split the recommended slate this-cycle vs next-cycle,
  // and order each by closing date (soonest first). unknown_cycle (no deadline
  // row) rides with this cycle; it simply carries "deadline not on file".
  // A show with a real closing date this cycle vs. one whose cycle dates are not
  // published yet (final_date null). Never present a show with no open deadline as
  // "enter this cycle" (e.g. Spikes Asia: 2026 closed, 2027 not announced).
  const thisCycle = recommendedShows.filter(s => s.cycle_status !== 'next_cycle' && s.final_date).slice().sort(byClosingDate)
  const nextCycle = recommendedShows.filter(s => s.cycle_status === 'next_cycle').slice().sort(byClosingDate)
  const datesUnconfirmed = recommendedShows.filter(s => s.cycle_status !== 'next_cycle' && !s.final_date)

  const total = toDisplay(plan.budget_total_usd, displayCurrency)
  const anyEstimateAcrossPlan = plan.shows.some(s => s.entries.some(e => e.fee_is_estimate && e.status === 'recommended'))

  return (
    <div className="space-y-4">
      {/* Headline + budget */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-lg font-bold text-gray-900">
          {plan.headline_recommended_count} recommended {plan.headline_recommended_count === 1 ? 'entry' : 'entries'}{' '}
          across {plan.headline_show_count} show{plan.headline_show_count === 1 ? '' : 's'}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Entry fees only, at each show&apos;s standard rate:{' '}
          <span className="font-semibold text-gray-900">{total.text}</span>
          {displayCurrency !== 'USD' && total.rateDate && (
            <span className="text-gray-400"> ({displayCurrency}, FX {total.rateDate})</span>
          )}
          .
        </p>
        {plan.budget_excluded_shows.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Not in the total, fee not published: {plan.budget_excluded_shows.join(', ')}. A show without a sourced fee
            is never given an invented one.
          </p>
        )}
        {anyEstimateAcrossPlan && (
          <p className="text-xs text-gray-500 mt-1">
            The total includes upper-bound fee estimates where a country program publishes no separate rate. Those
            lines are marked est.
          </p>
        )}
      </div>

      <MixChart plan={plan} />

      <ShowGroup
        title="Enter this cycle"
        blurb="Ordered by closing date, soonest first."
        shows={thisCycle}
        currency={displayCurrency}
      />

      <ShowGroup
        title="Next cycle"
        blurb="This cycle has closed. Plan these for the next opening."
        shows={nextCycle}
        currency={displayCurrency}
      />

      <ShowGroup
        title="Dates not yet confirmed"
        blurb="Recommended, but this show has no open deadline yet (its next cycle is not announced). Plan for it, then confirm the date before entering."
        shows={datesUnconfirmed}
        currency={displayCurrency}
      />

      <ShowGroup
        title="Beyond this budget"
        blurb="Ranked and ready, held as reserve. Raise the budget to bring them in."
        shows={reserveOnlyShows}
        currency={displayCurrency}
      />

      {/* Region-dropped — surfaced, never silently dropped */}
      {plan.region_dropped.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-bold text-gray-900 mb-1">Not open in your market</p>
          <p className="text-xs text-gray-500">
            {plan.region_dropped.length} {plan.region_dropped.length === 1 ? 'entry is' : 'entries are'} outside your
            selected market and left out of the plan. Change your market on the previous step to include them.
          </p>
          <ul className="text-xs text-gray-600 mt-2 space-y-0.5">
            {plan.region_dropped.map(e => (
              <li key={`rd-${e.direction_id}`}>
                {e.campaign.campaign_name}: {e.resolution.canonicalShow}
                {e.category ? ` · ${e.category}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unresolved — unrecognized / out-of-scope, surfaced with the raw name */}
      {plan.unresolved.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-bold text-gray-900">Couldn&apos;t match to a show we cover</p>
          <p className="text-xs text-gray-500 mt-0.5">
            These campaigns name a target show we don&apos;t recognise, so they are left out of the plan. Set the
            show on the campaign to one we cover to include it.
          </p>
          <ul className="text-xs text-gray-600 mt-2 space-y-1">
            {plan.unresolved.map((u, i) => {
              const suggestion = suggestShow(u.rawShowName)
              return (
                <li key={`${u.campaign.project_id}-${u.rawShowName}-${i}`}>
                  <span className="text-gray-700">{u.campaign.campaign_name}</span>
                  <span className="text-gray-500"> names &ldquo;{u.rawShowName}&rdquo;.</span>
                  {suggestion && <span className="text-gray-500"> Did you mean {suggestion}?</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
