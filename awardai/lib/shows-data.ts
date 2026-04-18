/**
 * shows-data.ts — Shortlist Master Shows Database
 * =============================================================================
 * All award show deadlines, win rates, and entry fees.
 *
 * ⚠️  UPDATE WEEKLY: Review `finalDate` values each week during awards season.
 *     All dates are approximate — always verify at official show websites.
 *
 * Future migration path: Supabase `shows` table → admin-editable in /admin dashboard.
 * When migrating, these constants become the seed data for that table.
 *
 * Last updated: April 2026
 * =============================================================================
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ShowDeadline = {
  show: string
  region: 'Global' | 'APAC' | 'China'
  finalDate: string       // ISO date string: submission deadline (hard cutoff)
  juryDate: string        // ISO date string: jury convenes / results begin
  ceremonyDate: string    // ISO date string: awards ceremony / winners announced
  earlyBird: string       // Human-readable e.g. "Jan 2026"
  standard: string
  final: string
  ceremony: string
  prValue: number         // Prestige score 0–100 (for sorting/weighting)
  note: string            // Practical notes for the entry team
}

export type WinRateData = {
  shortlist: number       // % of entries receiving a shortlist
  metal: number           // % of entries winning any metal
  gold: number            // % of entries winning gold equivalent
  grandprix: number       // % of entries winning Grand Prix / top prize
  pr: {
    shortlist: number     // Estimated earned media value (USD) at shortlist level
    metal: number
    gold: number
    grandprix: number
  }
  fee: number             // Canonical entry fee used in ROI calculations (USD)
}

export type EntryFeeData = {
  base: number
  range: string
  note: string
}

export type UrgencyLevel = 'critical' | 'tight' | 'prepare' | 'ok' | 'past'

export type DeadlineUrgency = {
  level: UrgencyLevel
  daysLeft: number | null
  deadlineDate: string | null
  message: string
}

export type PrepPhase = {
  label: string
  dStart: number  // Days before deadline (negative)
  dEnd: number    // Days before deadline (negative, 0 = deadline day)
}

// ── Urgency thresholds ────────────────────────────────────────────────────────
// Based on minimum realistic timelines:
//   Video production alone:  ≥ 14 days
//   Entry writing alone:     ≥ 14 days
//   Entry + video combined:  ≥ 35 days comfortable minimum
//   Full prep (56d window):  comfortable for quality submissions

export const URGENCY_THRESHOLDS = {
  CRITICAL: 14,   // ≤14 days: too tight for entry + video — flag in red
  TIGHT: 35,      // 15–35 days: possible but very rushed — flag in amber
  PREPARE: 56,    // 36–56 days: beginning of prep window — nudge in blue
} as const

// ── PREP_PHASES ───────────────────────────────────────────────────────────────
// Internal preparation workflow timeline, expressed as day offsets relative
// to the submission deadline (negative = days before deadline).

export const PREP_PHASES: PrepPhase[] = [
  { label: 'Shortlisting', dStart: -56, dEnd: -42 },
  { label: 'Selection',    dStart: -42, dEnd: -35 },
  { label: 'Writing',      dStart: -35, dEnd: -21 },
  { label: 'Production',   dStart: -21, dEnd: -7  },
  { label: 'Polish',       dStart: -7,  dEnd: 0   },
]

// ── DEADLINES_2026 ────────────────────────────────────────────────────────────
// ⚠️  Dates are approximate based on historical cycles.
//     Always verify at official show websites before submitting.

export const DEADLINES_2026: ShowDeadline[] = [
  {
    show: 'Clio Awards', region: 'Global',
    finalDate: '2026-02-28', juryDate: '2026-03-21', ceremonyDate: '2026-04-10',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '28 Feb 2026', ceremony: 'Apr 2026',
    prValue: 35, note: 'Multiple entry rounds. Early bird savings significant.',
  },
  {
    show: 'Cristal Festival', region: 'Global',
    finalDate: '2025-12-05', juryDate: '2025-12-10', ceremonyDate: '2025-12-12',
    earlyBird: 'Oct 2025', standard: 'Nov 2025', final: '5 Dec 2025', ceremony: 'Dec 2025',
    prValue: 25, note: 'Premium/luxury sector focus. Verify 2026 cycle dates.',
  },
  {
    show: 'Festival of Media APAC', region: 'APAC',
    finalDate: '2026-03-20', juryDate: '2026-04-03', ceremonyDate: '2026-04-24',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '20 Mar 2026', ceremony: 'Apr 2026',
    prValue: 30, note: 'Media-specialist judging. Accessibility and scale rewarded.',
  },
  {
    show: 'D&AD', region: 'Global',
    finalDate: '2026-03-27', juryDate: '2026-04-24', ceremonyDate: '2026-05-14',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '27 Mar 2026', ceremony: 'May 2026',
    prValue: 50, note: 'Pencil levels: Wood / Graphite / Yellow. Widely regarded as hardest to win.',
  },
  {
    show: 'One Show', region: 'Global',
    finalDate: '2026-03-31', juryDate: '2026-04-21', ceremonyDate: '2026-05-07',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '31 Mar 2026', ceremony: 'May 2026',
    prValue: 45, note: 'Annual — entry windows typically Jan–Mar.',
  },
  {
    show: 'Cannes Lions', region: 'Global',
    finalDate: '2026-04-09', juryDate: '2026-06-15', ceremonyDate: '2026-06-22',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '9 Apr 2026', ceremony: 'Jun 2026',
    prValue: 80, note: '$1,200–$1,800/entry. Budget 3–4 entries minimum for a meaningful shot. 2026 deadline was 9 April.',
  },
  {
    show: 'Effie APAC', region: 'APAC',
    finalDate: '2026-03-09', juryDate: '2026-04-01', ceremonyDate: '2026-09-12',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '9 Mar 2026', ceremony: 'Sep 2026',
    prValue: 40, note: 'Most rigorous data requirements of any show. Allow 4–6 weeks for entry writing. 2026 last-chance deadline was 9 March; Gala September 2026.',
  },
  {
    show: 'Women Leading Change', region: 'APAC',
    finalDate: '2026-05-08', juryDate: '2026-06-05', ceremonyDate: '2026-06-19',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '8 May 2026', ceremony: 'Jun 2026',
    prValue: 30, note: 'Campaign Asia. Individual and company categories.',
  },
  {
    show: 'ROI Festival', region: 'Global',
    finalDate: '2026-05-15', juryDate: '2026-06-12', ceremonyDate: '2026-06-19',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '15 May 2026', ceremony: 'Jun 2026',
    prValue: 25, note: 'Data transparency rewarded. Detailed methodology required.',
  },
  {
    show: 'Tangrams', region: 'China',
    finalDate: '2026-05-22', juryDate: '2026-06-12', ceremonyDate: '2026-06-26',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '22 May 2026', ceremony: 'Jun 2026',
    prValue: 20, note: 'Premier China-market show. Verify dates with China team.',
  },
  {
    show: 'MMA Smarties APAC', region: 'APAC',
    finalDate: '2026-06-12', juryDate: '2026-08-14', ceremonyDate: '2026-09-11',
    earlyBird: 'Apr 2026', standard: 'May 2026', final: '12 Jun 2026', ceremony: 'Sep 2026',
    prValue: 28, note: 'Mobile/digital first. APAC and Global cycles run separately.',
  },
  {
    show: 'Women to Watch APAC', region: 'APAC',
    finalDate: '2026-08-14', juryDate: '2026-09-25', ceremonyDate: '2026-10-16',
    earlyBird: 'Jun 2026', standard: 'Jul 2026', final: '14 Aug 2026', ceremony: 'Oct 2026',
    prValue: 25, note: 'Editorial selection — Campaign Asia publishes as a feature.',
  },
  {
    show: 'Spikes Asia', region: 'APAC',
    finalDate: '2026-09-11', juryDate: '2026-09-18', ceremonyDate: '2026-09-25',
    earlyBird: 'Jul 2026', standard: 'Aug 2026', final: '11 Sep 2026', ceremony: 'Sep 2026',
    prValue: 55, note: 'APAC sister show to Cannes Lions. Held in Singapore. Sep 2026 dates are estimated next cycle — verify at spikes.asia.',
  },
  {
    show: 'Campaign Asia AOTY', region: 'APAC',
    finalDate: '2026-10-16', juryDate: '2026-11-20', ceremonyDate: '2026-12-04',
    earlyBird: 'Aug 2026', standard: 'Sep 2026', final: '16 Oct 2026', ceremony: 'Dec 2026',
    prValue: 35, note: 'Agency/brand/person of the year. Nomination + written submission.',
  },
]

// ── WIN_RATES ─────────────────────────────────────────────────────────────────
// Historical win probability percentages per award level + estimated PR values.
// Source: published show statistics aggregated 2019–2024.
// Grand Prix rates are deliberately low — they reflect reality.

export const WIN_RATES: Record<string, WinRateData> = {
  'Cannes Lions': {
    shortlist: 12, metal: 6, gold: 2, grandprix: 0.08,
    pr: { shortlist: 12000, metal: 60000, gold: 350000, grandprix: 1500000 },
    fee: 1350,
  },
  'D&AD': {
    shortlist: 15, metal: 10, gold: 4, grandprix: 0.5,
    pr: { shortlist: 10000, metal: 40000, gold: 200000, grandprix: 800000 },
    fee: 620,
  },
  'One Show': {
    shortlist: 20, metal: 12, gold: 5, grandprix: 0.8,
    pr: { shortlist: 8000, metal: 35000, gold: 180000, grandprix: 700000 },
    fee: 700,
  },
  'Spikes Asia': {
    shortlist: 18, metal: 9, gold: 3, grandprix: 0.3,
    pr: { shortlist: 10000, metal: 50000, gold: 250000, grandprix: 900000 },
    fee: 1000,
  },
  'Effie APAC': {
    shortlist: 25, metal: 15, gold: 6, grandprix: 1.5,
    pr: { shortlist: 15000, metal: 50000, gold: 200000, grandprix: 600000 },
    fee: 800,
  },
  'Festival of Media APAC': {
    shortlist: 32, metal: 18, gold: 7, grandprix: 2,
    pr: { shortlist: 10000, metal: 35000, gold: 120000, grandprix: 400000 },
    fee: 550,
  },
  'Campaign Asia AOTY': {
    shortlist: 40, metal: 25, gold: 10, grandprix: 3,
    pr: { shortlist: 12000, metal: 40000, gold: 150000, grandprix: 500000 },
    fee: 420,
  },
  'MMA Smarties APAC': {
    shortlist: 28, metal: 16, gold: 6, grandprix: 1.5,
    pr: { shortlist: 8000, metal: 30000, gold: 100000, grandprix: 350000 },
    fee: 600,
  },
  'ROI Festival': {
    shortlist: 35, metal: 20, gold: 8, grandprix: 2.5,
    pr: { shortlist: 8000, metal: 25000, gold: 90000, grandprix: 280000 },
    fee: 450,
  },
  'Tangrams': {
    shortlist: 38, metal: 22, gold: 9, grandprix: 3,
    pr: { shortlist: 6000, metal: 20000, gold: 75000, grandprix: 220000 },
    fee: 400,
  },
  'Clio Awards': {
    shortlist: 22, metal: 12, gold: 4, grandprix: 0.6,
    pr: { shortlist: 9000, metal: 35000, gold: 180000, grandprix: 650000 },
    fee: 500,
  },
  'Women Leading Change': {
    shortlist: 35, metal: 20, gold: 8, grandprix: 3,
    pr: { shortlist: 8000, metal: 25000, gold: 80000, grandprix: 200000 },
    fee: 350,
  },
  'Women to Watch APAC': {
    shortlist: 40, metal: 40, gold: 40, grandprix: 40,
    pr: { shortlist: 10000, metal: 10000, gold: 10000, grandprix: 10000 },
    fee: 300,
  },
  'Cristal Festival': {
    shortlist: 30, metal: 16, gold: 6, grandprix: 1.5,
    pr: { shortlist: 9000, metal: 30000, gold: 120000, grandprix: 450000 },
    fee: 480,
  },
}

// ── ENTRY_FEES ────────────────────────────────────────────────────────────────
// Per-show entry fee ranges for display/reference. WIN_RATES.fee is the
// canonical number used in ROI calculations.

export const ENTRY_FEES: Record<string, EntryFeeData> = {
  'Cannes Lions':           { base: 1350, range: '$1,200–$1,800',           note: 'Film/Craft premium. Late fees add 3–10%.' },
  'Spikes Asia':            { base: 1000, range: '$900–$1,400',             note: 'Aligned with APAC market pricing.' },
  'D&AD':                   { base: 620,  range: '£450–£650 (~$570–$820)',  note: 'GBP pricing. Craft categories higher.' },
  'One Show':               { base: 700,  range: '$650–$950',               note: 'Varies by discipline.' },
  'Effie APAC':             { base: 800,  range: '~$750–$900',              note: 'Data-heavy entries — budget writing time.' },
  'Festival of Media APAC': { base: 550,  range: '~$500–$700',              note: '' },
  'Campaign Asia AOTY':     { base: 420,  range: '~$380–$600',              note: 'Agency of the Year nominations.' },
  'MMA Smarties APAC':      { base: 600,  range: '~$550–$700',              note: '' },
  'ROI Festival':           { base: 450,  range: '~$400–$550',              note: '' },
  'Tangrams':               { base: 400,  range: '~$350–$500',              note: '' },
  'Clio Awards':            { base: 500,  range: '~$450–$700',              note: 'Multiple category tiers.' },
  'Women Leading Change':   { base: 350,  range: '~$300–$450',              note: '' },
  'Women to Watch APAC':    { base: 300,  range: '~$250–$400',              note: '' },
  'Cristal Festival':       { base: 480,  range: '~$430–$600',              note: 'Premium sector positioning.' },
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Fuzzy-match a show name to the nearest WIN_RATES key.
 * Strips common suffixes then tries partial substring matching.
 * Used to link direction/critique show names → budget calculator.
 */
