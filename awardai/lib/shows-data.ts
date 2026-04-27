/**
 * shows-data.ts — Shortlist Master Shows Database
 * =============================================================================
 * All award show deadlines, win rates, and entry fees.
 *
 * ⚠️  ACCURACY RULES:
 *     1. Never change a `confidence` value to 'verified' without checking the
 *        official show website yourself. Dates change every year.
 *     2. `lastVerified` must be the ISO date you personally confirmed the data.
 *     3. The agent Full Prep mode will ONLY operate on shows where
 *        confidence === 'verified' AND the deadline is in the future.
 *        All other shows require manual operation via the standard UI.
 *
 * Last verified pass: 26 April 2026 (Ben Royalcondit)
 * =============================================================================
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ShowConfidence = 'verified' | 'partial' | 'needs_check'

export type ShowDeadline = {
  show: string
  region: 'Global' | 'APAC' | 'MENA' | 'China' | 'Europe' | 'Australia'
  finalDate: string       // ISO date string: submission deadline (hard cutoff). Empty string = unknown.
  juryDate: string        // ISO date string: jury convenes / results begin
  ceremonyDate: string    // ISO date string: awards ceremony / winners announced
  earlyBird: string       // Human-readable e.g. "Jan 2026"
  standard: string
  final: string
  ceremony: string
  prValue: number         // Prestige score 0–100 (for sorting/weighting)
  note: string            // Practical notes for the entry team
  confidence: ShowConfidence  // Agent gate: only 'verified' shows proceed in Full Prep
  lastVerified: string    // ISO date this row was last confirmed against official source
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

// ── Agent gate result ─────────────────────────────────────────────────────────

export type ShowGateResult =
  | { ok: true; show: ShowDeadline; fees: EntryFeeData | null; rates: WinRateData | null }
  | { ok: false; showName: string; reason: 'partial' | 'needs_check' | 'not_found' | 'deadline_passed'; message: string }

/**
 * getShowDataWithConfidence — agent gate function.
 *
 * Returns ok: true only if the show is 'verified' AND the deadline is in the future.
 * All other cases return ok: false with a human-readable message for the agent to
 * surface to the user, instructing them to operate manually.
 *
 * Used by the run-full-prep orchestrator before every direction/draft/eval step.
 */
export function getShowDataWithConfidence(showName: string): ShowGateResult {
  if (!showName) {
    return { ok: false, showName: '', reason: 'not_found', message: 'No show name provided.' }
  }

  const lower = showName.toLowerCase()
  const found = DEADLINES_2026.find(
    d =>
      d.show.toLowerCase() === lower ||
      d.show.toLowerCase().includes(lower) ||
      lower.includes(d.show.toLowerCase())
  )

  if (!found) {
    return {
      ok: false,
      showName,
      reason: 'not_found',
      message: `"${showName}" isn't in the verified show list yet. Please use the manual workflow for this project, or request the show be added via the Request a Show flow.`,
    }
  }

  if (found.confidence !== 'verified') {
    return {
      ok: false,
      showName: found.show,
      reason: found.confidence,
      message: `${found.show} hasn't been fully verified yet — some data may be incomplete or unconfirmed. Please use the manual workflow for this one. Once the show data is verified it will be available for Full Prep.`,
    }
  }

  // Check deadline status
  if (found.finalDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadline = new Date(found.finalDate + 'T00:00:00')
    const daysLeft = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft < 0) {
      return {
        ok: false,
        showName: found.show,
        reason: 'deadline_passed',
        message: `The ${found.show} 2026 entry deadline has passed (${found.final}). Full Prep can't create new entries for a closed show. Please use the manual workflow if you're evaluating an existing entry, or wait for the next cycle.`,
      }
    }
  }

  return {
    ok: true,
    show: found,
    fees: ENTRY_FEES[found.show] ?? null,
    rates: WIN_RATES[found.show] ?? null,
  }
}

// ── Urgency thresholds ────────────────────────────────────────────────────────

