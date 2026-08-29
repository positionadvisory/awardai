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
 * Last verified pass: 14 June 2026 (Ben Royalcondit) — SABRE Awards EMEA + North America added
 * =============================================================================
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ShowConfidence = 'verified' | 'partial' | 'needs_check'

/**
 * WHICH RULE an eligibility window expresses. Added 7 Aug 2026: the window used
 * to be implicitly first-publication-only, so storing any other kind of window in
 * it would have made the planner confidently call eligible work INELIGIBLE, which
 * is strictly worse than "not checked". Only FIRST_PUBLICATION is evaluable
 * against the single first-aired date the planner collects; every other rule needs
 * data we do not hold, and the engine refuses to render a verdict for those (see
 * resolveEligibility in lib/planner-v3-engine.ts).
 *
 *  FIRST_PUBLICATION  the work must have FIRST run/published inside the window.
 *                     Evaluable against a first-aired date.
 *  RAN_DURING         the work must have run AT ANY POINT inside the window. A
 *                     campaign that first aired before window.start can still
 *                     qualify, so a first-aired comparison would wrongly reject it.
 *  RESULTS_PERIOD     the RESULTS/effectiveness must fall inside the window
 *                     (Effie-class). Unrelated to when the work first ran.
 *  PERFORMANCE_YEAR   an agency-performance year (AOY-class). There is no campaign
 *                     date at all; see the not_applicable path in the engine.
 *  UNCLASSIFIED       we hold dates but the show's own wording does not state
 *                     which rule they express. NEVER infer one: leave it here and
 *                     the engine reports "cannot be checked" rather than guessing.
 */
export type EligibilityRule =
  | 'FIRST_PUBLICATION'
  | 'RAN_DURING'
  | 'RESULTS_PERIOD'
  | 'PERFORMANCE_YEAR'
  | 'UNCLASSIFIED'

/**
 * Official entry-eligibility window: the earliest and latest dates bounding the
 * work that qualifies for the 2026 cycle, per the show's own entry rules.
 * DISTINCT from the entry DEADLINE (finalDate): the deadline is when entries
 * close; this window bounds the WORK.
 * Populate ONLY from a one-click primary source (the show's rules / entry kit).
 * Absent = NO eligibility claim for that show (never guessed).
 *
 * `rule` is REQUIRED on purpose. It is the whole guard: a new window row cannot be
 * added without stating what kind of window it is, so the compiler blocks the
 * failure mode this field exists to prevent. If the source does not say, the
 * answer is 'UNCLASSIFIED', not the most likely-looking value.
 */
export type EligibilityWindow = {
  start: string   // ISO date: earliest qualifying date under `rule`
  end: string     // ISO date: latest qualifying date under `rule`
  rule: EligibilityRule  // REQUIRED. Which rule start/end express. See EligibilityRule.
  source: string  // primary source + date checked (quote the rule wording verbatim)
}

export type ShowDeadline = {
  show: string
  region: 'Global' | 'APAC' | 'MENA' | 'China' | 'Europe' | 'Australia' | 'North America'
  finalDate: string       // ISO date string: submission deadline (hard cutoff). Empty string = unknown.
  juryDate: string        // ISO date string: jury convenes / results begin
  ceremonyDate: string    // ISO date string: awards ceremony / winners announced
  earlyBird: string       // Human-readable e.g. "Jan 2026"
  standard: string
  final: string
  ceremony: string
  note: string            // Practical notes for the entry team
  confidence: ShowConfidence  // Agent gate: only 'verified' shows proceed in Full Prep
  lastVerified: string    // ISO date this row was last confirmed against official source
  /** Optional. Official entry-eligibility window, whose rule type it carries with it (see EligibilityWindow). Absent = no claim. */
  eligibilityWindow?: EligibilityWindow
}

export type EntryFeeData = {
  base: number
  range: string
  note: string
}

/**
 * 29 Aug 2026: 'unknown' and 'no_published_close' added.
 *
 * getDeadlineUrgency used to return 'ok' with a null date and an empty message
 * for THREE different situations: a show with plenty of time, a show this file
 * has never heard of, and a show whose entry close is genuinely not published.
 * Rendering the last two as 'ok' is an unearned assurance -- "no data" painted
 * identically to "plenty of time" -- and it is the same defect the planner's
 * eligibility roll-up learned twice. Splitting them lets a caller tell the
 * difference; 'ok' now means only what it says.
 */