export function resolveWinRateKey(name: string | null | undefined): string | null {
  if (!name) return null
  if (WIN_RATES[name]) return name
  const stripped = name.replace(/\s*(Awards?|Festival|Show|Competition)\s*$/i, '').trim()
  if (WIN_RATES[stripped]) return stripped
  const lower = stripped.toLowerCase()
  return (
    Object.keys(WIN_RATES).find(
      k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
    ) ?? null
  )
}

/**
 * Quality-adjusted win probability multiplier.
 * Converts a 0–100 quality score to a win-rate multiplier:
 *   quality   0  →  0.25× (floor)
 *   quality  50  → ~0.84×
 *   quality  70  → ~1.37×
 *   quality  85  → ~2.0×
 *   quality 100  →  3.0× (cap)
 *
 * Formula: min(3, 0.25 + 2.75 × (quality/100)^1.5)
 */
export function qFactor(quality: number): number {
  return Math.min(3, 0.25 + 2.75 * Math.pow((quality || 60) / 100, 1.5))
}

/**
 * Get urgency information for a show's upcoming deadline.
 *
 * Urgency levels:
 *   critical  ≤14 days  — too tight for entry + video production
 *   tight     15–35 days — possible but rushed; start immediately
 *   prepare   36–56 days — prep phases beginning; brief and shortlist now
 *   ok        >56 days   — on track
 *   past      deadline passed
 *
 * Uses fuzzy matching so "Cannes Lions Film" will resolve to "Cannes Lions".
 */