export const URGENCY_THRESHOLDS = {
  CRITICAL: 14,
  TIGHT: 35,
  PREPARE: 56,
} as const

// ── PREP_PHASES ───────────────────────────────────────────────────────────────

export const PREP_PHASES: PrepPhase[] = [
  { label: 'Shortlisting', dStart: -56, dEnd: -42 },
  { label: 'Selection',    dStart: -42, dEnd: -35 },
  { label: 'Writing',      dStart: -35, dEnd: -21 },
  { label: 'Production',   dStart: -21, dEnd: -7  },
  { label: 'Polish',       dStart: -7,  dEnd: 0   },
]

// ── DEADLINES_2026 ────────────────────────────────────────────────────────────
//
// confidence values:
//   'verified'    — Ben confirmed against official source; safe for all agent actions
//   'partial'     — data exists and is likely correct but ceremony/fee details incomplete;
//                   agent will pause and ask user to operate manually
//   'needs_check' — no reliable 2026 data found, show structure changed, or cycle already
//                   closed; agent will pause and ask user to operate manually

export const DEADLINES_2026: ShowDeadline[] = [

  // ── FULLY VERIFIED ──────────────────────────────────────────────────────────

  {
    show: 'Cannes Lions', region: 'Global',
    finalDate: '2026-04-09', juryDate: '2026-06-15', ceremonyDate: '2026-06-22',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '9 Apr 2026', ceremony: '22–26 Jun 2026',
    prValue: 80,
    note: 'EUR pricing: Early Bird €690/€1,150 (single/campaign), Standard €1,100/€1,830, Late €1,695/€2,825. Late-fee tiers after 5 Mar, 19 Mar, 2 Apr; final 9 Apr. AI/source disclosure and CEO/CMO sign-off are official entry requirements. Festival runs 22–26 Jun 2026.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'D&AD', region: 'Global',
    finalDate: '2026-03-26', juryDate: '2026-04-24', ceremonyDate: '2026-05-14',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '26 Mar 2026', ceremony: 'May 2026',
    prValue: 50,
    note: 'GBP fees: Design £25–£250, Advertising £290–£390, Crafts campaigns up to £980 (VAT excluded). Payment deadline 19 Mar; finalise-submission deadline 26 Mar; physical shipment due 8 Apr. Craft categories: execution judged before idea.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'One Show', region: 'Global',
    finalDate: '2026-02-20', juryDate: '2026-04-16', ceremonyDate: '2026-05-15',
    earlyBird: 'Oct 2025', standard: 'Jan 2026', final: '20 Feb 2026', ceremony: '15 May 2026 (NYC)',
    prValue: 45,
    note: 'Official 2026 schedule: super early 31 Oct 2025, early 12 Dec, regular 23 Jan, extended 6 Feb, final 20 Feb. Finalists announced 16 Apr. Ceremony 15 May NYC. Fees $400–$1,500 by category/deadline, excl. processing.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Awards', region: 'Global',
    finalDate: '2026-02-06', juryDate: '2026-04-09', ceremonyDate: '2026-05-12',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '6 Feb 2026', ceremony: '12 May 2026 (NYC)',
    prValue: 35,
    note: 'Official final deadline 6 Feb 2026. Shortlist 9 Apr; Bronze/Silver/Gold 20 Apr; Grand and Of The Year at ceremony 12 May at Cipriani 25 Broadway, NYC. Fees $525–$1,400 by category/deadline; student $50–$75; Google AI specialty free.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Effie APAC', region: 'APAC',
    finalDate: '2026-03-09', juryDate: '2026-04-01', ceremonyDate: '2026-09-12',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '9 Mar 2026', ceremony: 'Sep 2026',
    prValue: 40,
    note: 'Last-chance deadline 9 Mar 2026. Round 1 judging Apr, Round 2 judging May. Awards Gala Sep 2026. Fees SGD 1,090–2,690. Most rigorous data requirements of any show — allow 4–6 weeks for entry writing.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Festival of Media APAC', region: 'APAC',
    finalDate: '2026-01-30', juryDate: '2026-03-19', ceremonyDate: '2026-05-07',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '30 Jan 2026', ceremony: '7 May 2026',
    prValue: 30,
    note: 'Asia-Pacific Media Campaign Awards. Open 7 Nov 2025; early 5 Dec (£349); standard 2 Jan (£389); extended/final 30 Jan (£440). Shortlist 19 Mar. Ceremony 7 May 2026. GBP fees.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Campaign Asia Women Leading Change', region: 'APAC',
    finalDate: '2026-03-25', juryDate: '2026-04-27', ceremonyDate: '2026-05-19',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '25 Mar 2026', ceremony: '19 May 2026',
    prValue: 30,
    note: 'Campaign Asia 2026 schedule: early 13 Feb, standard 12 Mar, final 25 Mar (6pm HKT). Shortlist 27 Apr, winners 19 May. Fees HKD 2,990/3,300/3,950 per entry by tier. Individual and company categories.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'MMA Smarties APAC', region: 'APAC',
    finalDate: '2026-07-21', juryDate: '2026-08-14', ceremonyDate: '2026-09-11',
    earlyBird: 'May 2026', standard: 'Jul 2026', final: '21 Jul 2026', ceremony: 'Sep 2026',
    prValue: 28,
    note: 'APAC regional: early bird 5 May, on-time 9 Jul, extended/final 21 Jul. Member/non-member fees $365–$525 USD. Some APAC country programs run separately at lower fees. APAC and Global cycles are distinct.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },

  // ── PARTIAL — agent will pause, user must operate manually ──────────────────

  {
    show: 'Clio Entertainment', region: 'Global',
    finalDate: '2026-08-07', juryDate: '2026-09-01', ceremonyDate: '',
    earlyBird: 'Apr 2026', standard: 'Jun 2026', final: '7 Aug 2026', ceremony: 'TBC',
    prValue: 30,
    note: 'Entries open 15 Apr; first deadline 12 Jun; second 10 Jul; final 7 Aug 2026. Results release and ceremony dates listed as "coming soon" — do not schedule against ceremony until confirmed. Fees $400–$1,300 by category/deadline; student $50.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Sports', region: 'Global',
    finalDate: '2026-09-04', juryDate: '2026-11-15', ceremonyDate: '2026-12-08',
    earlyBird: 'Jun 2026', standard: 'Jul 2026', final: '4 Sep 2026', ceremony: '8 Dec 2026 (NYC)',
    prValue: 28,
    note: 'Entry opened 21 Apr 2026. First deadline 5 Jun, second 17 Jul, third 14 Aug, final 4 Sep. Gold/Silver/Bronze/Shortlist mid-Nov. Ceremony 8 Dec at Edison Ballroom NYC. Fees $300–$1,075 by category; student $50–$75. Fee page carries older date labels — recheck before budget lock.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Creators', region: 'Global',
    finalDate: '2026-08-21', juryDate: '2026-10-01', ceremonyDate: '2026-11-01',
    earlyBird: 'May 2026', standard: 'Jul 2026', final: '21 Aug 2026', ceremony: 'Nov 2026 (LA)',
    prValue: 22,
    note: 'Inaugural 2026 program. Call for entries 26 Mar; 1st deadline 29 May; 2nd 17 Jul; final 21 Aug. Winners Oct, awards show Nov in LA. Fees $100–$600 by medium/deadline. Fee page has a conflicting earlier deadline table — verify before committing budget. Creator Track $100, Brand Track $500, Student free.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'ANDY Awards', region: 'Global',
    finalDate: '2026-03-17', juryDate: '2026-04-20', ceremonyDate: '2026-05-20',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '17 Mar 2026', ceremony: '20 May 2026 (NYC)',
    prValue: 40,
    note: 'Opened 1 Dec 2025; early deadline 11 Feb; final deadline 17 Mar. Winners announced 20 Apr. Best in Show/special recognition celebration 20 May 2026 NYC. Fees $1,250–$2,000+ by fee type/distinction; +8% processing. Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'New York Festivals Advertising Awards', region: 'Global',
    finalDate: '2026-05-08', juryDate: '2026-06-01', ceremonyDate: '2026-06-12',
    earlyBird: 'Feb 2026', standard: 'Apr 2026', final: '8 May 2026', ceremony: '12 Jun 2026',
    prValue: 38,
    note: 'Scoped to Advertising Awards (not NYF Radio/TV). Entries open 13 Jan; early 27 Feb; official 23 Apr; final 8 May. Single/Single Plus/Campaign fees $600–$1,500. Shortlist 1 Jun, winners 12 Jun. Includes NYF Cristal Village Award within 2026 ecosystem. Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Dubai Lynx', region: 'MENA',
    finalDate: '2026-01-22', juryDate: '2026-03-15', ceremonyDate: '2026-04-01',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '22 Jan 2026', ceremony: '1 Apr 2026',
    prValue: 38,
    note: 'MENA\'s premier show; Cannes Lions affiliate. Entries opened 9 Oct 2025; late fee after 11 Dec; second fee tier after 15 Jan; final deadline 22 Jan. Awards Ceremony 1 Apr 2026. Fees $575–$1,170 by Lynx/category/deadline. Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Gerety Awards', region: 'Global',
    finalDate: '2026-05-15', juryDate: '2026-06-01', ceremonyDate: '',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '15 May 2026', ceremony: 'TBC',
    prValue: 35,
    note: 'Entries open 5 Jan; early bird 13 Mar; standard 17 Apr; final 15 May. Single/campaign fees €340–€750 by deadline. Ceremony/winner date not published on rules page — confirm before scheduling. Judged exclusively by female jury. Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },

  // ── NEEDS CHECK — agent will pause, user must operate manually ──────────────

  {
    show: 'Spikes Asia', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '2026-03-12',
    earlyBird: '', standard: '', final: 'Closed', ceremony: '12 Mar 2026 (Singapore — 2026 cycle complete)',
    prValue: 55,
    note: '⚠️ 2026 cycle already complete — gala was 12 Mar 2026 in Singapore. Entry deadline for the 2026 cycle was approximately Dec 2025–Jan 2026. 2027 cycle dates not yet published. Do not use for 2026 scheduling. Source: spikes.asia/news',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
  {
    show: 'Campaign Asia Agency of the Year', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Unknown', ceremony: 'Unknown',
    prValue: 35,
    note: '⚠️ Public page still shows 2025 cycle (final 2 Sep 2025, presentations Nov/Dec 2025). No 2026 dates published as of Apr 2026. Do not use for scheduling until page rolls to 2026 cycle. Check aoyawards.com.',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
  {
    show: 'ROI Festival', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Unknown', ceremony: 'Unknown',
    prValue: 25,
    note: '⚠️ No confirmed 2026 English-language entry page found. Evidence suggests a 19th edition schedule (early-bird ~15 May, regular ~25 Jun, final ~15 Jul, ceremony Oct) but official page was stale/ambiguous. Do not use for scheduling. Check entry.roifestival.com.',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
  {
    show: 'Tangrams', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Integrated', ceremony: 'N/A',
    prValue: 20,
    note: '⚠️ No standalone 2026 Tangrams entry page found. Categories appear to have been integrated into Spikes Asia\'s Strategy & Effectiveness Spike. Use "Spikes Asia — Strategy & Effectiveness" for forward planning. Confirm with spikes.asia if client specifically requests Tangrams.',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
  {
    show: 'Cristal Festival', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Structure changed', ceremony: 'N/A',
    prValue: 25,
    note: '⚠️ Legacy Cristal Festival structure has changed. The original Alpine show appears to have evolved into: (1) African Cristal Festival and (2) NYF Cristal Village Award (run within New York Festivals Advertising Awards ecosystem). Use NYF Advertising Awards for Cristal Village entries. Check africancristalfestival.com for African Cristal.',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
  {
    show: 'Campaign Asia Women to Watch APAC', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Unknown', ceremony: 'Unknown',
    prValue: 25,
    note: '⚠️ No current official 2026 Women to Watch APAC nomination/deadline page found. Historical Women to Watch Greater China and APAC list pages exist but no usable 2026 scheduling source. Check campaignasia.com for when nominations open.',
    confidence: 'needs_check', lastVerified: '2026-04-26',
  },
]

// ── WIN_RATES ─────────────────────────────────────────────────────────────────
// Historical win probability percentages per award level + estimated PR values.
// Source: published show statistics aggregated 2019–2024.
// ⚠️  Rows marked with "ESTIMATE" need Ben's benchmarking before using in client reports.

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
  'Clio Awards': {
    shortlist: 22, metal: 12, gold: 4, grandprix: 0.6,
    pr: { shortlist: 9000, metal: 35000, gold: 180000, grandprix: 650000 },
    fee: 750,
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
  'Campaign Asia Women Leading Change': {
    shortlist: 35, metal: 20, gold: 8, grandprix: 3,
    pr: { shortlist: 8000, metal: 25000, gold: 80000, grandprix: 200000 },
    fee: 450,
  },
  'MMA Smarties APAC': {
    shortlist: 28, metal: 16, gold: 6, grandprix: 1.5,
    pr: { shortlist: 8000, metal: 30000, gold: 100000, grandprix: 350000 },
    fee: 450,
  },
  'Clio Entertainment': {
    shortlist: 25, metal: 14, gold: 5, grandprix: 0.8,
    pr: { shortlist: 8000, metal: 30000, gold: 150000, grandprix: 500000 },
    fee: 550,
  },
  'Clio Sports': {
    shortlist: 24, metal: 13, gold: 5, grandprix: 0.8,
    pr: { shortlist: 8000, metal: 30000, gold: 150000, grandprix: 500000 },
    fee: 550,
  },
  'Clio Creators': {
    shortlist: 30, metal: 18, gold: 7, grandprix: 1.5,
    pr: { shortlist: 6000, metal: 20000, gold: 80000, grandprix: 250000 },
    fee: 250,
  },
  // ESTIMATE — win rates and PR values need Ben's benchmarking
  'ANDY Awards': {
    shortlist: 18, metal: 10, gold: 3.5, grandprix: 0.5,
    pr: { shortlist: 8000, metal: 30000, gold: 150000, grandprix: 500000 },
    fee: 1600,
  },
  // ESTIMATE — win rates and PR values need Ben's benchmarking
  'New York Festivals Advertising Awards': {
    shortlist: 20, metal: 12, gold: 4, grandprix: 0.6,
    pr: { shortlist: 7000, metal: 28000, gold: 130000, grandprix: 450000 },
    fee: 1050,
  },
  // ESTIMATE — win rates and PR values need Ben's benchmarking
  'Dubai Lynx': {
    shortlist: 22, metal: 13, gold: 5, grandprix: 0.8,
    pr: { shortlist: 9000, metal: 35000, gold: 160000, grandprix: 550000 },
    fee: 870,
  },
  // ESTIMATE — win rates and PR values need Ben's benchmarking
  'Gerety Awards': {
    shortlist: 20, metal: 12, gold: 4.5, grandprix: 0.6,
    pr: { shortlist: 7000, metal: 25000, gold: 120000, grandprix: 400000 },
    fee: 545,
  },
  'Campaign Asia Agency of the Year': {
    shortlist: 40, metal: 25, gold: 10, grandprix: 3,
    pr: { shortlist: 12000, metal: 40000, gold: 150000, grandprix: 500000 },
    fee: 420,
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
  'Spikes Asia': {
    shortlist: 18, metal: 9, gold: 3, grandprix: 0.3,
    pr: { shortlist: 10000, metal: 50000, gold: 250000, grandprix: 900000 },
    fee: 1000,
  },
  'Cristal Festival': {
    shortlist: 30, metal: 16, gold: 6, grandprix: 1.5,
    pr: { shortlist: 9000, metal: 30000, gold: 120000, grandprix: 450000 },
    fee: 480,
  },
  'Campaign Asia Women to Watch APAC': {
    shortlist: 40, metal: 40, gold: 40, grandprix: 40,
    pr: { shortlist: 10000, metal: 10000, gold: 10000, grandprix: 10000 },
    fee: 300,
  },
}

// ── ENTRY_FEES ────────────────────────────────────────────────────────────────
// Per-show entry fee ranges for display/reference. WIN_RATES.fee is the
// canonical number used in ROI calculations.

export const ENTRY_FEES: Record<string, EntryFeeData> = {
  'Cannes Lions':           { base: 1200, range: '€690–€2,825 (EUR; category/deadline dependent)', note: 'Late-fee tiers after 5 Mar, 19 Mar, 2 Apr. AI/source disclosure and CEO/CMO sign-off required. Festival 22–26 Jun 2026.' },
  'D&AD':                   { base: 390,  range: '£25–£980 (GBP; category/tier dependent; VAT excl.)', note: 'Payment deadline 19 Mar; finalise deadline 26 Mar; physical shipment 8 Apr. Craft categories: execution judged before idea.' },
  'One Show':               { base: 700,  range: '$400–$1,500 (USD; category/deadline dependent)', note: 'Processing fees excluded. Final deadline 20 Feb 2026.' },
  'Clio Awards':            { base: 750,  range: '$525–$1,400 (USD; category/deadline dependent)', note: 'Student $50–$75. Google AI specialty category free. Ceremony 12 May NYC.' },
  'Effie APAC':             { base: 800,  range: 'SGD 1,090–2,690', note: 'Most rigorous data requirements. Allow 4–6 weeks for writing.' },
  'Festival of Media APAC': { base: 550,  range: '£349–£440 (GBP; deadline dependent)', note: 'Early 5 Dec £349; standard 2 Jan £389; final 30 Jan £440. Ceremony 7 May 2026.' },
  'Campaign Asia Women Leading Change': { base: 450,  range: 'HKD 2,990–3,950 (per entry; tier dependent)', note: 'Deadlines 6pm Hong Kong time. Early/standard/final tiers.' },
  'MMA Smarties APAC':      { base: 450,  range: '$365–$525 (USD; member/non-member)', note: 'APAC regional program. Country programs vary $140–$350. Global cycle separate.' },
  'Clio Entertainment':     { base: 550,  range: '$400–$1,300 (USD; category/deadline dependent)', note: 'Student $50. Ceremony TBC — confirm before scheduling.' },
  'Clio Sports':            { base: 550,  range: '$300–$1,075 (USD; category/deadline dependent)', note: 'Student $50–$75. Includes NIL category. Ceremony 8 Dec NYC.' },
  'Clio Creators':          { base: 250,  range: '$100–$600 (USD; medium/deadline dependent)', note: 'Creator Track $100, Brand Track $500, Student free. Inaugural 2026 program.' },
  'ANDY Awards':            { base: 1600, range: '$1,250–$2,000+ (USD; +8% processing)', note: 'Fee type/distinction dependent. Ceremony 20 May NYC. ESTIMATE — benchmark with Ben.' },
  'New York Festivals Advertising Awards': { base: 1050, range: '$600–$1,500 (USD; entry type/deadline dependent)', note: 'Includes NYF Cristal Village Award. Shortlist 1 Jun, winners 12 Jun. ESTIMATE — benchmark with Ben.' },
  'Dubai Lynx':             { base: 870,  range: '$575–$1,170 (USD; category/deadline dependent)', note: 'MENA premier show. Cannes Lions affiliate. ESTIMATE — benchmark with Ben.' },
  'Gerety Awards':          { base: 545,  range: '€340–€750 (EUR; single/campaign and deadline dependent)', note: 'Female jury. Ceremony TBC. ESTIMATE — benchmark with Ben.' },
  'Campaign Asia Agency of the Year': { base: 420,  range: 'Unknown for 2026', note: 'Public page shows 2025 fees only. Do not budget until 2026 page publishes.' },
  'ROI Festival':           { base: 450,  range: 'Unknown — public 2026 fee table not found', note: 'Do not budget until confirmed.' },
  'Tangrams':               { base: 400,  range: 'N/A — integrated into Spikes Asia', note: 'Use Spikes Asia Strategy & Effectiveness Spike.' },
  'Spikes Asia':            { base: 1000, range: 'Unknown — 2027 cycle not yet open', note: '2026 cycle closed Mar 2026. Await 2027 entry kit.' },
  'Cristal Festival':       { base: 480,  range: 'N/A — show structure changed', note: 'See NYF Advertising Awards (Cristal Village) and African Cristal Festival.' },
  'Campaign Asia Women to Watch APAC': { base: 300,  range: 'Unknown — no 2026 page found', note: 'Check campaignasia.com.' },
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Fuzzy-match a show name to the nearest WIN_RATES key.
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
 * quality   0  →  0.25× (floor)
 * quality  50  → ~0.84×
 * quality  70  → ~1.37×
 * quality  85  → ~2.0×
 * quality 100  →  3.0× (cap)
 */
export function qFactor(quality: number): number {
  return Math.min(3, 0.25 + 2.75 * Math.pow((quality || 60) / 100, 1.5))
}

/**
 * Get urgency information for a show's upcoming deadline.
 */
export function getDeadlineUrgency(showName: string | null | undefined): DeadlineUrgency {
  if (!showName) return { level: 'ok', daysLeft: null, deadlineDate: null, message: '' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lower = showName.toLowerCase()
  const show = DEADLINES_2026.find(
    d =>
      d.show.toLowerCase() === lower ||
      d.show.toLowerCase().includes(lower) ||
      lower.includes(d.show.toLowerCase())
  )

  if (!show || !show.finalDate) return { level: 'ok', daysLeft: null, deadlineDate: null, message: '' }

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
  if (daysLeft === 0) return { level: 'critical', daysLeft: 0, deadlineDate: show.finalDate, message: 'Deadline is today' }
  if (daysLeft <= URGENCY_THRESHOLDS.CRITICAL) {
    return { level: 'critical', daysLeft, deadlineDate: show.finalDate, message: `${daysLeft} days to deadline — too tight for entry + video. Writing only may be feasible if materials are ready.` }
  }
  if (daysLeft <= URGENCY_THRESHOLDS.TIGHT) {
    return { level: 'tight', daysLeft, deadlineDate: show.finalDate, message: `${daysLeft} days to deadline (${show.final}) — tight timeline. Entry is feasible but video production will be very rushed. Start immediately.` }
  }
  if (daysLeft <= URGENCY_THRESHOLDS.PREPARE) {
    return { level: 'prepare', daysLeft, deadlineDate: show.finalDate, message: `${daysLeft} days to deadline (${show.final}) — prep phases beginning. Shortlist and select categories this week.` }
  }
  return { level: 'ok', daysLeft, deadlineDate: show.finalDate, message: `${daysLeft} days to deadline (${show.final})` }
}

// ── ROI Index ─────────────────────────────────────────────────────────────────

const _ROI_CEILING: number = (() => {
  let max = 0
  for (const [show, rates] of Object.entries(WIN_RATES)) {
    const dl = DEADLINES_2026.find(d => d.show === show)
    const prv = dl?.prValue ?? 30
    const raw = (prv * rates.metal) / rates.fee
    if (raw > max) max = raw
  }
  return max
})()

export function computeRoiIndex(
  showName: string | null | undefined,
  qualityScore?: number
): number {
  const key = resolveWinRateKey(showName)
  if (!key || !WIN_RATES[key]) return 0
  const rates = WIN_RATES[key]
  const dl = DEADLINES_2026.find(d => d.show === key)
  const prValue = dl?.prValue ?? 30
  const medalChance = qualityScore !== undefined
    ? rates.metal * qFactor(qualityScore)
    : rates.metal
  const raw = (prValue * medalChance) / rates.fee
  return Math.min(100, Math.round((raw / _ROI_CEILING) * 100))
}

// ── KB show name normalisation ────────────────────────────────────────────────
//
// Maps variant/legacy show names (from campaigns.show_raw in the KB) to their
// canonical display name, or to null to hide them entirely from all show pickers.
//
// Keys are lowercase for case-insensitive lookup. Applied after the show_raw
// extraction/cleaning step in the show selector dropdowns.
//
// To add a new mapping: add a key (lowercase variant) → value (canonical name | null).

export const KB_SHOW_ALIASES: Record<string, string | null> = {
  // ── Unify name variants ──────────────────────────────────────────────────────

  // Campaign Asia Agency of the Year (canonical) — map old short name and variants
  'campaign asia aoty':                           'Campaign Asia Agency of the Year',

  // Festival of Media APAC
  'festival of media apac (foma)':                'Festival of Media APAC',
  'festival of media asia pacific':               'Festival of Media APAC',

  // Festival of Media Global
  'festival of media global (fomg)':              'Festival of Media Global',
  'festival of media global':                     'Festival of Media Global',

  // MMA Smarties APAC — unify all regional/legacy variants
  'mma smarties':                                 'MMA Smarties APAC',
  'mma smarties global':                          'MMA Smarties APAC',
  'smarties apac':                                'MMA Smarties APAC',

  // Campaign Asia Women Leading Change (canonical) — map old/short name variants
  'women leading change':                         'Campaign Asia Women Leading Change',
  'campaign asia women leading change':           'Campaign Asia Women Leading Change',

  // Campaign Asia Women to Watch APAC (canonical) — map old/short name variants
  'women to watch apac':                          'Campaign Asia Women to Watch APAC',
  'campaign asia women to watch':                 'Campaign Asia Women to Watch APAC',

  // ── Renames ──────────────────────────────────────────────────────────────────
  'digital a-list':                               'Campaign Greater China A List',
  'digital media awards (campaign asia)':         'Campaign Greater China Digital Media Awards',
  'dma awards':                                   'Campaign Greater China Digital Media Awards',

  // ── Hide — defunct, region-specific noise, or non-award editorial lists ─────
  'cristal festival':                             null,
  'global cristal awards':                        null,
  'mindshare china':                              null,
  'mindshare china -- 2025 archive':              null,  // belt-and-suspenders before normalise strips year
  'asian marketing effectiveness & strategy awards (ames)': null,
  'asian marketing effectiveness':                null,
  'mma smarties china':                           null,  // China-specific program, out of scope
  'cmo power list':                               null,  // editorial list, not an awards show
}

/**
 * Normalise and alias a raw KB show name for use in show pickers.
 * Returns the canonical display name, or null if the show should be hidden.
 *
 * Usage in show_raw extraction:
 *   const name = normaliseKbShow(raw)
 *   if (name === null) skip  // hidden
 *   else use name
 */
export function normaliseKbShow(raw: string): string | null {
  if (!raw) return null
  // 1. Take only the segment before the first pipe ("Show | YEAR: ... | AWARD: ..." → "Show")
  const firstSegment = raw.split(/\s*\|\s*/)[0].trim()
  // 2. Strip trailing year e.g. "Cannes Lions 2024" → "Cannes Lions"
  const yearStripped = firstSegment.replace(/\s+20\d{2}(\s.*)?$/, '').trim()
  // 3. Check alias BEFORE separator strip — required for hyphenated names like "Digital A-List"
  //    where the separator strip would incorrectly produce "Digital A"
  const preSepLower = yearStripped.toLowerCase()
  if (preSepLower in KB_SHOW_ALIASES) return KB_SHOW_ALIASES[preSepLower]  // null = hide
  // 4. Strip after common separator chars (handles "Cannes Lions - Film" → "Cannes Lions")
  const cleaned = yearStripped.replace(/\s*[-–—:\/]\s*.*$/, '').trim()
  // 5. Reject anything too short or containing structural noise
  if (cleaned.length <= 3 || cleaned.includes('{') || cleaned.includes('}')) return null
  // 6. Check alias again on the cleaned name
  const lower = cleaned.toLowerCase()
  if (lower in KB_SHOW_ALIASES) return KB_SHOW_ALIASES[lower]
  return cleaned
}
