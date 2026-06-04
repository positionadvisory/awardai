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
 * Last verified pass: 4 June 2026 (Ben Royalcondit) — ADFEST added
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
    earlyBird: '25 May 2026', standard: '9 Jul 2026', final: '21 Jul 2026', ceremony: 'Sep 2026',
    prValue: 28,
    note: 'Early bird 25 May, on-time 9 Jul, extended/final 21 Jul. Member/non-member fees $365–$525 USD. Early bird saves ~$160 per entry vs extended. APAC and Global cycles are distinct.',
    confidence: 'verified', lastVerified: '2026-05-03',
  },
  {
    show: 'MMA Smarties Global', region: 'Global',
    finalDate: '2026-07-23', juryDate: '2026-08-20', ceremonyDate: '2026-09-15',
    earlyBird: '22 May 2026', standard: '23 Jul 2026', final: '6 Aug 2026', ceremony: 'Sep 2026',
    prValue: 30,
    note: 'Early bird 22 May ($435), on-time 23 Jul ($495), extended 6 Aug ($570). Global program separate from APAC regional. Early bird saves $135 vs extended.',
    confidence: 'verified', lastVerified: '2026-05-03',
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
    note: 'Opened 1 Dec 2025; early deadline 11 Feb; final deadline 17 Mar. Winners announced 20 Apr. Best in Show/special recognition celebration 20 May 2026 NYC. Fees $1,250–$2,000+ by fee type/distinction; +8% processing. Categories: IDEA, CRAFT, BRAVERY, RESET, PSA/SOCIAL GOOD, STUDENT. 2025 GRANDY (Best in Show): "Meet Marina Prieto" by DAVID Madrid for JCDecaux. ⚠️ Win rate benchmarks NOT AVAILABLE — ANDY Awards does not publish aggregate entry totals, shortlist counts, or win rates on any official channel. Benchmarks in WIN_RATES are estimates only — do not use in client-facing materials without caveat.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'New York Festivals Advertising Awards', region: 'Global',
    finalDate: '2026-05-08', juryDate: '2026-06-08', ceremonyDate: '2026-06-15',
    earlyBird: 'Feb 2026', standard: 'Apr 2026', final: '8 May 2026', ceremony: '15 Jun 2026',
    prValue: 38,
    note: 'Live URL: nyfadvertising.com (newyorkfestivals.com/advertising returns 404 — do not use). Entries open 13 Jan; early 27 Feb; official 23 Apr; final 8 May; last extended 15 May. Shortlists 8 Jun, winners 15 Jun 2026. Single/Single Plus/Campaign fees $600–$1,500. Jury: 350+ members (Shortlist + Executive + specialty juries). 2025 trophy counts: 1 Best of Show, 8 Grand Awards, 57 Gold, 68 Silver, 114 Bronze (248 total). Geographic reach: 40+ countries shortlisted in 2025; Germany top, then USA, Canada, South Korea. NYF Cristal Village Award runs as a sub-category within NYFA (2026 status unconfirmed — verify with NYF). ⚠️ Entry totals not published — win rate benchmarks in WIN_RATES are estimates; do not use in client-facing materials without caveat.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'Dubai Lynx', region: 'MENA',
    finalDate: '2026-01-22', juryDate: '2026-09-01', ceremonyDate: '2026-10-08',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '22 Jan 2026', ceremony: '8 Oct 2026, Emirates Golf Club, Dubai',
    prValue: 38,
    note: 'MENA\'s premier show; Cannes Lions affiliate (Lions by Informa). Entries opened 9 Oct 2025; late fee after 11 Dec; second fee tier after 15 Jan; final deadline 22 Jan. ⚠️ CEREMONY DATE CORRECTED: original Apr 1 date was wrong — ceremony officially moved to 8 Oct 2026, Emirates Golf Club, Dubai (announced 28 Apr 2026; source: communicateonline.me + dubailynx.com homepage). Judging also moved to Oct. No 2026 winner statistics exist yet — awards have not happened. ⚠️ Re-pull all win rate benchmarks after 8 Oct 2026. Fees $575–$1,170 by Lynx/category/deadline. Jury 2026: ~65 jurors across 11 category groups (11 jury presidents). First-time representation from Costa Rica, Uganda, Uzbekistan; 20+ markets total. Prior year benchmarks: 2024: 1,676 entries → 361 shortlisted (~21.6%); 2023: 1,862 entries → 404 shortlisted (~21.7%). WIN_RATES.shortlist of 22% aligns with prior year data.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'Gerety Awards', region: 'Global',
    finalDate: '2026-05-15', juryDate: '2026-06-16', ceremonyDate: '',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '15 May 2026', ceremony: 'Sep 2026, Paris (exact date TBC)',
    prValue: 35,
    note: 'Full 2026 key dates: open 5 Jan; early bird 13 Mar; standard 17 Apr; final 15 May. Shortlist announced 16 Jun 2026. Winners cocktail September 2026, Paris — exact date TBC (revisit Jul/Aug 2026). Single/campaign fees €340–€750 by deadline. Judged exclusively by female-identifying jury (all 2026 Grand Jury members are women — founding premise of award). Official organiser name: The Gerety Awards (registered: 13 rue Ernest Lefevre, 75020 Paris, France). Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },

  // ── NEEDS CHECK — agent will pause, user must operate manually ──────────────

  {
    show: 'PRCA UK Awards', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Typically ~16 Jun (based on 2025)', standard: 'Typically ~14 Jul', final: 'Typically ~14 Jul — 2026 date not yet published', ceremony: 'Typically ~Nov (London); 2026 date TBC',
    prValue: 25,
    note: 'PRCA UK Awards (National Awards) — flagship programme of the Public Relations and Communications Association, the world''s largest PR professional body. 2026 entries confirmed open May 2026; specific deadlines and ceremony not yet published. 2025 pattern: early bird 16 Jun, final 14 Jul, finalists 22 Sep, individual interviews 27 Sep, ceremony 15 Nov (London). Entry fees not published on official pages — DARE regional proxy ~£150–285+VAT is directional only; UK flagship likely higher. Verify fees at prca.global before budgeting. ~26 categories (2025): campaign awards (19) + individual + team/consultancy (banded by fee income: Small ≤£2m, Medium £2.01–7.5m, Large >£7.5m). PRCA runs a portfolio of programmes — also see PRCA APAC Awards, Digital Awards, DARE (regional), Public Affairs Awards, Platinum Awards.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'PRCA APAC Awards', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '2026-04-23',
    earlyBird: 'Early bird closed 5 Dec 2025 (2026 cycle)', standard: '', final: 'Closed — 6 Feb 2026 (2026 cycle complete)', ceremony: '~23 Apr 2026 (location unconfirmed; likely Singapore)',
    prValue: 20,
    note: 'PRCA APAC Awards — Asia-Pacific arm of the PRCA awards portfolio. 2026 cycle: early bird closed 5 Dec 2025; entry deadline 6 Feb 2026; judging panel announced ~25 Feb 2026; ceremony ~23 Apr 2026 (inferred from winner social post — location unconfirmed). 2027 cycle dates not yet published. Entry fees not publicly available — contact PRCA APAC chapter. Category list not confirmed from primary source; approximate list in platform is based on PRCA programme structure. Small Consultancy of the Year and individual tracks confirmed. Most relevant PRCA programme for Asia-based agencies.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'Loeries', region: 'MENA',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Typically ~March (15% off)', standard: 'Through ~June', final: 'Typically early July — 2026 dates TBC', ceremony: 'Typically late Sep / early Oct (Creative Week)',
    prValue: 35,
    note: 'The Loerie Awards — premier creative award for Africa and the Middle East (including Türkiye and island territories). Founded 1978; not-for-profit; CEO Preetesh Sewraj. Loeries 2025 completed Creative Week 5–10 Oct 2025, Cape Town (theme: "The Great Hunger"). 2,784 entries from 13 countries. Loeries 2026 entries open as of Jun 2026 — full calendar and fees NOT YET PUBLISHED here. Based on 2025 pattern: early bird (15% off) ~Mar–Apr; standard through ~Jun; late fee (+10%) through ~Jul; Creative Week late Sep / early Oct. 2025 standard fees: $294 single / $444.50 campaign / $219.50 craft (ZAR R4,700/R7,105/R3,505); R500 of each fee is annual membership. Geographic eligibility: work created FOR the Africa/MENA region (Sub-Saharan Africa, MENA, Türkiye, island territories) OR FROM regionally-based companies. Global campaigns merely airing in the region are NOT eligible. WARC Report and World Creative Ranking inclusion. Anonymous audited judging; self-promo capped at Silver. Included in independent rankings: The Odd Number #1 independent agency 2025.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'London International Awards', region: 'Global',
    finalDate: '', juryDate: '2026-09-25', ceremonyDate: '',
    earlyBird: '30 Apr 2026 (PASSED — 35% off)', standard: '', final: 'Typically early September — 2026 date TBC', ceremony: 'No ceremony; results announced 28 Sep–5 Oct 2026 online',
    prValue: 45,
    note: 'LIA 2026 entries open; judging 25 Sep–3 Oct 2026, Encore @ Wynn Las Vegas. Eligibility: work released 1 Jul 2025–31 Aug 2026. 2026 super early bird (35% off) through 30 Apr 2026 — PASSED. 2026 final entry deadline NOT YET PUBLISHED (typical pattern: early September; 2025 was ~4–11 Sep). Fees in USD; exact per-medium rates in entry system only — not published on public pages. Change fees: USD 250 per entry (credit/attribution), USD 500 per entry (material changes after lock). Results announced online in stages 28 Sep–5 Oct 2026; "Of The Year" titles ~Nov 2026. No physical gala ceremony. 33 media types for 2026 (27 established + 6 new: Sports, Gaming, Cultural Catalyst, Entertainment & Content, Business Transformation, Democracy and Human Rights). 180+ jurors including 35+ global CCOs. Genuinely global show — no geographic eligibility restriction. Included in WARC Creative 100 Rankings and Drum World Creative Rankings. Independently owned; founder/president Barbara Levy, chairperson Terry Savage (ex-Cannes Lions CEO). 40th anniversary 2025–2026.',
    confidence: 'partial', lastVerified: '2026-06-04',
  },
  {
    show: 'ADFEST', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Closed — 2027 TBC', ceremony: 'Mar 2027, Pattaya (TBC)',
    prValue: 50,
    note: 'ADFEST 2026 ("Human+") completed 19–21 Mar 2026, PEACH, Royal Cliff Hotels, Pattaya, Thailand. 2026 entry deadlines: early bird invoice/confirmation 19 Dec 2025, payment 9 Jan 2026; regular payment + materials final deadline 23 Jan 2026. 2027 cycle dates NOT YET PUBLISHED as of Jun 2026. Based on consistent annual pattern, expect 2027 early bird ~Dec 2026 and final deadline ~Jan 2027. Geographic eligibility: Asia Pacific + MENA only — companies must be based in eligible region. Fees 2026: THB 15,500 / 17,500 / 19,500 (early/regular/late, standard 19 categories); THB 23,000 / 25,000 / 27,000 (INNOVA Lotus + Lotus Roots). ~USD 430–770 depending on tier. 21 Lotus Award categories. Grand Jury President 2026: Yasuharu Sasaki (Global CCO, dentsu). Included in WARC Creative 100 Rankings, Campaign Brief Asia Creative Rankings, Drum World Creative Rankings. Non-profit organiser. Over 1,400 entries in 2026; 56 jurors from 17 cities.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'Spikes Asia', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '2026-03-12',
    earlyBird: '', standard: '', final: 'Closed', ceremony: '12 Mar 2026 (Singapore — 2026 cycle complete)',
    prValue: 55,
    note: '⚠️ 2026 cycle fully closed — gala was 12 Mar 2026, The Capitol Theatre, Singapore. 2027 cycle dates NOT YET PUBLISHED as of 3 Jun 2026 (/enter returns 404). Expect 2027 call for entries ~Oct/Nov 2026 based on historical pattern. Organiser: Asian Advertising Festival (Spikes Asia) Pte Ltd — Lions by Informa (Informa acquired Ascential in 2024; rebrand to "Lions by Informa" is live). Contact: awards@canneslions.com. 2026 fee range was USD $655–$1,005 (standard) / $870–$1,220 (final late) across 25 categories. 2026 What\'s New: new Creative B2B Spike (standalone); Social & Influencer → Social & Creator rename; new sub-categories: Excellence in Image Description, Retail Media, Cultural Engagement.',
    confidence: 'needs_check', lastVerified: '2026-06-03',
  },
  {
    show: 'Campaign Asia Agency of the Year', region: 'APAC',
    finalDate: '2026-09-04', juryDate: '2026-10-28', ceremonyDate: '',
    earlyBird: '30 Jun 2026', standard: '30 Jul 2026', final: '4 Sep 2026', ceremony: 'Late Nov/Early Dec 2026 (venue TBA)',
    prValue: 35,
    note: '2026 cycle fully live at aoyawards.com. Eligibility period: 1 Sep 2025–31 Aug 2026. Early bird 30 Jun (HKD 3,950 people / 4,780 agency); standard 30 Jul (HKD 4,750 / 5,650); final 4 Sep (HKD 5,350 / 6,250). Shortlists announced 28 Oct 2026. Awards presentation late Nov/early Dec 2026. Organiser: Campaign Asia-Pacific / Haymarket Media (contact via haymarket.asia). APAC-wide with market sub-categories: Australia/NZ, Greater China, Japan/Korea, South Asia, Southeast Asia, APAC/Network. Note: separate "AOY Globals" scheme also runs (launched 2020) — distinct entry type.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'ROI Festival', region: 'Global',
    finalDate: '2026-07-15', juryDate: '2026-07-26', ceremonyDate: '2026-10-16',
    earlyBird: '15 May 2026 (PASSED)', standard: '25 Jun 2026', final: '15 Jul 2026', ceremony: '16 Oct 2026, Shanghai',
    prValue: 25,
    note: '19th edition confirmed. English entry portal live at entry.roifestival.com/en. Schedule: open 1 Apr; early bird 15 May (PASSED); regular 25 Jun; final 15 Jul. 1st round judging 26 Jul–3 Aug; 2nd round 8–15 Aug; final onsite judging 15 Oct; festival + ceremony 15–16 Oct 2026. Location: Shanghai, China (historical; not explicitly stated in English portal for 2026). Organiser: Shanghai ROI Festival Culture Media Co., Ltd. (上海金投赏文化传媒有限公司) — fully independent Chinese organiser, NOT affiliated with Epica. Self-described as global reach, originated in China. ⚠️ Fee structure: published in Chinese-language entry handbook only (entry.roifestival.com/en requires login for fee details or download 参赛手册 at roifestival.com/cn). Do not commit budget until fees confirmed.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'Tangrams', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'RETIRED', ceremony: 'N/A',
    prValue: 20,
    note: '⚠️ RETIRED — Tangrams brand fully retired as a standalone program (last referenced ~2021). The Tangrams brand no longer appears in any Spikes Asia official communications. Effectiveness and strategy territory now covered by two distinct Spikes Asia categories: (1) Creative Effectiveness Spike (USD $1,005 standard — highest fee tier; for results-led effectiveness work) and (2) Creative Strategy Spike (USD $810 standard; for strategic planning work). Note correction: previous note referenced "Strategy & Effectiveness Spike" as a combined category — that is not an official Spikes Asia category name. Direct clients to Creative Effectiveness Spike or Creative Strategy Spike by work type.',
    confidence: 'needs_check', lastVerified: '2026-06-03',
  },
  {
    show: 'Cristal Festival', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'DEFUNCT', ceremony: 'N/A',
    prValue: 25,
    note: '⚠️ ORIGINAL SHOW DEFUNCT — The original European Cristal Festival (founded 2001 as Méribel Ad Festival; run by Christian Cappe / Cristal Events SA) last ran in December 2016 in Courchevel, France. No editions documented after 2016. No official closure announcement published; brand/LinkedIn went silent by 2019. Three distinct entities now exist under the "Cristal" name: (1) DEFUNCT — original European show (do not use for scheduling); (2) African Cristal Festival — independent APAC/Africa show, currently in its own entry; (3) NYF Cristal Village Award — a sub-category within New York Festivals Advertising Awards, NOT a standalone show (2026 status unconfirmed — see NYF Advertising Awards entry). These are NOT formal replacements for the original; they emerged independently.',
    confidence: 'needs_check', lastVerified: '2026-06-03',
  },
  {
    show: 'Campaign Asia Women to Watch APAC', region: 'APAC',
    finalDate: '2026-07-28', juryDate: '', ceremonyDate: '2026-10-06',
    earlyBird: '8 Jun 2026', standard: '14 Jul 2026', final: '28 Jul 2026', ceremony: '6 Oct 2026',
    prValue: 25,
    note: 'Dedicated site: campaignwomentowatch.com. ⚠️ PAID SUBMISSION — not a free nominations list. Early bird 8 Jun (HKD 3,600), standard 14 Jul (HKD 3,900), final 28 Jul (HKD 4,100). Fees are non-refundable and include one-year Campaign Asia-Pacific membership. Winners announced 6 Oct 2026. Shortlist date not published. Organiser: Campaign Asia-Pacific / Haymarket Asia (wtw@haymarket.asia). Geographic scope: Asia-Pacific; nominees must be based in APAC. ⚠️ Early bird deadline imminent — check each June for opening.',
    confidence: 'verified', lastVerified: '2026-06-03',
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
    fee: 435,
  },
  'MMA Smarties Global': {
    shortlist: 22, metal: 12, gold: 5, grandprix: 1.0,
    pr: { shortlist: 10000, metal: 40000, gold: 140000, grandprix: 480000 },
    fee: 435,
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
  // ESTIMATE — PRCA does not publish shortlist/metal rates for any programme.
  // Rates estimated from sector-specialist show comparison. PR shows tend to have
  // broader recognition rates than global creative shows.
  // Do not use in client-facing materials without caveat.
  'PRCA UK Awards': {
    shortlist: 30, metal: 15, gold: 5, grandprix: 1,
    pr: { shortlist: 4000, metal: 12000, gold: 40000, grandprix: 120000 },
    fee: 200,
  },
  'PRCA APAC Awards': {
    shortlist: 30, metal: 15, gold: 5, grandprix: 1,
    pr: { shortlist: 3000, metal: 8000, gold: 25000, grandprix: 80000 },
    fee: 150,
  },
  // ESTIMATE — Loeries does not publish shortlist/metal rates.
  // 2,784 entries (2025); Finalist → Bronze → Silver → Gold → Grand Prix structure confirmed.
  // Rates estimated from regional show comparison; do not use in client-facing materials without caveat.
  'Loeries': {
    shortlist: 25, metal: 12, gold: 4, grandprix: 0.5,
    pr: { shortlist: 6000, metal: 20000, gold: 80000, grandprix: 300000 },
    fee: 294,
  },
  // ESTIMATE — LIA does not publish shortlist/metal rates. Tiered structure confirmed
  // (Finalist → Bronze → Silver → Gold → Grand LIA); percentages not released.
  // Rates derived from comparison with comparable global shows (D&AD/One Show tier).
  // Do not use in client-facing materials without caveat.
  'London International Awards': {
    shortlist: 15, metal: 8, gold: 2.5, grandprix: 0.4,
    pr: { shortlist: 10000, metal: 40000, gold: 200000, grandprix: 700000 },
    fee: 800,
  },
  // ESTIMATE — ADFEST does not publish shortlist/metal rates. Derived from 2026 winner
  // analysis (~1,400 entries, 21 categories, multiple Grandes withheld).
  // Do not use in client-facing materials without caveat.
  'ADFEST': {
    shortlist: 20, metal: 9, gold: 3, grandprix: 0.3,
    pr: { shortlist: 8000, metal: 35000, gold: 150000, grandprix: 500000 },
    fee: 500,
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
  'MMA Smarties APAC':      { base: 435,  range: '$365–$525 (USD; early bird $435, on-time $495, extended $570)', note: 'Early bird 25 May saves ~$160 vs extended. Country programs vary $140–$350.' },
  'MMA Smarties Global':    { base: 435,  range: '$435–$570 (USD; early bird $435, on-time $495, extended $570)', note: 'Early bird 22 May. Global program distinct from APAC regional.' },
  'Clio Entertainment':     { base: 550,  range: '$400–$1,300 (USD; category/deadline dependent)', note: 'Student $50. Ceremony TBC — confirm before scheduling.' },
  'Clio Sports':            { base: 550,  range: '$300–$1,075 (USD; category/deadline dependent)', note: 'Student $50–$75. Includes NIL category. Ceremony 8 Dec NYC.' },
  'Clio Creators':          { base: 250,  range: '$100–$600 (USD; medium/deadline dependent)', note: 'Creator Track $100, Brand Track $500, Student free. Inaugural 2026 program.' },
  'ANDY Awards':            { base: 1600, range: '$1,250–$2,000+ (USD; +8% processing)', note: 'Fee type/distinction dependent. Ceremony 20 May NYC. ESTIMATE — benchmark with Ben.' },
  'New York Festivals Advertising Awards': { base: 1050, range: '$600–$1,500 (USD; entry type/deadline dependent)', note: 'Live URL: nyfadvertising.com. Shortlist 8 Jun, winners 15 Jun 2026. NYF Cristal Village Award confirmed active 2026 NYFA category (verified nyfadvertising.com/Competition/Categories Jun 2026 — homepage "2025" label is stale). ESTIMATE — win rate benchmarks not confirmed from official statistics.' },
  'Dubai Lynx':             { base: 870,  range: '$575–$1,170 (USD; category/deadline dependent)', note: 'MENA premier show. Cannes Lions affiliate. Ceremony 8 Oct 2026 — re-pull all benchmarks after that date. ESTIMATE until post-Oct 2026 stats available.' },
  'Gerety Awards':          { base: 545,  range: '€340–€750 (EUR; single/campaign and deadline dependent)', note: 'Female jury. Ceremony TBC. ESTIMATE — benchmark with Ben.' },
  'Campaign Asia Agency of the Year': { base: 420,  range: 'HKD 3,950–6,250 (people / agency; tier dependent)', note: 'Early bird by 30 Jun: HKD 3,950 (people) / 4,780 (agency/brand). Standard by 30 Jul: HKD 4,750 / 5,650. Final by 4 Sep: HKD 5,350 / 6,250. Source: aoyawards.com (verified 3 Jun 2026).' },
  'ROI Festival':           { base: 450,  range: 'Not published in English', note: 'Fees appear in Chinese-language entry handbook only (roifestival.com/cn). Require login at entry.roifestival.com/en or handbook download to obtain. Do not commit budget until fees confirmed.' },
  'Tangrams':               { base: 400,  range: 'N/A — integrated into Spikes Asia', note: 'Use Spikes Asia Strategy & Effectiveness Spike.' },
  'Spikes Asia':            { base: 1000, range: 'Unknown — 2027 cycle not yet open', note: '2026 cycle closed Mar 2026. Await 2027 entry kit.' },
  'PRCA UK Awards':         { base: 200,  range: 'GBP + VAT (not published for UK Awards; DARE proxy ~£150–£285 member/non-member — flagship likely higher)', note: 'Member vs non-member pricing — PRCA members pay materially less (~45% discount for non-members). 20% charity discount. Some individual/culture categories free. Verify at prca.global before budgeting. ESTIMATE — base fee is a directional proxy only.' },
  'PRCA APAC Awards':       { base: 150,  range: 'Not publicly published', note: 'Contact PRCA APAC chapter for entry fee information. 2026 cycle: early bird 5 Dec 2025, entry deadline 6 Feb 2026.' },
  'Loeries':                { base: 294,  range: '$219.50–$444.50 USD (ZAR R3,505–R7,105; craft/single/campaign)', note: '2025 standard rates: $294 single (R4,700), $444.50 campaign (R7,105), $219.50 craft (R3,505). Early bird 15% off (~Mar–Apr); late fee +10% (~Jun–Jul). R500 of each fee is annual membership to 28 Feb. Young Creatives Award free. 2026 fees not yet confirmed — check loeries.com/fees/ before budgeting.' },
  'London International Awards': { base: 800,  range: 'USD (fee varies by medium — check live Entry Kit; not published on public pages)', note: '35% early-bird discount through 30 Apr 2026 (PASSED). Change fees: USD 250/entry (credit changes), USD 500/entry (material changes after locking). ESTIMATE — base fee of USD 800 derived from comparable global shows; verify against live entry system before budgeting.' },
  'ADFEST':                 { base: 500,  range: 'THB 15,500–27,000 (~USD 430–770; standard/INNOVA × early/regular/late)', note: 'Standard 19 categories: THB 15,500 early / 17,500 regular / 19,500 late. INNOVA Lotus + Lotus Roots: THB 23,000 / 25,000 / 27,000. Film School (sub of New Director Lotus): ~half standard rate. Post-submission changes THB 2,000/request. 2027 cycle fees not yet published. USD conversions approximate at 2026 FX rates.' },
  'Cristal Festival':       { base: 480,  range: 'N/A — show structure changed', note: 'See NYF Advertising Awards (Cristal Village) and African Cristal Festival.' },
  'Campaign Asia Women to Watch APAC': { base: 300,  range: 'HKD 3,600–4,100 (deadline dependent)', note: 'Early bird by 8 Jun: HKD 3,600. Standard by 14 Jul: HKD 3,900. Final by 28 Jul: HKD 4,100. Fees non-refundable; include one-year Campaign Asia-Pacific membership. Source: campaignwomentowatch.com (verified 3 Jun 2026).' },
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

  // MMA Smarties — route legacy variants to correct canonical shows
  'mma smarties':                                 'MMA Smarties APAC',
  'mma smarties global':                          'MMA Smarties Global',
  'smarties apac':                                'MMA Smarties APAC',
  'smarties global':                              'MMA Smarties Global',

  // Campaign Asia Women Leading Change (canonical) — map old/short name variants
  'women leading change':                         'Campaign Asia Women Leading Change',
  'campaign asia women leading change':           'Campaign Asia Women Leading Change',

  // Campaign Asia Women to Watch APAC (canonical) — map old/short name variants
  'women to watch apac':                          'Campaign Asia Women to Watch APAC',
  'campaign asia women to watch':                 'Campaign Asia Women to Watch APAC',

  // ADFEST — map legacy KB variant (KB entries may use mixed case 'AdFest')
  'adfest':                                       'ADFEST',

  // Loeries — map name variants
  'loerie awards':                                'Loeries',
  'the loerie awards':                            'Loeries',
  'loeries awards':                               'Loeries',

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