export function getDeadlineUrgency(showName: string | null | undefined): DeadlineUrgency {
  if (!showName) return { level: 'ok', daysLeft: null, deadlineDate: null, message: '' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fuzzy match against DEADLINES_2026 show names
  const lower = showName.toLowerCase()
  const show = DEADLINES_2026.find(
    d =>
      d.show.toLowerCase() === lower ||
      d.show.toLowerCase().includes(lower) ||
      lower.includes(d.show.toLowerCase())
  )

  if (!show) return { level: 'ok', daysLeft: null, deadlineDate: null, message: '' }

  const deadline = new Date(show.finalDate + 'T00:00:00')
  const daysLeft = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) {
    return {
      level: 'past',
      daysLeft,
      deadlineDate: show.finalDate,
      message: `Deadline passed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`,
    }
  }

  if (daysLeft === 0) {
    return {
      level: 'critical',
      daysLeft: 0,
      deadlineDate: show.finalDate,
      message: 'Deadline is today',
    }
  }

  if (daysLeft <= URGENCY_THRESHOLDS.CRITICAL) {
    return {
      level: 'critical',
      daysLeft,
      deadlineDate: show.finalDate,
      message: `${daysLeft} days to deadline — too tight for entry + video. Writing only may be feasible if materials are ready.`,
    }
  }

  if (daysLeft <= URGENCY_THRESHOLDS.TIGHT) {
    return {
      level: 'tight',
      daysLeft,
      deadlineDate: show.finalDate,
      message: `${daysLeft} days to deadline (${show.final}) — tight timeline. Entry is feasible but video production will be very rushed. Start immediately.`,
    }
  }

  if (daysLeft <= URGENCY_THRESHOLDS.PREPARE) {
    return {
      level: 'prepare',
      daysLeft,
      deadlineDate: show.finalDate,
      message: `${daysLeft} days to deadline (${show.final}) — prep phases beginning. Shortlist and select categories this week.`,
    }
  }

  return {
    level: 'ok',
    daysLeft,
    deadlineDate: show.finalDate,
    message: `${daysLeft} days to deadline (${show.final})`,
  }
}