export type UrgencyLevel =
  | 'critical'
  | 'tight'
  | 'prepare'
  | 'ok'
  | 'past'
  | 'unknown'             // no row in DEADLINES_2026 for this show name
  | 'no_published_close'  // row exists; the show publishes no entry deadline

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
  | { ok: true; show: ShowDeadline; fees: EntryFeeData | null }
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
    note: 'EUR pricing: Early Bird €690/€1,150 (single/campaign), Standard €1,100/€1,830, Late €1,695/€2,825. Late-fee tiers after 5 Mar, 19 Mar, 2 Apr; final 9 Apr. AI/source disclosure and CEO/CMO sign-off are official entry requirements. NEW for 2026: "proof of impact" required -- any stats/results claimed in an entry must be backed by verifiable third-party evidence (analytics, press coverage, certified measurement, client confirmation), part of the Global Integrity Standards introduced after the 2025 DM9 Grand Prix revocation (AI-doctored proof footage, 3 campaigns/12 awards pulled). Entries reportedly fell ~25% in 2026 under the tightened rules. Festival runs 22–26 Jun 2026. 2027 festival dates confirmed 21-25 Jun 2027; entry-open date not yet announced (site offers "register your interest" only, checked 8 Jul 2026).',
    confidence: 'verified', lastVerified: '2026-07-08',
  },
  {
    show: 'D&AD', region: 'Global',
    finalDate: '2026-03-26', juryDate: '2026-04-24', ceremonyDate: '2026-05-14',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '26 Mar 2026', ceremony: 'May 2026',
    note: 'GBP fees: Design £25–£250, Advertising £290–£390, Crafts campaigns up to £980 (VAT excluded). Payment deadline 19 Mar; finalise-submission deadline 26 Mar; physical shipment due 8 Apr. Craft categories: execution judged before idea.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'One Show', region: 'Global',
    finalDate: '2026-02-20', juryDate: '2026-04-16', ceremonyDate: '2026-05-15',
    earlyBird: 'Oct 2025', standard: 'Jan 2026', final: '20 Feb 2026', ceremony: '15 May 2026 (NYC)',
    note: 'Official 2026 schedule: super early 31 Oct 2025, early 12 Dec, regular 23 Jan, extended 6 Feb, final 20 Feb. Finalists announced 16 Apr. Ceremony 15 May NYC. Fees $400–$1,500 by category/deadline, excl. processing.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Awards', region: 'Global',
    finalDate: '2026-02-06', juryDate: '2026-04-09', ceremonyDate: '2026-05-12',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '6 Feb 2026', ceremony: '12 May 2026 (NYC)',
    note: 'Official final deadline 6 Feb 2026. Shortlist 9 Apr; Bronze/Silver/Gold 20 Apr; Grand and Of The Year at ceremony 12 May at Cipriani 25 Broadway, NYC. Fees $525–$1,400 by category/deadline; student $50–$75; Google AI specialty free.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'Effie APAC', region: 'APAC',
    finalDate: '2026-03-09', juryDate: '2026-04-01', ceremonyDate: '2026-09-25',
    earlyBird: 'Jan 2026', standard: 'Feb 2026', final: '9 Mar 2026', ceremony: '25 Sep 2026',
    note: 'Last-chance deadline 9 Mar 2026. Round 1 judging Apr, Round 2 judging May. Awards Gala 25 Sep 2026, Singapore (corrected from 12 Sep; source: apaceffie.com calendar widget, checked 8 Jul 2026). Fees SGD 1,090–2,690. Most rigorous data requirements of any show — allow 4–6 weeks for entry writing. 2026 Heads of Jury named (Kenneth Lim, STB; Natalie Lockwood, NAB); full roster still rolling out.',
    confidence: 'verified', lastVerified: '2026-07-08',
  },
  {
    show: 'Festival of Media APAC', region: 'APAC',
    finalDate: '2026-01-30', juryDate: '2026-03-19', ceremonyDate: '2026-05-07',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '30 Jan 2026', ceremony: '7 May 2026',
    note: 'Asia-Pacific Media Campaign Awards (C Squared / Festival of Media). 2026 cycle CLOSED: open 7 Nov 2025; early 5 Dec £349; standard 2 Jan £389; extended/final 30 Jan £440 (per entry per category, GBP). Shortlist 19 Mar; ceremony 7 May 2026 (virtual). Jury ~80–85% client-side brand marketers. Next (2027) cycle expected to open ~Nov 2026. Verified festivalofmedia.com 23 Jun 2026.',
    confidence: 'verified', lastVerified: '2026-06-23',
  },
  {
    show: 'Campaign Asia Women Leading Change', region: 'APAC',
    finalDate: '2026-03-25', juryDate: '2026-04-27', ceremonyDate: '2026-05-19',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '25 Mar 2026', ceremony: '19 May 2026',
    note: 'Campaign Asia 2026 schedule: early 13 Feb, standard 12 Mar, final 25 Mar (6pm HKT). Shortlist 27 Apr, winners 19 May. Fees HKD 2,990/3,300/3,950 per entry by tier. Individual and company categories.',
    confidence: 'verified', lastVerified: '2026-04-26',
  },
  {
    show: 'MMA Smarties APAC', region: 'APAC',
    finalDate: '2026-07-21', juryDate: '2026-08-21', ceremonyDate: '2026-11-20',
    earlyBird: '25 May 2026', standard: '9 Jul 2026', final: '21 Jul 2026', ceremony: '20 Nov 2026 (JW Marriott Singapore South Beach)',
    note: 'APAC per-entry fees USD: member $365 / $405 / $480, non-member $410 / $450 / $525 (early bird 25 May / on-time 9 Jul / extended 21 Jul). Country programs cheaper (Vietnam/Indonesia/Philippines/Thailand/India ~$240–$350; Cambodia $140–$240). Volume discounts 5–20%. Online screening jury 1–21 Aug; gala 20 Nov, Singapore. APAC and Global cycles are distinct. Verified mmaglobal.com 23 Jun 2026.',
    confidence: 'verified', lastVerified: '2026-06-23',
  },
  {
    show: 'MMA Smarties Global', region: 'Global',
    finalDate: '2026-08-06', juryDate: '2026-09-01', ceremonyDate: '',
    earlyBird: '22 May 2026', standard: '23 Jul 2026', final: '6 Aug 2026', ceremony: 'TBC 2026 (2025 was online, 18 Dec)',
    note: 'SMARTIES X Global per-entry fees USD: member $435 / $495 / $570, non-member $490 / $550 / $625 (early bird 22 May / on-time 23 Jul / extended 6 Aug). Online screening jury 1 Aug–1 Sep. 2026 ceremony date not yet published (2025 was online, 18 Dec). Distinct from APAC regional; separate submission required. Verified mmaglobal.com / 2026 submission guide 23 Jun 2026.',
    confidence: 'verified', lastVerified: '2026-06-23',
  },

  // ── PARTIAL — agent will pause, user must operate manually ──────────────────

  {
    show: 'Clio Entertainment', region: 'Global',
    finalDate: '2026-08-07', juryDate: '2026-09-01', ceremonyDate: '',
    earlyBird: 'Apr 2026', standard: 'Jun 2026', final: '7 Aug 2026', ceremony: 'TBC',
    note: 'Entries open 15 Apr; first deadline 12 Jun; second 10 Jul; final 7 Aug 2026. Results release and ceremony dates listed as "coming soon" — do not schedule against ceremony until confirmed. Fees $400–$1,300 by category/deadline; student $50.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Sports', region: 'Global',
    finalDate: '2026-09-04', juryDate: '2026-11-15', ceremonyDate: '2026-12-08',
    earlyBird: 'Jun 2026', standard: 'Jul 2026', final: '4 Sep 2026', ceremony: '8 Dec 2026 (NYC)',
    note: 'Entry opened 21 Apr 2026. First deadline 5 Jun, second 17 Jul, third 14 Aug, final 4 Sep. Gold/Silver/Bronze/Shortlist mid-Nov. Ceremony 8 Dec at Edison Ballroom NYC. Fees $300–$1,075 by category; student $50–$75. Fee page carries older date labels — recheck before budget lock.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'Clio Creators', region: 'Global',
    finalDate: '2026-08-21', juryDate: '2026-10-01', ceremonyDate: '2026-11-01',
    earlyBird: 'May 2026', standard: 'Jul 2026', final: '21 Aug 2026', ceremony: 'Nov 2026 (LA)',
    note: 'Inaugural 2026 program. Call for entries 26 Mar; 1st deadline 29 May; 2nd 17 Jul; final 21 Aug. Winners Oct, awards show Nov in LA. Fees $100–$600 by medium/deadline. Fee page has a conflicting earlier deadline table — verify before committing budget. Creator Track $100, Brand Track $500, Student free.',
    confidence: 'partial', lastVerified: '2026-04-26',
  },
  {
    show: 'ANDY Awards', region: 'Global',
    finalDate: '2026-03-17', juryDate: '2026-04-20', ceremonyDate: '2026-05-20',
    earlyBird: 'Feb 2026', standard: 'Mar 2026', final: '17 Mar 2026', ceremony: '20 May 2026 (NYC)',
    note: 'Opened 1 Dec 2025; early deadline 11 Feb; final deadline 17 Mar. Winners announced 20 Apr. Best in Show/special recognition celebration 20 May 2026 NYC. Fees $1,250–$2,000+ by fee type/distinction; +8% processing. Categories: IDEA, CRAFT, BRAVERY, RESET, PSA/SOCIAL GOOD, STUDENT. 2025 GRANDY (Best in Show): "Meet Marina Prieto" by DAVID Madrid for JCDecaux. ⚠️ Win rate benchmarks NOT AVAILABLE — ANDY Awards does not publish aggregate entry totals, shortlist counts, or win rates on any official channel. Win-rate benchmarks are estimates only — do not use in client-facing materials without caveat.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'New York Festivals Advertising Awards', region: 'Global',
    finalDate: '2026-05-08', juryDate: '2026-06-08', ceremonyDate: '2026-06-15',
    earlyBird: 'Feb 2026', standard: 'Apr 2026', final: '8 May 2026', ceremony: '15 Jun 2026',
    note: 'Live URL: nyfadvertising.com (newyorkfestivals.com/advertising returns 404 — do not use). Entries open 13 Jan; early 27 Feb; official 23 Apr; final 8 May; last extended 15 May. Shortlists 8 Jun, winners 15 Jun 2026. Single/Single Plus/Campaign fees $600–$1,500. Jury: 350+ members (Shortlist + Executive + specialty juries). 2025 trophy counts: 1 Best of Show, 8 Grand Awards, 57 Gold, 68 Silver, 114 Bronze (248 total). Geographic reach: 40+ countries shortlisted in 2025; Germany top, then USA, Canada, South Korea. NYF Cristal Village Award runs as a sub-category within NYFA (2026 status unconfirmed — verify with NYF). ⚠️ Entry totals not published — win-rate benchmarks are estimates; do not use in client-facing materials without caveat.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'Dubai Lynx', region: 'MENA',
    finalDate: '2026-01-22', juryDate: '2026-10-07', ceremonyDate: '2026-10-08',
    earlyBird: 'Dec 2025', standard: 'Jan 2026', final: '22 Jan 2026', ceremony: '8 Oct 2026, Emirates Golf Club, Dubai',
    note: 'MENA\'s premier show; Cannes Lions affiliate (Lions by Informa). Entries opened 9 Oct 2025; late fee after 11 Dec; second fee tier after 15 Jan; final deadline 22 Jan. ⚠️ CEREMONY DATE CORRECTED: original Apr 1 date was wrong — ceremony officially moved to 8 Oct 2026, Emirates Golf Club, Dubai (announced 28 Apr 2026; source: communicateonline.me + dubailynx.com homepage). ⚠️ JURY DATE CORRECTED (checked 8 Jul 2026): no source supports a 1 Sep judging date; the official key-dates page lists only the 8 Oct ceremony, with a global jury dinner 7 Oct and Young Creatives competition 4-6 Oct — juryDate set to 7 Oct (week-of-ceremony) as the closest supportable date. No 2026 winner statistics exist yet — awards have not happened. ⚠️ Re-pull all win rate benchmarks after 8 Oct 2026. Fees $575–$1,170 by Lynx/category/deadline. Jury 2026: 10 of 11 category-group Jury Presidents publicly named as of 26 Nov 2025 (Judy John, Marco Venturelli, Josefina Casellas, Yasuharu Sasaki, Guilherme Machado, Laurence Thomson, Zia Mandviwalla, Tash Beecher, Chrissie Hanson, Lerato Songelwa); the 11th (Luxury Lynx) does not appear on the official site — leave unconfirmed, do not use the secondary-press name. First-time representation from Costa Rica, Uganda, Uzbekistan; 20+ markets total. Prior year benchmarks: 2024: 1,676 entries → 361 shortlisted (~21.6%); 2023: 1,862 entries → 404 shortlisted (~21.7%). The ~22% shortlist estimate aligns with prior year data.',
    confidence: 'partial', lastVerified: '2026-07-08',
  },
  {
    show: 'Gerety Awards', region: 'Global',
    finalDate: '2026-05-15', juryDate: '2026-06-16', ceremonyDate: '',
    earlyBird: 'Mar 2026', standard: 'Apr 2026', final: '15 May 2026', ceremony: 'Sep 2026, Paris (exact date TBC)',
    note: 'Full 2026 key dates: open 5 Jan; early bird 13 Mar; standard 17 Apr; final 15 May. Shortlist announced 16 Jun 2026. Winners cocktail September 2026, Paris — exact date TBC (revisit Jul/Aug 2026). Single/campaign fees €340–€750 by deadline. Judged exclusively by female-identifying jury (all 2026 Grand Jury members are women — founding premise of award). Official organiser name: The Gerety Awards (registered: 13 rue Ernest Lefevre, 75020 Paris, France). Win rates and PR values require benchmarking.',
    confidence: 'partial', lastVerified: '2026-06-03',
  },
  {
    show: 'Epica Awards', region: 'Global',
    finalDate: '2026-10-30', juryDate: '2026-11-25', ceremonyDate: '2026-12-15',
    eligibilityWindow: { start: '2024-07-01', end: '2026-11-15', rule: 'UNCLASSIFIED', source: 'epica-awards.com/enter rule 1, checked 17 Jul 2026: work used/published/broadcast 1 Jul 2024-15 Nov 2026. RULE UNCLASSIFIED 7 Aug 2026: the quoted wording says "used/published/broadcast", NOT "first" (contrast LIA below, which does say "first"), and the span is 28 months, both consistent with RAN_DURING rather than FIRST_PUBLICATION. Re-source rule 1 verbatim from epica-awards.com/enter and set the rule; until then the engine refuses a verdict rather than comparing a first-aired date against a window that may not be a first-publication window.' },
    earlyBird: '1 Sep 2026', standard: '4 Oct 2026', final: '30 Oct 2026 (late entry +10%, 19-30 Oct)', ceremony: '15 Dec 2026 (final results 16 Dec)',
    note: 'Added 17 Jul 2026 (surfaced prepping the Lorenz Langgartner/Serviceplan sales call — Eurobest + Epica had show_profiles but no deadline row, blocking Full Prep). Official "Key dates 2026" section live-checked 17 Jul 2026 at epica-awards.com/enter (source of every date above): early bird period ends 1 Sep; normal entry period ends 4 Oct; late entry (+10% surcharge, no separate later fee tier) runs 19–30 Oct — 30 Oct is the hard final cutoff, used as finalDate; shortlist publication 25 Nov (used as juryDate, the closest analog to a jury/results date this show publishes); ceremony 15 Dec; final results 16 Dec. ⚠️ CORRECTION vs the sales-prep session\'s working note: a "deadline extended until November 2" article surfaced in search is a 2020-dated historical Epica news post (byline Mark Tungate, 2020-10-16), not a 2026 notice — do not carry that November date forward. Judged exclusively by press/journalists (Epica\'s founding distinction vs peer-judged shows); organiser Maydream/Epica, Paris; entries accepted worldwide. Eligibility window per official rules: work used/published/broadcast 1 Jul 2024–15 Nov 2026 (an eligibility bound, not the entry deadline — do not confuse with finalDate). Canonical platform name is "Epica Awards" (confirmed live 17 Jul 2026: show_profiles id 58, SHOW_CATEGORIES key, SHOW_KEYWORD_MAP target all agree); the bare "Epica" string is only a legacy non-canonical show_rate_facts label (ids 27-28, ledger-flagged separately, unrelated to this row). show_rate_facts ids 27-28 = NONE_PUBLISHED (ledger §L11), so no win-rate/shortlist-rate figure is added here. Official Pricing section (same page) also gives sourced 2026 entry fees — flat company registration €200 (early-bird period figure not separately stated) + per-entry Print €339 / Film & Radio €390 / Alternative & Digital €439 / Integrated €649 — NOT added to ENTRY_FEES this pass: the fee is entry-type-based, not deadline-tiered, so a single canonical "base" needs a product call on which type to anchor; flagged as a follow-up, full sourced figures kept here for whoever does that pass.',
    confidence: 'verified', lastVerified: '2026-07-17',
  },
  {
    show: 'Eurobest', region: 'Europe',
    finalDate: '2026-10-15', juryDate: '', ceremonyDate: '',
    earlyBird: 'No tier is named early bird. Fee until 17 Sep 2026', standard: 'Fee after 17 Sep 2026; third tier after 1 Oct 2026', final: '15 Oct 2026', ceremony: 'No 2026 ceremony date published',
    note: 'DATES FILLED 29 Aug 2026 from dynamic_shows row 1, verified 24 Aug 2026 against eurobest.com/support/dates-and-fees (ledger O1a + O2e). Entries OPENED 20 Aug 2026. ENTRY DEADLINE Thu 15 Oct 2026, the only entry deadline on the page. The 17 Sep and 1 Oct dates are FEE-TIER BOUNDARIES printed as the fee table column headers, not deadlines. Withdrawal/refund date 18 Sep 2026, after which no refund; withdrawing on or before refunds the fee minus a EUR165 processing fee. The 5-19 Nov 2026 "authorisation to submit" window is an approvals process, not a materials deadline. Eligibility 1 Aug 2025-30 Sep 2026, which ENDS FIFTEEN DAYS BEFORE entry closes, so work first running in early October is ineligible while entry is still open; not added as an eligibilityWindow here because the source wording for the rule type was not re-read this pass and this file refuses to infer one. Fees per entry across 24 tracks: tier 1 EUR500-700, tier 2 EUR605-805, tier 3 EUR665-865. Organiser page defect, recorded not acted on: the page title still reads "Eurobest 2025 key dates and fees" while every body date is 2026. Prior note follows. Added 17 Jul 2026 (surfaced prepping the Lorenz Langgartner/Serviceplan sales call — Eurobest + Epica had show_profiles but no deadline row, blocking Full Prep). Live-checked eurobest.com/support/dates-and-fees 17 Jul 2026: page still serves "Eurobest 2025 key dates and fees" (entries opened 14 Aug 2025; late fee after 18 Sep; second late fee after 2 Oct; deadline 16 Oct 2025; ceremony 4 Dec 2025) — 2026 dates NOT yet posted, so finalDate/juryDate/ceremonyDate are left blank (empty string = unknown, per file convention) rather than guessed. The month-level framing above is the 2025 cadence only, for planning context — re-check eurobest.com before running Full Prep on this show. Cannes Lions affiliate (Lions by Informa), Europe\'s regional edition. Canonical platform name is "Eurobest" (confirmed live 17 Jul 2026: show_profiles id 57, SHOW_CATEGORIES key, SHOW_KEYWORD_MAP target all agree — no name-drift issue on this show). ⚠️ show_rate_facts ids 29-31 already hold sourced win/shortlist rates (ledger §L11): shortlist_rate 20.00% FESTIVAL_STATED standing, win_rate 9.10%/9.02% SOURCED 2023/2024 — a WIN_RATES-style "Eurobest: 9" figure anywhere in this file would be the known metric-confusion flag (the 9 matches the real win rate, mislabeled as the shortlist rate); confirmed none present in this file as of this edit. No 2026 entry fee published yet either (2025 fee table was per-award, €490–€845 depending on category and deadline tier) — leaving ENTRY_FEES unset until 2026 figures post.',
    confidence: 'verified', lastVerified: '2026-08-24',
  },

  // ── NEEDS CHECK — agent will pause, user must operate manually ──────────────

  {
    show: 'PRCA UK Awards', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Typically ~16 Jun (based on 2025)', standard: 'Typically ~14 Jul', final: 'Typically ~14 Jul — 2026 date not yet published', ceremony: 'Typically ~Nov (London); 2026 date TBC',
    note: 'PRCA UK Awards (National Awards) — flagship programme of the Public Relations and Communications Association, the world\'s largest PR professional body. 2026 entries confirmed open May 2026; specific deadlines and ceremony not yet published. 2025 pattern: early bird 16 Jun, final 14 Jul, finalists 22 Sep, individual interviews 27 Sep, ceremony 15 Nov (London). Entry fees not published on official pages — DARE regional proxy ~£150-285+VAT is directional only; UK flagship likely higher. Verify fees at prca.global before budgeting. ~26 categories (2025): campaign awards (19) + individual + team/consultancy (banded by fee income: Small 2m or under, Medium 2.01-7.5m, Large over 7.5m). PRCA runs a portfolio of programmes — also see PRCA APAC Awards, Digital Awards, DARE (regional), Public Affairs Awards, Platinum Awards.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'SABRE Awards Asia-Pacific', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Closed — was 8 May 2026 (2026 cycle)', standard: '', final: 'Closed — late deadline was 1 Jun 2026 (2026 cycle)', ceremony: 'APAC ceremony date/city not confirmed; 2027 dates TBC',
    note: 'SABRE Awards Asia-Pacific — APAC regional edition of the SABRE Awards (Superior Achievement in Branding, Reputation & Engagement), run by PRovoke Media (formerly The Holmes Report). 13th edition in 2026. Part of the global SABRE family; APAC winners are eligible for elevation to the Global SABRE (top 40 campaigns worldwide from 5,000+ total entries). 2026 cycle: CLOSED — early deadline 8 May 2026, late deadline 1 Jun 2026. 2027 dates not yet published. Entry fees: ~US$475–650+ (basic entry includes 3 category selections; each additional category US$125; late fees apply). Category architecture is matrixed: select Practice Area + Industry Sector + Geographic simultaneously. Industry Sector = client\'s sector, not campaign topic — e.g., a sustainability campaign for a tech company enters Technology. IN2 SABRE sub-competition requires a single genuine piece of earned coverage as anchor (paid content excluded). Diamond SABRE rewards long-term reputation programmes. Budget disclosure optional but valued. No membership requirement. WARC partnership: SABRE case studies published as effectiveness exemplars.',
    confidence: 'needs_check', lastVerified: '2026-06-05',
  },
  {
    show: 'Global SABRE Awards', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'No direct entry — qualify via regional SABRE (e.g., SABRE Awards Asia-Pacific)', standard: '', final: 'No direct entry deadline', ceremony: '2026 ceremony date/city TBC — 2025 was 3 Nov, Chicago (at PRovoke Global Summit)',
    note: 'Global SABRE Awards — worldwide capstone of the SABRE Awards programme by PRovoke Media. Honours the top 40 PR campaigns globally, selected from all regional SABRE competitions (EMEA, North America, APAC, South Asia, LatAm, Africa). No direct entry — qualification is via regional competition performance; PRovoke editorial leadership selects the global 40. 5,000+ total regional entries in 2025 produced 40 Global SABRE winners. Widely regarded as the single most prestigious PR-campaign honour in the world. WARC partnership publishes winning case studies as effectiveness benchmarks. Ceremony held at the annual PRovoke Global Summit (city rotates; 2025 was Chicago, 3 Nov). Global Agencies of the Year also recognised. For APAC-based agencies, the pathway is: enter SABRE Awards Asia-Pacific → perform strongly → PRovoke considers elevation to Global 40.',
    confidence: 'needs_check', lastVerified: '2026-06-05',
  },
  {
    show: 'SABRE Awards EMEA', region: 'Europe',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Closed — was 19 Dec 2025 (midnight GMT, 2026 cycle)', standard: '', final: 'Closed — extended deadline was 20 Feb 2026 (midnight GMT, 2026 cycle)', ceremony: 'Ceremony complete — 21 May 2026, The Brewery, London; 2027 dates TBC',
    note: 'SABRE Awards EMEA — PRovoke Media\'s premier regional PR awards for Europe, Middle East and Africa (Superior Achievement in Branding, Reputation and Engagement). The largest dedicated PR awards programme in EMEA by entry volume: 2,000+ entries, ~400 finalists (~20% shortlist rate — festival-stated). 141 categories: 22 geographic/country sub-regions, 26 industry sectors, 33 practice areas, 6 Diamond SABRE, 54 IN2 SABRE. Paul Holmes (PRovoke Media founder) chairs the jury; 75 jurors: genuinely pan-European with strong Africa representation — approximately 20–25% UK, with Nordics, DACH, Eastern Europe, and Africa collectively outweighing UK representation. Jury announced after entries close. Entry fees: $475 basic (1 practice area + 1 industry sector + 1 international category); $125 per additional selection; $250 late surcharge. 2026 cycle CLOSED — early 19 Dec 2025, final 20 Feb 2026, ceremony 21 May 2026 (The Brewery, London). 2027 dates not yet published. Judging criteria (festival-stated): Impact, Creative Problem-Solving, Strategic Insight, Innovative Approaches, Executional Excellence. What wins: business impact first — results hierarchy runs media coverage (floor) → engagement → attitudinal change → behavioural change + commercial outcomes (ceiling). AVE and impressions-only reporting explicitly penalised. Misaligned objectives and results is the most common failure mode. Diamond SABRE (CEO, Company, Brand-Building, Measurement) and IN2 SABRE (single earned coverage anchor required) carry specific bar. WARC partnership: winning case studies published on warc.com. Independent agencies win regularly.',
    confidence: 'needs_check', lastVerified: '2026-06-14',
  },
  {
    show: 'SABRE Awards North America', region: 'North America',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Closed — was 19 Dec 2025 (midnight PST, 2026 cycle)', standard: '', final: 'Closed — deadline was 13 Feb 2026 (midnight PST, 2026 cycle)', ceremony: 'Ceremony complete — 5 May 2026, Cipriani 42nd Street, New York; 2027 dates TBC',
    note: 'SABRE Awards North America — PRovoke Media\'s flagship North American PR awards (Superior Achievement in Branding, Reputation and Engagement). Widely regarded as the de facto prestige benchmark for the US PR industry. 2,000+ entries annually. 67 categories: 3 international, 29 practice areas, 26 industry sectors, 6 Diamond SABRE, 4 Silver SABRE. Paul Holmes chairs; 45 jurors (~85–90% US-based): agency leaders from FleishmanHillard, Golin, Weber Shandwick, Ketchum, MSL, Burson, Praytell, Bospar, M Booth; in-house executives from Honda, Walmart, L\'Oréal, PepsiCo, JetBlue, Intuit, Mondelez, Abbott. PR Council represented. Jury published ~3 weeks before entry deadline. 2026 Best in Show: MSL for Always × Tampax ("The Flow Must Go On"). Entry fees: $525 basic (1 practice area + 1 industry sector + 1 international category); $125 per additional selection; $250 late surcharge. 2026 cycle CLOSED — early 19 Dec 2025, final 13 Feb 2026, ceremony 5 May 2026 (Cipriani 42nd Street, New York). 2027 dates not yet published. Judging framework identical to SABRE EMEA: business impact over media reach, behavioural and commercial outcomes at top of results hierarchy, AVE and impressions-only reporting discouraged. Diamond and Silver SABRE categories carry a higher bar. International categories: Global Campaign (10+ markets), Multimarket Campaign, Canadian Campaign. WARC partnership publishes winning case studies on warc.com.',
    confidence: 'needs_check', lastVerified: '2026-06-14',
  },
  {
    show: 'ICCO Global Awards', region: 'Global',
    finalDate: '2026-08-28', juryDate: '2026-09-15', ceremonyDate: '2026-11-12',
    earlyBird: '15 Jun 2026 (PASSED) — EUR250 member / EUR350 non-member', standard: 'No middle tier; two tiers only', final: '28 Aug 2026 — EUR300 member / EUR400 non-member', ceremony: '12 Nov 2026, Milan',
    note: 'DATES FILLED 29 Aug 2026 from dynamic_shows row 16, verified 28 Aug 2026 by both raw fetch and a rendered browser read of iccoglobal.com/global-awards/. The 2026 cycle CLOSED Fri 28 Aug 2026, so this row is deliberately past-dated rather than blank: a closed cycle with a real date is honest, a blank one reads as no information. Jury evaluation 15-25 Sep 2026 (juryDate holds the phase start). Shortlist 1 Oct 2026. Ceremony 12 Nov 2026, Milan. Fees are TWO tiers only, EUR250-400; the 2024 three-tier table with a EUR400/500 top tier DOES NOT EXIST in 2026. DOMAIN: the canonical page is iccoglobal.com/global-awards/; the old awards.iccopr.com microsite is frozen on the 2024 cycle and still serves 2024 fees, so any scraper keyed on it returns two-cycle-old figures forever. Eligibility Jan 2025-Apr 2026, which ends FOUR MONTHS BEFORE entry closed; not added as an eligibilityWindow because the rule type was not established. Prior note follows. ICCO Global Awards — annual global PR awards run by ICCO (International Communications Consultancy Organisation), the umbrella federation of 30+ national PR associations. Active since 2015. Open globally — PR consultancies, freelancers, in-house teams, digital agencies, and media owners; ICCO membership not required. Judged purely on effectiveness and results (founding charter). Ceremony held at the ICCO Global Summit (city rotates; 2025 was Mumbai). 30+ categories across campaign, specialist, industry, geographic (Europe / APAC+MEA), and consultancy-performance tracks. Entry fees (2024): €250–500 EUR depending on membership status and deadline tier (early bird €250 member / €350 non-member; final €400 / €500); 2025/2026 fees unconfirmed. Jury: ~20 senior global leaders (2025), diverse EMEA/APAC/LATAM representation. Winner patterns: independent and mid-size consultancies from non-Anglo markets dominate — Lounge Group (Europe), Gambit (AMEA), Netprofile Finland, Kurio. Holding companies do not dominate. Date volatility warning: 2025 entry window moved ~2 months earlier vs 2024 — monitor iccopr.com/global-awards/ for 2026 announcement.',
    confidence: 'needs_check', lastVerified: '2026-06-05',
  },
  {
    show: 'PRCA APAC Awards', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '2026-04-23',
    earlyBird: 'Early bird closed 5 Dec 2025 (2026 cycle)', standard: '', final: 'Closed — 6 Feb 2026 (2026 cycle complete)', ceremony: '~23 Apr 2026 (location unconfirmed; likely Singapore)',
    note: 'PRCA APAC Awards — Asia-Pacific arm of the PRCA awards portfolio. 2026 cycle: early bird closed 5 Dec 2025; entry deadline 6 Feb 2026; judging panel announced ~25 Feb 2026; ceremony ~23 Apr 2026 (inferred from winner social post — location unconfirmed). 2027 cycle dates not yet published. Entry fees not publicly available — contact PRCA APAC chapter. Category list not confirmed from primary source; approximate list in platform is based on PRCA programme structure. Small Consultancy of the Year and individual tracks confirmed. Most relevant PRCA programme for Asia-based agencies.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'Loeries', region: 'MENA',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: 'Typically ~March (15% off)', standard: 'Through ~June', final: 'Typically early July — 2026 dates TBC', ceremony: 'Typically late Sep / early Oct (Creative Week)',
    note: 'The Loerie Awards — premier creative award for Africa and the Middle East (including Türkiye and island territories). Founded 1978; not-for-profit; CEO Preetesh Sewraj. Loeries 2025 completed Creative Week 5–10 Oct 2025, Cape Town (theme: "The Great Hunger"). 2,784 entries from 13 countries. Loeries 2026 entries open as of Jun 2026 — full calendar and fees NOT YET PUBLISHED here. Based on 2025 pattern: early bird (15% off) ~Mar–Apr; standard through ~Jun; late fee (+10%) through ~Jul; Creative Week late Sep / early Oct. 2025 standard fees: $294 single / $444.50 campaign / $219.50 craft (ZAR R4,700/R7,105/R3,505); R500 of each fee is annual membership. Geographic eligibility: work created FOR the Africa/MENA region (Sub-Saharan Africa, MENA, Türkiye, island territories) OR FROM regionally-based companies. Global campaigns merely airing in the region are NOT eligible. WARC Report and World Creative Ranking inclusion. Anonymous audited judging; self-promo capped at Silver. Included in independent rankings: The Odd Number #1 independent agency 2025.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'London International Awards', region: 'Global',
    finalDate: '', juryDate: '2026-09-25', ceremonyDate: '',
    eligibilityWindow: { start: '2025-07-01', end: '2026-08-31', rule: 'FIRST_PUBLICATION', source: 'liaawards.com/enter (rules_for_entry + entry_fees), checked 8 Jul 2026: work first released/published/broadcast 1 Jul 2025-31 Aug 2026. Rule classified FIRST_PUBLICATION 7 Aug 2026 on the source\'s own word "first".' },
    earlyBird: '30 Apr 2026 (PASSED — 35% off)', standard: '1 May-30 Jun 2026 (20% off)', final: 'No published close. LIA states "until Entry System Closes" and charges no late fee.', ceremony: 'No ceremony; results announced 28 Sep–5 Oct 2026 online',
    note: '⚠️ finalDate CLEARED 29 Aug 2026. This row carried finalDate 2026-08-31 marked verified, byte-identical to its own eligibilityWindow.end, because the ELIGIBILITY cut-off had been written into the DEADLINE field. The two fields are distinct and this file says so at the EligibilityWindow type. Re-checked live 29 Aug 2026: liaawards.com/enter/rules_for_entry publishes exactly one 31 Aug 2026 date and it is the eligibility bound ("Work released, published or broadcast ... beginning 1st July 2025 through 31st August 2026"); liaawards.com/enter/entry_fees prints the fee ladder as 35% to 30 Apr, 20% 1 May-30 Jun, then "Entry Fees from 1st July 2026 until Entry System Closes" with "No Upload Fees. No Late Fees." No close date is published anywhere on either page. dynamic_shows row 12 reached the same conclusion on 25 Aug and its NULL deadline_date is correct. Consequence of the old value: getDeadlineUrgency returned critical "2 days to deadline" on 29 Aug and would have flipped to "Deadline passed" on 1 Sep while entries were still open, and the same figure reached a customer call and the daily brief as "final entry deadline: Monday, August 31, 2026". LIA 2026 entries open; judging 25 Sep–3 Oct 2026, Encore @ Wynn Las Vegas. Eligibility: work released 1 Jul 2025–31 Aug 2026. Fee tiers CONFIRMED (checked 8 Jul 2026, liaawards.com/enter/entry_fees): 35% early bird through 30 Apr 2026 (PASSED), 20% discount 1 May-30 Jun 2026, full rate 1 Jul 2026 through close 31 Aug 2026. Full per-medium table live on the site (~28 categories, Package Design lowest at $325/$400/$500 through Entertainment & Content Series highest at $975/$1,200/$1,500 across the three tiers). Change fees: USD 250 per entry (credit/attribution), USD 500 per entry (material changes after lock). Results announced online in stages 28 Sep–5 Oct 2026; "Of The Year" titles ~Nov 2026. No physical gala ceremony. 33 media types for 2026 (27 established + 6 new: Sports, Gaming, Cultural Catalyst, Entertainment & Content, Business Transformation, Democracy and Human Rights). 20 Jury Presidents across categories in 2026 (source: Roastbrief; the previously-listed "180+ jurors including 35+ global CCOs" figure could not be re-verified for 2026 and has been dropped). Genuinely global show — no geographic eligibility restriction. Included in WARC Creative 100 Rankings and Drum World Creative Rankings. Independently owned; founder/president Barbara Levy, chairperson Terry Savage (ex-Cannes Lions CEO, correct title is "Chairperson" not "jury president"). LIA founded 1986 — 2026 is the 40th edition (corrected from "40th anniversary 2025-2026," which was wrong).',
    confidence: 'partial', lastVerified: '2026-08-29',
  },
  {
    show: 'ADFEST', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'Closed — 2027 TBC', ceremony: 'Mar 2027, Pattaya (TBC)',
    note: 'ADFEST 2026 ("Human+") completed 19–21 Mar 2026, PEACH, Royal Cliff Hotels, Pattaya, Thailand. 2026 entry deadlines: early bird invoice/confirmation 19 Dec 2025, payment 9 Jan 2026; regular payment + materials final deadline 23 Jan 2026. 2027 cycle dates NOT YET PUBLISHED as of Jun 2026. Based on consistent annual pattern, expect 2027 early bird ~Dec 2026 and final deadline ~Jan 2027. Geographic eligibility: Asia Pacific + MENA only — companies must be based in eligible region. Fees 2026: THB 15,500 / 17,500 / 19,500 (early/regular/late, standard 19 categories); THB 23,000 / 25,000 / 27,000 (INNOVA Lotus + Lotus Roots). ~USD 430–770 depending on tier. 21 Lotus Award categories. Grand Jury President 2026: Yasuharu Sasaki (Global CCO, dentsu). Included in WARC Creative 100 Rankings, Campaign Brief Asia Creative Rankings, Drum World Creative Rankings. Non-profit organiser. Over 1,400 entries in 2026; 56 jurors from 17 cities.',
    confidence: 'needs_check', lastVerified: '2026-06-04',
  },
  {
    show: 'Spikes Asia', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '2026-03-12',
    earlyBird: '', standard: '', final: 'Closed', ceremony: '12 Mar 2026 (Singapore — 2026 cycle complete)',
    note: '2026 cycle fully closed — gala was 12 Mar 2026, The Capitol Theatre, Singapore (India led Grand Prix tally, Leo Mumbai named APAC Agency of the Year, Uzbekistan\'s first-ever Spikes win). 2027 cycle dates NOT YET PUBLISHED as of 8 Jul 2026 (/enter still 404s). Expect 2027 call for entries ~Nov 2026 (2026 jury was announced 11-13 Nov 2025, same window historically brings the next call for entries). Organiser: Asian Advertising Festival (Spikes Asia) Pte Ltd — Lions by Informa (Informa acquired Ascential in 2024; rebrand to "Lions by Informa" is live). Contact: awards@canneslions.com. 2026 fee range was USD $655–$1,005 (standard) / $870–$1,220 (final late) across 25 categories. 2026 What\'s New: new Creative B2B Spike (standalone); Social & Influencer → Social & Creator rename; new sub-categories: Excellence in Image Description, Retail Media, Cultural Engagement. Confirmed 93 named jurors for 2026 cycle (first-ever Jury President from Pakistan, Atiya Zaidi).',
    confidence: 'verified', lastVerified: '2026-07-08',
  },
  {
    show: 'Campaign Asia Agency of the Year', region: 'APAC',
    finalDate: '2026-09-04', juryDate: '2026-10-28', ceremonyDate: '2026-12-08',
    earlyBird: '30 Jun 2026', standard: '30 Jul 2026', final: '4 Sep 2026', ceremony: 'By track: Japan/Korea 25 Nov (Hilton Tokyo); Greater China 1 Dec (Shanghai, venue TBA); SE Asia + ANZ + APAC/Network 8 Dec (Fairmont Singapore)',
    note: '33rd edition (launched 1994); agency-PERFORMANCE award judged by client marketers on written submissions, not a creative-craft show. 2026 live at aoyawards.com for 5 of 6 tracks; SOUTH ASIA STILL ON ITS 2025 CYCLE as of 26 Jun 2026 (do not treat SA as open until its page refreshes; SA bills INR + 18% GST, all other tracks HKD). Eligibility 1 Sep 2025–31 Aug 2026. Per-entry fees (HKD): early bird 30 Jun 3,950 people / 4,780 agency-brand; standard 30 Jul 4,750 / 5,650; final 4 Sep 5,350 / 6,250. Shortlists 28 Oct. Each category has its OWN weighted scoring rubric (loaded to show_profiles 26 Jun 2026); cross-market Network titles use a market-weighted, ownership-scaled point system (awarded Platinum; eligibility min 2 wins incl 1 Gold). Endorsement requires CEO + CFO sign-off plus a wet-signature Letter of Endorsement. 3 new categories for 2026: Agency AI Excellence, MarTech Agency, Most Innovative MarTech Team. Integrity partner: SCS-Invictus. ⚠️ Entry/shortlist/winner volumes NOT published by Campaign — win-rate figures are estimates, not for client-facing use. Organiser: Campaign Asia-Pacific / Haymarket. Separate "AOY Globals" scheme (2020) is a distinct entry type.',
    confidence: 'verified', lastVerified: '2026-06-26',
  },
  {
    show: 'ROI Festival', region: 'Global',
    finalDate: '2026-07-15', juryDate: '2026-07-26', ceremonyDate: '2026-10-16',
    earlyBird: '15 May 2026 (PASSED)', standard: '25 Jun 2026', final: '15 Jul 2026', ceremony: '16 Oct 2026, Shanghai',
    note: '19th edition confirmed. Entries submitted via entry.roifestival.com/en (account activated and live-checked 8 Jul 2026). Schedule: open 1 Apr; early bird 15 May (PASSED); regular 25 Jun; final 15 Jul. Judging: Round 1 (screening) 26 Jul-3 Aug eliminates the bottom 80% by average score; Round 2 8-15 Aug ranks the surviving top 20% into Gold/Silver/Bronze/Nomination; final onsite judging 15 Oct decides Grand Prix live; festival + ceremony 15-16 Oct 2026. Location: Shanghai, China. Organiser: Shanghai ROI Festival Culture Media Co., Ltd. (上海金投赏文化传媒有限公司) — fully independent Chinese organiser, NOT affiliated with Epica. Entry format: written Case (PPT, organizer template requires 6 parts -- Background, Objectives, Creativity, Execution, Result, Analysis -- live-confirmed on the 2026 portal UI, supersedes the 2025 kit\'s 5-part version) or Work (creative work only, no case). Jurors score 3 cross-cutting dimensions each 1-5: Goals & Difficulty 30%, Creativity & Execution 30%, Results 40% (source: 2025/18th-edition official kit + live English "About ROI Awards" page, stable across at least 2 cycles). ⚠️ Fee structure confirmed in RMB from the 2025/18th-edition kit, NOT yet reconfirmed for 2026: Work RMB1,200/1,500/2,300 (early/standard/late); Case non-integration RMB1,400/1,800/2,600; Case creative-integration (e.g. AI categories) RMB2,150/2,750/3,550. 50% fee discount for social-responsibility/sustainability entries. Do not treat these RMB figures as 2026-confirmed until the 2026 kit is published or a real draft entry is priced in the live portal.',
    confidence: 'partial', lastVerified: '2026-07-08',
  },
  {
    show: 'Tangrams', region: 'APAC',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'RETIRED', ceremony: 'N/A',
    note: '⚠️ RETIRED — Tangrams brand fully retired as a standalone program (last referenced ~2021). The Tangrams brand no longer appears in any Spikes Asia official communications. Effectiveness and strategy territory now covered by two distinct Spikes Asia categories: (1) Creative Effectiveness Spike (USD $1,005 standard — highest fee tier; for results-led effectiveness work) and (2) Creative Strategy Spike (USD $810 standard; for strategic planning work). Note correction: previous note referenced "Strategy & Effectiveness Spike" as a combined category — that is not an official Spikes Asia category name. Direct clients to Creative Effectiveness Spike or Creative Strategy Spike by work type.',
    confidence: 'needs_check', lastVerified: '2026-06-03',
  },
  {
    show: 'Cristal Festival', region: 'Global',
    finalDate: '', juryDate: '', ceremonyDate: '',
    earlyBird: '', standard: '', final: 'DEFUNCT', ceremony: 'N/A',
    note: '⚠️ ORIGINAL SHOW DEFUNCT — The original European Cristal Festival (founded 2001 as Méribel Ad Festival; run by Christian Cappe / Cristal Events SA) last ran in December 2016 in Courchevel, France. No editions documented after 2016. No official closure announcement published; brand/LinkedIn went silent by 2019. Three distinct entities now exist under the "Cristal" name: (1) DEFUNCT — original European show (do not use for scheduling); (2) African Cristal Festival — independent APAC/Africa show, currently in its own entry; (3) NYF Cristal Village Award — a sub-category within New York Festivals Advertising Awards, NOT a standalone show (2026 status unconfirmed — see NYF Advertising Awards entry). These are NOT formal replacements for the original; they emerged independently.',
    confidence: 'needs_check', lastVerified: '2026-06-03',
  },
  {
    show: 'Campaign Asia Women to Watch APAC', region: 'APAC',
    finalDate: '2026-07-28', juryDate: '', ceremonyDate: '2026-10-06',
    earlyBird: '8 Jun 2026', standard: '14 Jul 2026', final: '28 Jul 2026', ceremony: '6 Oct 2026',
    note: 'Dedicated site: campaignwomentowatch.com. ⚠️ PAID SUBMISSION — not a free nominations list. Early bird 8 Jun (HKD 3,600), standard 14 Jul (HKD 3,900), final 28 Jul (HKD 4,100). Fees are non-refundable and include one-year Campaign Asia-Pacific membership. Winners announced 6 Oct 2026. Shortlist date not published. Organiser: Campaign Asia-Pacific / Haymarket Asia (wtw@haymarket.asia). Geographic scope: Asia-Pacific; nominees must be based in APAC. ⚠️ Early bird deadline imminent — check each June for opening.',
    confidence: 'verified', lastVerified: '2026-06-03',
  },

  // ── Added 29 Aug 2026 ──────────────────────────────────────────────────────
  // Three shows that carried a live 2026/27 entry window in dynamic_shows and no
  // row here at all, so the product showed their entrants no deadline whatsoever
  // while the cycles were open. Each has a show_profiles row with its show-level
  // NULL row intact, so each resolves its own judge rather than the generic
  // six-dimension fallback. Campaign Agency of the Year UK Awards was the fourth
  // candidate and is deliberately NOT added: it has zero show_profiles rows, so
  // adding it would hand entrants the generic judge, and it is an AOY show, which
  // brings the eight-file AOY parity contract into scope. That one is a build.

  {
    show: 'The Drum Awards Festival', region: 'Global',
    finalDate: '2026-09-03', juryDate: '', ceremonyDate: '2026-11-30',
    earlyBird: '11 Jun 2026 (PASSED) — GBP495 + VAT', standard: '30 Jul 2026 — GBP595 + VAT', final: '3 Sep 2026 — GBP714 + VAT (extended tier, current rate)', ceremony: '30 Nov - 3 Dec 2026, The Drum Labs, London (PR night is 3 Dec)',
    note: 'Added 29 Aug 2026 from dynamic_shows row 4, verified 28 Aug 2026 against thedrumawards.com/live/en/page/faq and /page/terms-and-conditions. Cycle OPEN; the site banner reads "Extended Deadline - Thursday, 3 September, 2026". The earlier 11 Jun and 30 Jul dates were each a real published entry deadline closing its own fee tier; 31 Jul is a FEE-TIER BOUNDARY, not a deadline. Payment cut-off is the entry deadline itself: "Payments must be received by the entry deadline to qualify for judging". Shortlist announced 15 Oct 2026 15:00 BST, held in this note rather than juryDate because a shortlist announcement is not a jury convening date and this file does not file one field as another. PR is a full track with its own jury and its own ceremony night; there is no separate live Drum PR programme (thedrumprawards.com is stale legacy copy reading "now open for 2020"). B2B categories moved out to B2B World Fest. The 2026 PR sub-category list is LOGIN-WALLED and therefore unread, NOT absent; the 2025 awarded set must not be published as 2026. AI DISCLOSURE IS MANDATORY and non-compliance can disqualify: entrants must disclose AI use and "specify the nature and extent of AI involvement and identify any tools used". Amendment fee GBP50 + VAT per request after the deadline; no refunds after it. Ceremony tickets GBP128 + VAT are not an entry cost, do not conflate. Eligibility is CONFLICTED between two organiser sources (FAQ entry rule says campaigns live between September 2025 and September 2026; The Drum news says August 2025), unresolved, so no eligibilityWindow is set here.',
    confidence: 'verified', lastVerified: '2026-08-28',
  },

  {
    show: 'ADCE Awards', region: 'Europe',
    finalDate: '2026-09-25', juryDate: '', ceremonyDate: '2026-11-20',
    earlyBird: 'No tiered pricing. Flat per-entry fee, unusual for this class', standard: 'Flat: EUR250 member countries / EUR450 non-member', final: '25 Sep 2026', ceremony: '20 Nov 2026, DHub Barcelona, during ADCE Creative Week',
    note: 'Added 29 Aug 2026 from dynamic_shows row 23, verified 24 Aug 2026 (ledger O2b). THREE SEPARATE DATES, do not collapse them: entries close Fri 25 Sep 2026; PAYMENT is due 8 Oct 2026; PHYSICAL SUBMISSIONS are due 9 Oct 2026 before 18:00h at the Barcelona office. finalDate holds the entry close only. CITE THE ENTRY PORTAL, NOT THE MARKETING SITE: adceurope.awardhub.org/dates/ prints all four dates with the year, while adceurope.org/awards/ carries only "Entries are now open until September 25th" with no year, which is a surface-choice defect and not a defect in the date. Flat per-entry pricing with no late window: member countries EUR250 standard, EUR200 small agencies up to 10 staff, EUR175 freelancers, EUR125 Ukraine; non-member countries EUR450 / 360 / 315. Plus a 2% card processing fee. Only four national gateway competitions were open as of 13 Aug 2026, and Italy ADCI closes 2 Oct, AFTER ADCE own deadline. The "an ADCE win pays double a national win" line is sourced but scope-bound: the One Club national tier is a closed five-club list (ABS, ADCN, CCA, CCP, LADC) that excludes Hungary, and those are One Club points, not MAKSZ M-Lista points.',
    confidence: 'verified', lastVerified: '2026-08-24',
  },

  {
    show: 'The Indie Awards', region: 'Global',
    finalDate: '2026-12-03', juryDate: '', ceremonyDate: '2027-01-14',
    earlyBird: 'Super early bird GBP150 to 26 Sep 2026; early bird GBP250 to 26 Oct 2026', standard: 'GBP350 after 26 Oct 2026', final: '3 Dec 2026 (published; organizer intends an extension to 7 Dec)', ceremony: '14 Jan 2027, The Hickman, London, 17:00-19:00',
    note: 'Added 29 Aug 2026 from dynamic_shows row 22, verified 27 Aug 2026 against indieawards.global and /how-to-enter-2027. 2027 cycle OPENED 26 Aug 2026. CONFIDENCE IS DELIBERATELY partial, NOT verified, and the reason is the close date rather than the sourcing: 3 Dec 2026 is what the organizer publishes, but Alice Carr at thenetworkone stated by email on 26 Aug 2026 that a pre-planned extension to 7 Dec exists, which is an organizer intention and not a published deadline. The precedent is real: the 2026 cycle published a 3 Dec 2025 close and actually closed 7 Jan 2026, a five-week slip. An extension only ever moves the date LATER, so the published date is a safe floor and is what is stored. Shortlist 5 Jan 2027. thenetworkone members get one free entry. Site defect, do not surface as fact: the published timeline reads "judging starts 10th December 2027", one year off; treat as 2026 for internal planning. Entry fee is intentionally absent from ENTRY_FEES: three conflicting figures exist across cycles and none is promotable until the organizer confirms.',
    confidence: 'partial', lastVerified: '2026-08-27',
  },

]

// ── ENTRY_FEES ────────────────────────────────────────────────────────────────
// Per-show entry fee ranges. ENTRY_FEES.base is the SINGLE canonical entry-fee
// home (the old WIN_RATES.fee duplicate was retired in the win-rate reconciliation,
// Phase 2). Rates now live only in the show_rate_facts store; see lib/rate-facts.ts.

export const ENTRY_FEES: Record<string, EntryFeeData> = {
  'Cannes Lions':           { base: 1275, range: '€690–€2,825 (EUR; category/deadline dependent)', note: 'Canonical fee: Film standard single entry €1,095 × EUR 1.1646 = $1,275 USD (verified ledger B1; canneslions.com dates-and-fees). Late-fee tiers after 5 Mar, 19 Mar, 2 Apr. AI/source disclosure and CEO/CMO sign-off required. Festival 22–26 Jun 2026.' },
  'D&AD':                   { base: 778,  range: '£580 (GBP; Film standard single; VAT excl.)', note: 'Canonical fee: Film standard single entry £580 × GBP 1.341 = $778 USD (verified ledger B1; D&AD 2026 Entry Kit PDF). Supersedes the £390/$523 advertising-tier figure deployed 14 Jun. Payment deadline 19 Mar; finalise deadline 26 Mar; physical shipment 8 Apr. Craft categories: execution judged before idea.' },
  'One Show':               { base: 625,  range: '$475–$900 (USD; category/deadline dependent)', note: 'Canonical fee: Regular Deadline, Single entry, Film/OOH/Print/Social Media = $625 USD (verified live oneshow.org/fees/ 14 Jun 2026). Processing fees excluded. Final deadline 20 Feb 2026.' },
  'Clio Awards':            { base: 675,  range: '$675–$900 (USD; Film, Deadline 1 → Deadline 3)', note: 'Canonical fee: Film, Deadline 1 standard single = $675 USD; rises to $900 by Deadline 3 (verified ledger B1; clios.com entry-fees). Student $50–$75. Google AI specialty category free. Ceremony 12 May NYC.' },
  'Effie APAC':             { base: 800,  range: 'SGD 1,090–2,690', note: 'Most rigorous data requirements. Allow 4–6 weeks for writing.' },
  'Festival of Media APAC': { base: 521,  range: '£349–£440 (GBP; early £349 / standard £389 / final £440)', note: 'Per entry per category. base = standard £389 × GBP 1.341 ≈ $521 USD (FX per ledger B1). Prior base 550 was stale/unsourced. 2026 cycle closed; 2027 fees not yet published. Verified festivalofmedia.com 23 Jun 2026.' },
  'Campaign Asia Women Leading Change': { base: 450,  range: 'HKD 2,990–3,950 (per entry; tier dependent)', note: 'Deadlines 6pm Hong Kong time. Early/standard/final tiers.' },
  'MMA Smarties APAC':      { base: 405,  range: '$365–$525 (USD; member $365/$405/$480, non-member $410/$450/$525 by deadline)', note: 'APAC per-entry fees. base = on-time member ($405). Country programs cheaper (Vietnam etc. ~$240–$350; Cambodia $140–$240). Volume discounts 5–20%. Verified mmaglobal.com 23 Jun 2026.' },
  'MMA Smarties Global':    { base: 495,  range: '$435–$625 (USD; member $435/$495/$570, non-member $490/$550/$625 by deadline)', note: 'SMARTIES X Global per-entry fees. base = on-time member ($495). Distinct from APAC regional. Verified mmaglobal.com / 2026 submission guide 23 Jun 2026.' },
  'Clio Entertainment':     { base: 550,  range: '$400–$1,300 (USD; category/deadline dependent)', note: 'Student $50. Ceremony TBC — confirm before scheduling.' },
  'Clio Sports':            { base: 550,  range: '$300–$1,075 (USD; category/deadline dependent)', note: 'Student $50–$75. Includes NIL category. Ceremony 8 Dec NYC.' },
  'Clio Creators':          { base: 250,  range: '$100–$600 (USD; medium/deadline dependent)', note: 'Creator Track $100, Brand Track $500, Student free. Inaugural 2026 program.' },
  'ANDY Awards':            { base: 1600, range: '$1,250–$2,000+ (USD; +8% processing)', note: 'Fee type/distinction dependent. Ceremony 20 May NYC. ESTIMATE — benchmark with Ben.' },
  'New York Festivals Advertising Awards': { base: 1050, range: '$600–$1,500 (USD; entry type/deadline dependent)', note: 'Live URL: nyfadvertising.com. Shortlist 8 Jun, winners 15 Jun 2026. NYF Cristal Village Award confirmed active 2026 NYFA category (verified nyfadvertising.com/Competition/Categories Jun 2026 — homepage "2025" label is stale). ESTIMATE — win rate benchmarks not confirmed from official statistics.' },
  'Dubai Lynx':             { base: 870,  range: '$575–$1,170 (USD; category/deadline dependent)', note: 'MENA premier show. Cannes Lions affiliate. Ceremony 8 Oct 2026 — re-pull all benchmarks after that date. ESTIMATE until post-Oct 2026 stats available.' },
  'Gerety Awards':          { base: 545,  range: '€340–€750 (EUR; single/campaign and deadline dependent)', note: 'Female jury. Ceremony TBC. ESTIMATE — benchmark with Ben.' },
  'Campaign Asia Agency of the Year': { base: 724,  range: 'HKD 3,950–6,250 per entry (people / agency-brand; tier dependent); South Asia billed INR + 18% GST', note: 'base = standard Agency/Brand single entry HKD 5,650 ≈ USD 724 at HKD peg 7.80 (canonical entry fee). Early bird by 30 Jun: HKD 3,950 (people) / 4,780 (agency/brand). Standard by 30 Jul: HKD 4,750 / 5,650. Final by 4 Sep: HKD 5,350 / 6,250. Fees HKD except South Asia (INR + 18% GST). Source: aoyawards.com + 2026 Entry Kit (verified 26 Jun 2026).' },
  'ROI Festival':           { base: 265,  range: 'RMB1,200-3,550 across Work/Case types and 3 tiers (2025/18th-edition kit); base = RMB1,800 Case-non-integration-standard / 6.80 CNY-per-USD', note: 'Sourced from the 2025/18th-edition official entry kit (Chinese, PDF, held by Ben) -- Work RMB1,200/1,500/2,300; Case non-integration RMB1,400/1,800/2,600; Case creative-integration (e.g. AI) RMB2,150/2,750/3,550 (early/standard/late). 50% discount for social-responsibility/sustainability entries. NOT yet reconfirmed for the 2026/19th-edition cycle -- the live 2026 portal fee screen only appears after starting a real draft entry.' },
  'Tangrams':               { base: 400,  range: 'N/A — integrated into Spikes Asia', note: 'Use Spikes Asia Strategy & Effectiveness Spike.' },
  'Spikes Asia':            { base: 631,  range: 'SGD 810 (Film base standard single); SGD 655–1,005 across categories (2026 cycle); 2027 rates pending', note: 'Canonical fee: Film base standard single SGD 810 × SGD 0.7787 = $631 USD (verified ledger B1; spikes.asia dates-and-fees). 2026 cycle closed Mar 2026; 2027 entry kit not yet published. Await 2027 rates at spikes.asia before next cycle.' },
  'SABRE Awards Asia-Pacific': { base: 500, range: 'US$475–US$650+ (USD; basic entry ~US$475–525 includes 3 category selections; +US$125 each additional category; late fees apply after early deadline)', note: 'ESTIMATE — APAC base fee assumed in the US$475–525 band (confirmed for EMEA at US$475, North America at US$525; APAC-specific fee unverified). Effective cost per campaign typically US$600–900+ once add-ons included. No membership discount — same price for all entrants. 2026 APAC cycle CLOSED (late deadline was 1 Jun 2026). Verify 2027 fees at sabre.provokemedia.com/ap when cycle opens.' },
  'Global SABRE Awards':    { base: 0,   range: 'No direct entry fee — qualify via regional SABRE (EMEA: $475 basic; NA: $525 basic; APAC: ~US$475–650+)', note: 'Global SABRE winners are selected by PRovoke from regional competition performance. No separate entry or fee for the global programme. Cost of competing = cost of regional SABRE entry.' },
  'SABRE Awards EMEA':      { base: 475, range: '$475–$725+ USD (basic $475: 1 practice area + 1 industry sector + 1 international category; +$125 each additional selection; +$250 late surcharge)', note: 'Canonical fee: $475 USD basic entry (verified from sabre.provokemedia.com/emea, Jun 2026). Additional category selections $125 each; late fee (after early bird) $250 surcharge. Diamond SABRE and IN2 SABRE selections $125 each. No membership discount — same price for all entrants. Effective campaign cost typically $600–900+ once add-ons included. 2026 cycle CLOSED — verify 2027 fees at sabre.provokemedia.com/emea when cycle opens.' },
  'SABRE Awards North America': { base: 525, range: '$525–$775+ USD (basic $525: 1 practice area + 1 industry sector + 1 international category; +$125 each additional selection; +$250 late surcharge)', note: 'Canonical fee: $525 USD basic entry (verified from sabre.provokemedia.com/am, Jun 2026). Additional category selections $125 each; late fee (after early bird) $250 surcharge. Diamond and Silver SABRE selections $125 each. No membership discount. Effective campaign cost typically $650–950+ once add-ons included. 2026 cycle CLOSED — verify 2027 fees at sabre.provokemedia.com/am when cycle opens.' },
  'ICCO Global Awards':     { base: 300,  range: '€250–€500 (EUR; member vs non-member × early bird / standard / final)', note: 'ESTIMATE — 2024 fee table only. Early bird: €250 member / €350 non-member. Standard: €300 / €400. Final: €400 / €500. 2025/2026 fees not separately verified — 2024 table is best available proxy. ~€100 per-entry saving for ICCO members (28–40% cheaper). Late entry (final deadline) costs 60% more than early bird — strong incentive to enter early. EUR currency. Verify at awards.iccopr.com before budgeting.' },
  'PRCA UK Awards':         { base: 200,  range: 'GBP + VAT (not published for UK Awards; DARE proxy ~£150–£285 member/non-member — flagship likely higher)', note: 'Member vs non-member pricing — PRCA members pay materially less (~45% discount for non-members). 20% charity discount. Some individual/culture categories free. Verify at prca.global before budgeting. ESTIMATE — base fee is a directional proxy only.' },
  'PRCA APAC Awards':       { base: 150,  range: 'Not publicly published', note: 'Contact PRCA APAC chapter for entry fee information. 2026 cycle: early bird 5 Dec 2025, entry deadline 6 Feb 2026.' },
  'Loeries':                { base: 294,  range: '$219.50–$444.50 USD (ZAR R3,505–R7,105; craft/single/campaign)', note: '2025 standard rates: $294 single (R4,700), $444.50 campaign (R7,105), $219.50 craft (R3,505). Early bird 15% off (~Mar–Apr); late fee +10% (~Jun–Jul). R500 of each fee is annual membership to 28 Feb. Young Creatives Award free. 2026 fees not yet confirmed — check loeries.com/fees/ before budgeting.' },
  'London International Awards': { base: 875,  range: '$325-$1,500 across ~28 categories (full-rate tier); anchored on TV & CINEMA Single', note: 'FESTIVAL-STATED (liaawards.com/enter/entry_fees, checked 8 Jul 2026). Full per-medium table live on the site. 3 tiers: 35% early bird thru 30 Apr, 20% off 1 May-30 Jun, full rate 1 Jul-31 Aug close. Change fees: USD 250/entry (credit changes), USD 500/entry (material changes after locking).' },
  'ADFEST':                 { base: 500,  range: 'THB 15,500–27,000 (~USD 430–770; standard/INNOVA × early/regular/late)', note: 'Standard 19 categories: THB 15,500 early / 17,500 regular / 19,500 late. INNOVA Lotus + Lotus Roots: THB 23,000 / 25,000 / 27,000. Film School (sub of New Director Lotus): ~half standard rate. Post-submission changes THB 2,000/request. 2027 cycle fees not yet published. USD conversions approximate at 2026 FX rates.' },
  'Cristal Festival':       { base: 480,  range: 'N/A — show structure changed', note: 'See NYF Advertising Awards (Cristal Village) and African Cristal Festival.' },
  'Campaign Asia Women to Watch APAC': { base: 300,  range: 'HKD 3,600–4,100 (deadline dependent)', note: 'Early bird by 8 Jun: HKD 3,600. Standard by 14 Jul: HKD 3,900. Final by 28 Jul: HKD 4,100. Fees non-refundable; include one-year Campaign Asia-Pacific membership. Source: campaignwomentowatch.com (verified 3 Jun 2026).' },
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Fuzzy-match a show name to the nearest ENTRY_FEES key (the canonical show list).
 */
export function resolveWinRateKey(name: string | null | undefined): string | null {
  if (!name) return null
  if (ENTRY_FEES[name]) return name
  const stripped = name.replace(/\s*(Awards?|Festival|Show|Competition)\s*$/i, '').trim()
  if (ENTRY_FEES[stripped]) return stripped
  const lower = stripped.toLowerCase()
  return (
    Object.keys(ENTRY_FEES).find(
      k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())
    ) ?? null
  )
}

/**
 * Get urgency information for a show's upcoming deadline.
 */
export function getDeadlineUrgency(showName: string | null | undefined): DeadlineUrgency {
  if (!showName) {
    return { level: 'unknown', daysLeft: null, deadlineDate: null, message: 'No show selected.' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lower = showName.trim().toLowerCase()

  // Exact match FIRST. The matcher used to test all three conditions per element
  // in array order, so an earlier row that merely CONTAINED the query beat a
  // later row that equalled it: whichever exact-named show sat lower in the
  // array lost to any substring neighbour above it. Two passes fixes that
  // without touching the tolerance the callers rely on.
  const show =
    DEADLINES_2026.find(d => d.show.toLowerCase() === lower) ??
    DEADLINES_2026.find(
      d =>
        d.show.toLowerCase().includes(lower) ||
        lower.includes(d.show.toLowerCase())
    )

  // Three states that used to be one. See UrgencyLevel.
  if (!show) {
    return {
      level: 'unknown',
      daysLeft: null,
      deadlineDate: null,
      message: `No deadline data on file for "${showName}".`,
    }
  }
  if (!show.finalDate) {
    return {
      level: 'no_published_close',
      daysLeft: null,
      deadlineDate: null,
      message: `${show.show} publishes no entry close date. Check the show's own entry page before planning around one.`,
    }
  }

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

  // SABRE Awards EMEA — map short variants
  'sabre emea':                                   'SABRE Awards EMEA',
  'sabre awards emea':                            'SABRE Awards EMEA',

  // SABRE Awards North America — map short variants
  'sabre na':                                     'SABRE Awards North America',
  'sabre americas':                               'SABRE Awards North America',
  'sabre north america':                          'SABRE Awards North America',
  'sabre awards north america':                   'SABRE Awards North America',

  // ADFEST — map legacy KB variant (KB entries may use mixed case 'AdFest')
  'adfest':                                       'ADFEST',

  // Loeries — map name variants
  'loerie awards':                                'Loeries',
  'the loerie awards':                            'Loeries',
  'loeries awards':                               'Loeries',

  // Effie — unify variants to the platform's canonical Effie program (Session 52).
  // Without these, KB rows like "Effies 2024" normalised to bare "Effies", which
  // matched no canonical show and no SHOW_CATEGORIES key — users who picked it
  // got an empty category list and a dead-end Quick Eval modal.
  'effies':                                       'Effie APAC',
  'effie awards':                                 'Effie APAC',
  'effies apac':                                  'Effie APAC',
  'effie asia pacific':                           'Effie APAC',
  'asia pacific effie awards':                    'Effie APAC',
  'apac effie awards':                            'Effie APAC',

  // New York Festivals — map short variants to the full canonical name (Session 52)
  'new york festivals':                           'New York Festivals Advertising Awards',
  'nyf advertising awards':                       'New York Festivals Advertising Awards',
  'nyf':                                          'New York Festivals Advertising Awards',

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
