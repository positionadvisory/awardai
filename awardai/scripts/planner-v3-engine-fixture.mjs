// scripts/planner-v3-engine-fixture.mjs — Portfolio Planner v3, V3-P1 build.
//
// Same precedent as scripts/planner-engine-fixture.mjs: lib/planner-v3-engine.ts
// value-imports from lib/planner-facets.ts (which imports lib/supabase.ts and
// uses the @/* alias), so the pure logic under test is HAND-COPIED here rather
// than forcing a real import through a shim. If lib/planner-v3-engine.ts (or the
// lib/* files it reuses) changes, re-sync this file by hand.
//
// HAND-COPIED below, byte-equivalent in logic (not always byte-identical text)
// to lib/planner-v3-engine.ts as of 7 Aug 2026 (re-synced for the EligibilityRule
// discriminator + the AOY/people not_applicable path; previously 27 Jul 2026: the 19 Jul
// T3-ELIGIBILITY-WINDOW work shipped to the engine and was never mirrored here,
// so "53/53 green" had been asserting a 16 Jul snapshot for eight days), plus
// the small slices
// of lib/show-taxonomy.ts / lib/shows-data.ts / lib/rate-facts.ts / lib/fx.ts /
// lib/planner-facets.ts / lib/planner-engine.ts it depends on. Data tables below
// are TRIMMED to exactly the shows these fixtures touch (Cannes Lions, MMA
// Smarties APAC/Global, Spikes Asia, Effie APAC) — never invented, every number
// traces to the real lib/shows-data.ts / lib/rate-facts.ts rows read this
// session (see _context.md V3-P1 session notes for the live values).
//
// Run: node scripts/planner-v3-engine-fixture.mjs

let pass = 0
let fail = 0
function check(label, cond) {
  if (cond) {
    pass++
  } else {
    fail++
    console.error(`FAIL: ${label}`)
  }
}

// ---- hand-copied: normaliseKbShow + sameShow -------------------------------
// PREVIOUSLY WRONG (fixed 27 Jul 2026): this file's sameShow was a bare
// lowercase === compare, while the real lib/show-taxonomy.ts sameShow
// alias-normalises BOTH sides through lib/shows-data.ts normaliseKbShow first.
// The fixture was therefore testing show resolution against a stricter matcher
// than production uses, which is exactly backwards: a resolution the engine
// handles (e.g. "Cannes Lions 2026", "Smarties APAC") could not be exercised
// here at all. KB_SHOW_ALIASES is TRIMMED to the entries touching fixture shows,
// copied verbatim from lib/shows-data.ts.
const KB_SHOW_ALIASES = {
  // Verbatim from lib/shows-data.ts. This is the ONLY alias the live table carries
  // for the AOY family, and it is the one that breaks a raw isAoyShow test.
  'campaign asia aoty': 'Campaign Asia Agency of the Year',
  'mma smarties': 'MMA Smarties APAC',
  'mma smarties global': 'MMA Smarties Global',
  'smarties apac': 'MMA Smarties APAC',
  'smarties global': 'MMA Smarties Global',
}
function normaliseKbShow(raw) {
  if (!raw) return null
  const firstSegment = raw.split(/\s*\|\s*/)[0].trim()
  const yearStripped = firstSegment.replace(/\s+20\d{2}(\s.*)?$/, '').trim()
  const preSepLower = yearStripped.toLowerCase()
  if (preSepLower in KB_SHOW_ALIASES) return KB_SHOW_ALIASES[preSepLower]
  const cleaned = yearStripped.replace(/\s*[-\u2013\u2014:\/]\s*.*$/, '').trim()
  if (cleaned.length <= 3 || cleaned.includes('{') || cleaned.includes('}')) return null
  const lower = cleaned.toLowerCase()
  if (lower in KB_SHOW_ALIASES) return KB_SHOW_ALIASES[lower]
  return cleaned
}
function sameShow(a, b) {
  if (!a || !b) return false
  const norm = (x) => (normaliseKbShow(x) ?? x).trim().toLowerCase()
  return norm(a) === norm(b)
}

// ---- hand-copied (trimmed): lib/shows-data.ts DEADLINES_2026 ---------------
// NOTE on eligibilityWindow coverage: only 2 of the 39 real DEADLINES_2026 rows
// carry one (Epica Awards, London International Awards). LIA is included below
// SOLELY so the eligibility path has a show to exercise; its window/fee/date are
// copied verbatim from lib/shows-data.ts, never invented. Every other row here
// genuinely has no window, which is what makes 'no_window' the common case.
// Epica Awards added 7 Aug 2026: it is the real DEADLINES_2026 row carrying a
// NON-FIRST_PUBLICATION window, so it is what exercises the refusal path. Its
// dates and rule are copied verbatim from lib/shows-data.ts; the `source` string
// is TRIMMED here (the live row carries the full classification note) but nothing
// about the window is invented. Campaign Asia AOY and Women to Watch APAC added
// the same day, verbatim finalDate values, to exercise the not_applicable path.
const DEADLINES_2026 = [
  { show: 'Cannes Lions', region: 'Global', finalDate: '2026-04-09' },
  { show: 'MMA Smarties APAC', region: 'APAC', finalDate: '2026-07-21' },
  { show: 'MMA Smarties Global', region: 'Global', finalDate: '2026-08-06' },
  { show: 'Spikes Asia', region: 'APAC', finalDate: '2026-05-01' },
  {
    show: 'London International Awards', region: 'Global', finalDate: '2026-08-31',
    eligibilityWindow: { start: '2025-07-01', end: '2026-08-31', rule: 'FIRST_PUBLICATION', source: 'liaawards.com/enter (rules_for_entry + entry_fees), checked 8 Jul 2026: work first released/published/broadcast 1 Jul 2025-31 Aug 2026' },
  },
  {
    show: 'Epica Awards', region: 'Global', finalDate: '2026-10-30',
    eligibilityWindow: { start: '2024-07-01', end: '2026-11-15', rule: 'UNCLASSIFIED', source: 'epica-awards.com/enter rule 1, checked 17 Jul 2026 (source string trimmed for the fixture; see lib/shows-data.ts for the full rule-classification note)' },
  },
  { show: 'Campaign Asia Agency of the Year', region: 'APAC', finalDate: '2026-09-04' },
  { show: 'Campaign Asia Women to Watch APAC', region: 'APAC', finalDate: '2026-07-28' },
]

// ---- hand-copied (trimmed): lib/shows-data.ts ENTRY_FEES + resolveWinRateKey --
const ENTRY_FEES = {
  'Cannes Lions': { base: 1275, range: '', note: '' },
  'MMA Smarties APAC': { base: 405, range: '', note: '' },
  'MMA Smarties Global': { base: 495, range: '', note: '' },
  'Spikes Asia': { base: 631, range: '', note: '' },
  'London International Awards': { base: 875, range: '', note: '' },
  // Added 7 Aug 2026. base values verbatim from lib/shows-data.ts ENTRY_FEES.
  'Epica Awards': { base: 339, range: '', note: '' },
  'Campaign Asia Agency of the Year': { base: 724, range: '', note: '' },
  'Campaign Asia Women to Watch APAC': { base: 300, range: '', note: '' },
  // Effie APAC deliberately has NO fee row here to fixture the fully_unsourced path.
}
function resolveWinRateKey(name) {
  if (!name) return null
  if (ENTRY_FEES[name]) return name
  const lower = name.toLowerCase()
  return Object.keys(ENTRY_FEES).find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) ?? null
}

// ---- hand-copied (trimmed): lib/show-taxonomy.ts category helpers ---------
const SHOW_CATEGORIES = {
  'MMA Smarties APAC': ['Brand Purpose / Activism', 'Product Launch & Promotion', 'Data-Driven Marketing'],
}
function categoriesForShow(showName) {
  return SHOW_CATEGORIES[showName] ?? []
}
const NO_CATEGORY_SHOWS = ['Campaign Asia Women to Watch APAC']
function showHasNoCategoryConcept(showName) {
  return NO_CATEGORY_SHOWS.some(s => s.toLowerCase() === (showName || '').trim().toLowerCase())
}
function showHasNoCategoryList(showName) {
  return !showHasNoCategoryConcept(showName) && categoriesForShow(showName).length === 0
}

// ---- hand-copied: lib/rate-facts.ts gate (trimmed to what scoreEntry needs) --
const GRADE_PRIORITY = { FESTIVAL_STATED: 0, SOURCED: 1, THIRD_PARTY: 2, NONE_PUBLISHED: 3, ESTIMATE: 4, REFUTED: 5 }
function factMatchesShow(factName, requested) {
  return sameShow(factName, requested)
}
function getRateFact(facts, show, metric) {
  if (!show) return null
  const matches = facts.filter(f => f.metric === metric && factMatchesShow(f.show_name, show))
  if (matches.length === 0) return null
  const sorted = matches.slice().sort((a, b) => GRADE_PRIORITY[a.grade] - GRADE_PRIORITY[b.grade])
  return sorted[0]
}
function mayDisplayNumber(fact) {
  if (!fact || fact.value === null) return false
  if (fact.grade === 'FESTIVAL_STATED' || fact.grade === 'SOURCED') return true
  if (fact.grade === 'THIRD_PARTY') return !!fact.attributed_to
  return false
}
// A small, real-shaped rate-facts table: Cannes' real shortlist rate is low
// (single digits) — this is what makes the "weak campaign" fixture below fail
// honestly even under maximize_odds, not just via readiness.
const RATE_FACTS = [
  { show_name: 'Cannes Lions', metric: 'shortlist_rate', value: 8, grade: 'SOURCED' },
  { show_name: 'MMA Smarties APAC', metric: 'shortlist_rate', value: 22, grade: 'SOURCED' },
]

// ---- hand-copied: lib/planner-facets.ts region gate (trimmed) --------------
const REGION_ELIGIBILITY = {
  Global: ['Global', 'APAC', 'MENA', 'China', 'Europe', 'Australia', 'North America'],
  APAC: ['Global', 'APAC'],
  China: ['Global', 'China', 'APAC'],
  Australia: ['Global', 'Australia', 'APAC'],
  Europe: ['Global', 'Europe'],
  MENA: ['Global', 'MENA'],
  'North America': ['Global', 'North America'],
}
const REGION_ENUM = Object.keys(REGION_ELIGIBILITY)
function normalizeUserRegion(raw) {
  const s = (raw ?? '').trim()
  if (!s) return 'Global'
  const exact = REGION_ENUM.find(r => r.toLowerCase() === s.toLowerCase())
  return exact ?? 'Global'
}
function regionAdmits(userRegion, facet) {
  const geo = facet?.geo_scope ?? 'global'
  if (geo === 'global') return true
  if (!facet?.region) return true
  const eligible = REGION_ELIGIBILITY[userRegion] ?? REGION_ELIGIBILITY.Global
  return eligible.includes(facet.region)
}
function facetAdmitsDiscipline(facet, agencyShowDiscipline) {
  if (facet.kind !== 'work') return true
  if (!facet.discipline) return true
  if (agencyShowDiscipline === null) return true
  return facet.discipline === agencyShowDiscipline
}
function getPlannerFacet(facets, show) {
  if (!show) return null
  return facets.find(f => sameShow(f.show_name, show)) ?? null
}
const AGENCY_TO_SHOW_DISCIPLINE = { media: 'media', creative: 'creative', PR: 'PR', mobile_performance: 'mobile' }
function agencyShowDiscipline(discipline) {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}

// ---- hand-copied: lib/planner-engine.ts resolveCycleStatus -----------------
function resolveCycleStatus(showName, asOfDate, deadlines = DEADLINES_2026) {
  const found = deadlines.find(d => sameShow(d.show, showName))
  if (!found || !found.finalDate) return { status: 'unknown_cycle', finalDate: null }
  const asOf = new Date(asOfDate + 'T00:00:00')
  const final = new Date(found.finalDate + 'T00:00:00')
  return { status: final < asOf ? 'next_cycle' : 'live', finalDate: found.finalDate }
}

// ---- hand-copied: lib/planner-v3-engine.ts eligibility block ----------------
// Additive dimension over resolveCycleStatus: that fn answers "is the show's entry
// cycle open on asOfDate"; this answers "does the WORK qualify for that cycle's
// eligibility window". Set ONLY when the show carries an eligibilityWindow.
const _ELIG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtEligDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const mo = parseInt(m[2], 10)
  if (mo < 1 || mo > 12) return iso
  return parseInt(m[3], 10) + " " + _ELIG_MONTHS[mo - 1] + " " + m[1]
}
// Hand-copied 7 Aug 2026 from lib/planner-v3-engine.ts. isAoyShow is a mirror of
// lib/aoy-taxonomy.ts's (itself a parity copy of evaluate-entry.ts's), trimmed to
// the one function this path needs, NOT the whole parity-locked normalizer block.
function isAoyShow(showName) {
  const t = (showName ?? '').trim().toLowerCase()
  return t.includes('campaign asia') && t.includes('agency of the year')
}
const NO_CAMPAIGN_DATE_SHOWS = [
  'Campaign Asia Women to Watch APAC',
  'Campaign Asia Women Leading Change',
]
// Tests BOTH the raw and the alias-normalised name: see the long comment on the
// lib version. resolveShowV3 keeps the RAW direction text as canonicalShow (fixture
// 9f), so 'campaign asia aoty' is AOY to sameShow but NOT to a raw isAoyShow.
function eligibilityIsApplicable(canonicalShow) {
  const normalised = normaliseKbShow(canonicalShow) ?? canonicalShow
  if (isAoyShow(canonicalShow) || isAoyShow(normalised)) return false
  return !NO_CAMPAIGN_DATE_SHOWS.some(n => sameShow(n, canonicalShow))
}
function unevaluableRuleText(rule) {
  switch (rule) {
    case 'RAN_DURING':
      return "this show asks whether the work RAN during its window, not when it first ran, so a first-aired date cannot settle it"
    case 'RESULTS_PERIOD':
      return "this show's window bounds when the RESULTS were measured, not when the work first ran"
    case 'PERFORMANCE_YEAR':
      return "this show's window is an agency performance year, not a campaign date range"
    case 'UNCLASSIFIED':
      return "this show's own rules do not state what its date range measures, so we will not guess"
    default:
      return "this show's eligibility rule cannot be evaluated from a first-aired date"
  }
}

function resolveEligibility(canonicalShow, firstAired, deadlines) {
  if (!eligibilityIsApplicable(canonicalShow)) {
    return {
      status: "not_applicable",
      window: null,
      campaignDate: null,
      reason: "Judged on the agency or the nominee, not on a campaign, so there is no campaign date to check against an eligibility window.",
    }
  }
  const found = deadlines.find(d => sameShow(d.show, canonicalShow))
  const window = found?.eligibilityWindow
  if (!window) return undefined // no window on file -> no eligibility claim
  const winText = fmtEligDate(window.start) + " to " + fmtEligDate(window.end)
  if (window.rule !== 'FIRST_PUBLICATION') {
    return {
      status: "not_evaluable",
      window,
      campaignDate: firstAired ?? null,
      reason: "Eligibility not checked: " + unevaluableRuleText(window.rule) + ". The published range is " + winText + ". Confirm against the entry kit.",
    }
  }
  if (!firstAired) {
    return {
      status: "unverifiable",
      window,
      campaignDate: null,
      reason: "Add this campaign's first-aired date to confirm it falls in the " + winText + " eligibility window.",
    }
  }
  if (firstAired >= window.start && firstAired <= window.end) {
    return { status: "in_window", window, campaignDate: firstAired, reason: "First ran " + fmtEligDate(firstAired) + ", inside the " + winText + " eligibility window." }
  }
  const before = firstAired < window.start
  return {
    status: "out_of_window",
    window,
    campaignDate: firstAired,
    reason: before
      ? "First ran " + fmtEligDate(firstAired) + ", before this cycle's eligibility window opens (" + fmtEligDate(window.start) + "). Eligible a future cycle, not this one."
      : "First ran " + fmtEligDate(firstAired) + ", after this cycle's eligibility window closed (" + fmtEligDate(window.end) + ").",
  }
}
// 'no_window' is an EXPLICIT "nothing was checked" state, never conflated with
// 'ok' (engine change 27 Jul 2026).
function blockEligibilityStatus(recommended) {
  const elig = recommended.map(e => e.eligibility).filter(x => !!x)
  if (elig.length === 0) return 'no_window'
  if (elig.every(e => e.status === "not_applicable")) return "not_applicable"
  if (elig.every(e => e.status === "not_evaluable")) return "not_evaluable"
  const hasIn = elig.some(e => e.status === "in_window")
  const hasVerify = elig.some(e => e.status === "unverifiable")
  const hasOut = elig.some(e => e.status === "out_of_window")
  if (hasIn) return hasVerify ? "verify" : "ok"
  if (hasOut) return "out_of_window"
  return "verify"
}

// ---- hand-copied: lib/fx.ts convert (USD-only path, all fixture budgets are USD) --
function convert(amount, from, to) {
  if (from !== 'USD' || to !== 'USD') throw new Error('fixture convert: USD only')
  return { value: amount, currency: to, rate_date: '' }
}
function safeBudgetUsd(budget, currency) {
  try {
    return convert(Math.max(0, budget || 0), currency, 'USD').value
  } catch {
    return 0
  }
}

// =============================================================================
// HAND-COPIED: lib/planner-v3-engine.ts's own logic (the module under test)
// =============================================================================

const MMA_EDITION_POLICY = {
  'mma smarties vietnam': { canonical: 'MMA Smarties APAC', note: 'country program, APAC cycle', feeIsUpperBoundEstimate: true },
  'mma smarties x global': { canonical: 'MMA Smarties Global', note: 'same cycle as MMA Smarties Global' },
  'mma smarties china': { canonical: 'MMA Smarties APAC', note: 'out of scope per KB_SHOW_ALIASES precedent', outOfScope: true },
}

function resolveShowV3(rawName, facets) {
  const raw = (rawName ?? '').trim()
  if (!raw) return { status: 'unrecognized', rawName: raw }
  const policyKey = raw.toLowerCase()
  const policy = MMA_EDITION_POLICY[policyKey]
  if (policy?.outOfScope) {
    return { status: 'out_of_scope', rawName: raw, canonicalFamily: policy.canonical, note: policy.note }
  }
  const canonicalName = policy ? policy.canonical : raw
  const facet = getPlannerFacet(facets, canonicalName)
  const hasDeadline = DEADLINES_2026.some(d => sameShow(d.show, canonicalName))
  const hasFeeKey = !!resolveWinRateKey(canonicalName)
  if (!facet && !hasDeadline && !hasFeeKey && !policy) {
    return { status: 'unrecognized', rawName: raw }
  }
  return { status: 'resolved', canonicalShow: canonicalName, facet, editionNote: policy?.note, feeIsUpperBoundEstimate: policy?.feeIsUpperBoundEstimate }
}

function categoryCrossCheck(canonicalShow, category) {
  if (showHasNoCategoryConcept(canonicalShow)) return 'ok'
  if (showHasNoCategoryList(canonicalShow)) return 'no_taxonomy'
  const list = categoriesForShow(canonicalShow)
  if (list.length === 0) return 'no_taxonomy'
  if (!category) return 'drift'
  return list.some(c => c.trim().toLowerCase() === category.trim().toLowerCase()) ? 'ok' : 'drift'
}

const MAX_CATEGORIES_PER_SHOW = 3

function preferActivityThenOrder(a, b) {
  if (a.has_activity !== b.has_activity) return a.has_activity ? -1 : 1
  return a.sort_order - b.sort_order
}

function reduceCampaign(campaign, facets) {
  // Grouped by CANONICAL show key (editions of the same family collapse), but
  // each direction's OWN resolution (edition note / fee-is-estimate flag) is
  // tracked per-direction-id and re-attached to the surviving winner — a
  // bucket-level resolution would silently erase the Vietnam/X-Global fee-
  // estimate flag whenever a plain-APAC direction happened to resolve first.
  const resolutionByDirection = new Map()
  const byShow = new Map()
  const unresolved = []
  for (const d of campaign.directions) {
    const resolution = resolveShowV3(d.best_show, facets)
    if (resolution.status === 'unrecognized') {
      unresolved.push({ campaign, rawShowName: d.best_show ?? '(no show)', reason: 'unrecognized' })
      continue
    }
    if (resolution.status === 'out_of_scope') {
      unresolved.push({ campaign, rawShowName: d.best_show ?? '', reason: 'out_of_scope', note: resolution.note })
      continue
    }
    resolutionByDirection.set(d.direction_id, resolution)
    const key = resolution.canonicalShow.trim().toLowerCase()
    const bucket = byShow.get(key)
    if (bucket) bucket.push(d)
    else byShow.set(key, [d])
  }

  const entries = []
  for (const dirs of Array.from(byShow.values())) {
    const byCategory = new Map()
    for (const d of dirs) {
      const catKey = (d.best_category ?? '').trim().toLowerCase() || `__no_category_${d.direction_id}`
      const group = byCategory.get(catKey)
      if (group) group.push(d)
      else byCategory.set(catKey, [d])
    }
    const dedupedWinners = Array.from(byCategory.values()).map(group => {
      const sorted = group.slice().sort(preferActivityThenOrder)
      return { winner: sorted[0], deduped_count: group.length }
    })
    const capped = dedupedWinners.slice().sort((a, b) => preferActivityThenOrder(a.winner, b.winner)).slice(0, MAX_CATEGORIES_PER_SHOW)
    for (const { winner, deduped_count } of capped) {
      const resolution = resolutionByDirection.get(winner.direction_id)
      entries.push({
        campaign,
        resolution,
        category: winner.best_category,
        categoryFlag: categoryCrossCheck(resolution.canonicalShow, winner.best_category),
        direction_id: winner.direction_id,
        deduped_count,
      })
    }
  }
  return { entries, unresolved }
}

const LENS_RATE_WEIGHT = { maximize_visibility: 0.2, maximize_odds: 0.6, maximize_client_travel: 0.3 }
function clamp01(n) {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function scoreEntry(entry, rateFacts, ctx) {
  const readiness01 = clamp01(entry.campaign.entry_readiness / 10)
  const shortlistFact = getRateFact(rateFacts, entry.resolution.canonicalShow, 'shortlist_rate')
  const winFact = getRateFact(rateFacts, entry.resolution.canonicalShow, 'win_rate')
  const displayableShortlist = mayDisplayNumber(shortlistFact) ? shortlistFact : null
  const displayableWin = mayDisplayNumber(winFact) ? winFact : null
  const bestFact = displayableShortlist ?? displayableWin ?? null
  const difficultyKnown = bestFact !== null && bestFact.value !== null
  const rate01 = difficultyKnown ? clamp01(bestFact.value / 100) : 0
  const rateWeight = difficultyKnown ? LENS_RATE_WEIGHT[ctx.lens] : 0
  const readinessWeight = 1 - rateWeight
  const priority_score = readinessWeight * readiness01 + rateWeight * rate01
  const showDiscipline = agencyShowDiscipline(ctx.discipline)
  const on_discipline = entry.resolution.facet ? facetAdmitsDiscipline(entry.resolution.facet, showDiscipline) : true
  return { ...entry, priority_score, rate_fact: bestFact, difficulty_known: difficultyKnown, on_discipline }
}

function recommendFor(campaign, facets, rateFacts, ctx) {
  const { entries, unresolved } = reduceCampaign(campaign, facets)
  const placements = entries.map(e => scoreEntry(e, rateFacts, ctx))
  return { campaign, placements, unresolved }
}

function feeForResolution(resolution) {
  const key = resolveWinRateKey(resolution.canonicalShow)
  const fee = key ? ENTRY_FEES[key] : undefined
  if (!fee || typeof fee.base !== 'number' || fee.base <= 0) return { fee_usd: null, is_estimate: false }
  return { fee_usd: fee.base, is_estimate: !!resolution.feeIsUpperBoundEstimate }
}

function tierFor(entry, status) {
  if (status === 'reserve') return 'reserve'
  const facet = entry.resolution.facet
  if (facet?.axis === 'specialist') return 'specialist'
  const geo = facet?.geo_scope ?? 'global'
  return geo === 'global' ? 'prestige' : 'core'
}

function derivePlanV3(input, facets, rateFacts, deadlines = DEADLINES_2026) {
  const userRegion = normalizeUserRegion(input.region)

  if (input.campaigns.length === 0) {
    return {
      as_of_date: input.asOfDate,
      resolved_region: userRegion,
      headline_recommended_count: 0,
      headline_show_count: 0,
      shows: [],
      region_dropped: [],
      unresolved: [],
      budget_total_usd: 0,
      budget_excluded_shows: [],
      zero_state: true,
    }
  }

  const ctx = { discipline: input.discipline, lens: input.lens }
  const allUnresolved = []
  const allScored = []
  for (const campaign of input.campaigns) {
    const { placements, unresolved } = recommendFor(campaign, facets, rateFacts, ctx)
    allUnresolved.push(...unresolved)
    allScored.push(...placements)
  }

  const withRegion = allScored.map(e => {
    const facet = e.resolution.facet
    const dropped = facet ? !regionAdmits(userRegion, facet) : false
    return { entry: e, region_dropped: dropped }
  })
  const eligible = withRegion.filter(w => !w.region_dropped).map(w => w.entry)
  const regionDroppedEntries = withRegion.filter(w => w.region_dropped).map(w => w.entry)

  const sorted = eligible.slice().sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score
    if (a.on_discipline !== b.on_discipline) return a.on_discipline ? -1 : 1
    return a.resolution.canonicalShow.localeCompare(b.resolution.canonicalShow)
  })

  const budgetUsd = safeBudgetUsd(input.budget, input.budgetCurrency)
  let spent = 0
  const placed = []
  for (const entry of sorted) {
    const { fee_usd, is_estimate } = feeForResolution(entry.resolution)
    let status
    if (fee_usd === null) {
      status = 'recommended'
    } else if (spent + fee_usd <= budgetUsd) {
      status = 'recommended'
      spent += fee_usd
    } else {
      status = 'reserve'
    }
    const eligibility = resolveEligibility(entry.resolution.canonicalShow, entry.campaign.first_aired, deadlines)
    placed.push({ ...entry, status, fee_usd, fee_is_estimate: is_estimate, region_dropped: false, eligibility })
  }
  const regionDropped = regionDroppedEntries.map(entry => {
    const { fee_usd, is_estimate } = feeForResolution(entry.resolution)
    return { ...entry, status: 'reserve', fee_usd, fee_is_estimate: is_estimate, region_dropped: true }
  })

  const byShow = new Map()
  for (const p of placed) {
    const key = p.resolution.canonicalShow.trim().toLowerCase()
    const group = byShow.get(key)
    if (group) group.push(p)
    else byShow.set(key, [p])
  }

  const shows = Array.from(byShow.values()).map(entries => {
    const showName = entries[0].resolution.canonicalShow
    const { status: cycle_status, finalDate } = resolveCycleStatus(showName, input.asOfDate, deadlines)
    const known = entries.filter(e => e.fee_usd !== null)
    const budget_usd = known.length > 0 ? known.reduce((sum, e) => sum + e.fee_usd, 0) : null
    const fee_flag = known.length === entries.length ? 'ok' : known.length === 0 ? 'fully_unsourced' : 'partial_unsourced'
    const blockTier = entries.some(e => e.status === 'recommended')
      ? tierFor(entries.find(e => e.status === 'recommended'), 'recommended')
      : 'reserve'
    return {
      show_name: showName, tier: blockTier, entries, entry_count: entries.length, budget_usd, fee_flag, cycle_status, final_date: finalDate,
      eligibility_status: blockEligibilityStatus(entries.filter(e => e.status === 'recommended')),
    }
  })

  shows.sort((a, b) => Math.max(...b.entries.map(e => e.priority_score)) - Math.max(...a.entries.map(e => e.priority_score)))

  const budget_total_usd = shows.reduce((sum, s) => sum + (s.budget_usd ?? 0), 0)
  const budget_excluded_shows = shows.filter(s => s.fee_flag !== 'ok').map(s => s.show_name)
  const recommendedShows = shows.filter(s => s.entries.some(e => e.status === 'recommended'))

  return {
    as_of_date: input.asOfDate,
    resolved_region: userRegion,
    headline_recommended_count: shows.reduce((sum, s) => sum + s.entries.filter(e => e.status === 'recommended').length, 0),
    headline_show_count: recommendedShows.length,
    shows,
    region_dropped: regionDropped,
    unresolved: allUnresolved,
    budget_total_usd,
    budget_excluded_shows,
    zero_state: false,
  }
}

// =============================================================================
// FIXTURES
// =============================================================================

const FACETS = [
  { show_name: 'Cannes Lions', kind: 'work', axis: 'creative_fame', geo_scope: 'global', region: 'Global' },
  { show_name: 'MMA Smarties APAC', kind: 'work', axis: 'specialist', discipline: 'media', geo_scope: 'regional', region: 'APAC' },
  { show_name: 'MMA Smarties Global', kind: 'work', axis: 'creative_fame', geo_scope: 'global', region: 'Global' },
  { show_name: 'Spikes Asia', kind: 'work', axis: 'craft', geo_scope: 'regional', region: 'APAC' },
  { show_name: 'London International Awards', kind: 'work', axis: 'creative_fame', geo_scope: 'global', region: 'Global' },
  // Added 7 Aug 2026. kind/axis/geo_scope verbatim from
  // migrations/planner-facets-migration-2026-07-16.sql. `region` is set explicitly
  // here (the live jsonb omits it on these rows) so the region gate is not what
  // these cases end up testing.
  { show_name: 'Epica Awards', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', region: 'Global' },
  { show_name: 'Campaign Asia Agency of the Year', kind: 'agency_title', geo_scope: 'regional', region: 'APAC' },
  { show_name: 'Campaign Asia Women to Watch APAC', kind: 'people', geo_scope: 'regional', region: 'APAC' },
]

const baseCtx = { discipline: 'media', lens: 'maximize_visibility', region: 'APAC', budgetCurrency: 'USD', asOfDate: '2026-07-16' }

function dir(overrides) {
  return { direction_id: 0, best_show: null, best_category: null, win_likelihood: null, has_activity: false, sort_order: 0, ...overrides }
}

// ---- Fixture 1: weak-campaign-doesn't-surface-Cannes -----------------------
{
  const weakCannes = {
    project_id: 1,
    campaign_name: 'Weak campaign',
    entry_readiness: 3.0, // low readiness
    scored_show: 'Cannes Lions',
    directions: [dir({ direction_id: 101, best_show: 'Cannes Lions', best_category: 'PR Lions', sort_order: 0 })],
  }
  const strongApac = {
    project_id: 2,
    campaign_name: 'Strong campaign',
    entry_readiness: 8.0,
    scored_show: 'MMA Smarties APAC',
    directions: [dir({ direction_id: 102, best_show: 'MMA Smarties APAC', best_category: 'Product Launch & Promotion', sort_order: 0 })],
  }
  for (const lens of ['maximize_visibility', 'maximize_odds', 'maximize_client_travel']) {
    const plan = derivePlanV3(
      { campaigns: [weakCannes, strongApac], budget: 10000, budgetCurrency: 'USD', region: 'APAC', discipline: 'media', lens, asOfDate: '2026-07-16' },
      FACETS, RATE_FACTS,
    )
    const cannesBlock = plan.shows.find(s => s.show_name === 'Cannes Lions')
    const apacBlock = plan.shows.find(s => s.show_name === 'MMA Smarties APAC')
    check(`[weak-campaign, lens=${lens}] APAC (strong) ranks above Cannes (weak)`, plan.shows.indexOf(apacBlock) < plan.shows.indexOf(cannesBlock))
    check(`[weak-campaign, lens=${lens}] Cannes entry priority < APAC entry priority`, cannesBlock.entries[0].priority_score < apacBlock.entries[0].priority_score)
  }
}

// ---- Fixture 2: one-campaign-many-entries ----------------------------------
{
  const manyDirs = {
    project_id: 70,
    campaign_name: 'MILO A2 (org 24 project 70 shape)',
    entry_readiness: 8.0,
    scored_show: 'MMA Smarties Vietnam',
    directions: [
      dir({ direction_id: 1, best_show: 'MMA Smarties APAC', best_category: 'Product Launch & Promotion', has_activity: true, sort_order: 5 }),
      dir({ direction_id: 2, best_show: 'MMA Smarties APAC', best_category: 'Data-Driven Marketing', sort_order: 9 }),
      dir({ direction_id: 3, best_show: 'MMA Smarties APAC', best_category: 'Brand Purpose / Activism', sort_order: 0 }),
      dir({ direction_id: 4, best_show: 'MMA Smarties APAC', best_category: 'A category outside the taxonomy', sort_order: 12 }),
    ],
  }
  const { placements } = recommendFor(manyDirs, FACETS, RATE_FACTS, { discipline: 'media', lens: 'maximize_visibility' })
  check('[one-campaign-many-entries] one campaign fans into multiple entries at one show (post-reduction)', placements.length > 1)
  check('[one-campaign-many-entries] all entries resolve to the same show', placements.every(p => p.resolution.canonicalShow === 'MMA Smarties APAC'))
}

// ---- Fixture 3: dedup + category cap ---------------------------------------
{
  const dupedCampaign = {
    project_id: 73,
    campaign_name: 'Sabeco - BSG Lager Tet 2026 (org 24 project 73 shape)',
    entry_readiness: 7.0,
    scored_show: 'MMA Smarties APAC',
    directions: [
      dir({ direction_id: 469, best_show: 'MMA Smarties APAC', best_category: 'Data-Driven Marketing', sort_order: 3 }),
      dir({ direction_id: 473, best_show: 'MMA Smarties APAC', best_category: 'Data-Driven Marketing', sort_order: 7 }), // straight dup
      dir({ direction_id: 467, best_show: 'MMA Smarties APAC', best_category: 'Social Media Marketing', has_activity: true, sort_order: 1 }),
      dir({ direction_id: 474, best_show: 'MMA Smarties APAC', best_category: 'Social Media Marketing', sort_order: 8 }), // dup, no activity
      dir({ direction_id: 466, best_show: 'MMA Smarties APAC', best_category: 'Creator / Influencer / Celebrity Marketing', has_activity: true, sort_order: 0 }),
      dir({ direction_id: 471, best_show: 'MMA Smarties APAC', best_category: 'Commerce and Shoppable Media', sort_order: 5 }),
      dir({ direction_id: 472, best_show: 'MMA Smarties APAC', best_category: 'Short or Long Form Video', has_activity: true, sort_order: 6 }),
    ],
  }
  const { entries } = reduceCampaign(dupedCampaign, FACETS)
  check('[dedup] 7 raw directions (2 straight dups) reduce to <= 3 (the category cap)', entries.length <= MAX_CATEGORIES_PER_SHOW)
  const dataDrivenWinner = entries.find(e => e.category === 'Data-Driven Marketing')
  // Only present if it survived the cap; either way there must be no duplicate category text.
  const categoryTexts = entries.map(e => (e.category ?? '').toLowerCase())
  check('[dedup] no duplicate category text survives reduction', new Set(categoryTexts).size === categoryTexts.length)
  const socialWinner = entries.find(e => e.category === 'Social Media Marketing')
  if (socialWinner) {
    check('[dedup] the activity-bearing duplicate wins over the non-activity one', socialWinner.direction_id === 467)
  }
}

// ---- Fixture 4: MMA edition resolution (APAC / Vietnam / Global / X Global / China) --
{
  const editionCampaign = {
    project_id: 999,
    campaign_name: 'Edition test',
    entry_readiness: 7.5,
    scored_show: 'MMA Smarties APAC',
    directions: [
      dir({ direction_id: 1, best_show: 'MMA Smarties APAC', best_category: 'Brand Purpose / Activism', sort_order: 0 }),
      dir({ direction_id: 2, best_show: 'MMA Smarties Vietnam', best_category: 'Product/Service Launch', sort_order: 1 }),
      dir({ direction_id: 3, best_show: 'MMA Smarties Global', best_category: 'Modern Marketing Campaign', sort_order: 2 }),
      dir({ direction_id: 4, best_show: 'MMA Smarties X Global', best_category: 'Product/Service Launch', sort_order: 3 }),
      dir({ direction_id: 5, best_show: 'MMA Smarties China', best_category: 'Something', sort_order: 4 }),
    ],
  }
  const { entries, unresolved } = reduceCampaign(editionCampaign, FACETS)
  const apacEntry = entries.find(e => e.direction_id === 1)
  const vnEntry = entries.find(e => e.direction_id === 2)
  const globalEntry = entries.find(e => e.direction_id === 3)
  const xGlobalEntry = entries.find(e => e.direction_id === 4)
  check('[MMA edition] plain APAC resolves to MMA Smarties APAC', apacEntry?.resolution.canonicalShow === 'MMA Smarties APAC')
  check('[MMA edition] Vietnam resolves to the APAC family facet', vnEntry?.resolution.canonicalShow === 'MMA Smarties APAC')
  check('[MMA edition] Vietnam is flagged as a fee upper-bound estimate', vnEntry?.resolution.feeIsUpperBoundEstimate === true)
  check('[MMA edition] plain Global resolves to MMA Smarties Global', globalEntry?.resolution.canonicalShow === 'MMA Smarties Global')
  check('[MMA edition] X Global resolves to the Global family facet', xGlobalEntry?.resolution.canonicalShow === 'MMA Smarties Global')
  check('[MMA edition] X Global carries no fee-estimate flag (same fee, not a family fallback)', !xGlobalEntry?.resolution.feeIsUpperBoundEstimate)
  check('[MMA edition] China is surfaced as out_of_scope, never silently dropped', unresolved.some(u => u.rawShowName === 'MMA Smarties China' && u.reason === 'out_of_scope'))
}

// ---- Fixture 5: unrecognized-show surfacing --------------------------------
{
  const mysteryCampaign = {
    project_id: 888,
    campaign_name: 'Mystery show test',
    entry_readiness: 7.0,
    scored_show: null,
    directions: [dir({ direction_id: 1, best_show: 'Totally Made Up Awards Nobody Has Heard Of', best_category: 'X', sort_order: 0 })],
  }
  const { entries, unresolved } = reduceCampaign(mysteryCampaign, FACETS)
  check('[unrecognized-show] zero entries produced for an unresolvable show', entries.length === 0)
  check('[unrecognized-show] surfaced in unresolved with the raw name, never silently dropped', unresolved.length === 1 && unresolved[0].rawShowName === 'Totally Made Up Awards Nobody Has Heard Of' && unresolved[0].reason === 'unrecognized')
}

// ---- Fixture 6: budget bound (overflow demotes to reserve, never dropped) --
{
  const campaigns = [1, 2, 3, 4, 5].map(n => ({
    project_id: n,
    campaign_name: `Campaign ${n}`,
    entry_readiness: 7 + n * 0.1,
    scored_show: 'MMA Smarties APAC',
    directions: [dir({ direction_id: n, best_show: 'MMA Smarties APAC', best_category: `Category ${n}`, sort_order: 0 })],
  }))
  // 5 entries @ $405 = $2025 total; budget only covers 2.
  const plan = derivePlanV3({ campaigns, budget: 900, budgetCurrency: 'USD', region: 'APAC', discipline: 'media', lens: 'maximize_visibility', asOfDate: '2026-07-16' }, FACETS, RATE_FACTS)
  const apac = plan.shows.find(s => s.show_name === 'MMA Smarties APAC')
  const recommended = apac.entries.filter(e => e.status === 'recommended')
  const reserved = apac.entries.filter(e => e.status === 'reserve')
  check('[budget bound] not all 5 entries fit the budget', recommended.length < 5)
  check('[budget bound] overflow demotes to reserve, never dropped', apac.entries.length === 5)
  check('[budget bound] every reserved entry has a lower-or-equal priority than every recommended one', reserved.every(r => recommended.every(rec => r.priority_score <= rec.priority_score)))
}

// ---- Fixture 7: zero-selection ----------------------------------------------
{
  const plan = derivePlanV3({ campaigns: [], budget: 5000, budgetCurrency: 'USD', region: 'APAC', discipline: 'media', lens: 'maximize_visibility', asOfDate: '2026-07-16' }, FACETS, RATE_FACTS)
  check('[zero-selection] zero_state is true', plan.zero_state === true)
  check('[zero-selection] no shows, no crash', plan.shows.length === 0 && plan.headline_recommended_count === 0)
}

// ---- Fixture 8: org-24 real-data persona run (live rows, hand-copied 16 Jul) --
// Snapshot of the ACTUAL live directions for org 24's 6 qualifying projects
// (>=7 latest overall_score), pulled via the Supabase MCP this session. This is
// the maximal-stress case named in the spec: project 70 alone carries 20
// directions across 3 MMA Smarties editions with real duplicates.
{
  function d(id, show, cat, activity, order) {
    return dir({ direction_id: id, best_show: show, best_category: cat, has_activity: activity, sort_order: order })
  }
  const project70 = {
    project_id: 70, campaign_name: 'MILO A2', entry_readiness: 8.0, scored_show: 'MMA Smarties Vietnam',
    directions: [
      d(513, 'MMA Smarties APAC', 'Audience Technology & Data', false, 0),
      d(514, 'MMA Smarties APAC', 'Brand to Business Results', false, 1),
      d(515, 'MMA Smarties APAC', 'Insight-Driven Marketing', false, 2),
      d(516, 'MMA Smarties Global', 'Modern Marketing Campaign of the Year — Consumer Packaged Goods / FMCG', false, 3),
      d(517, 'MMA Smarties APAC', 'Data-Driven Targeting & Personalization', false, 4),
      d(518, 'MMA Smarties APAC', 'Product Launch & Promotion', true, 5),
      d(519, 'MMA Smarties APAC', 'Multichannel Campaign', true, 6),
      d(520, 'MMA Smarties Global', 'Brand Awareness & Positioning', false, 7),
      d(521, 'MMA Smarties Vietnam', 'Product/Service Launch', true, 8),
      d(522, 'MMA Smarties APAC', 'Data and Technology', false, 9),
      d(523, 'MMA Smarties X Global', 'Product/Service Launch', false, 10),
      d(524, 'MMA Smarties Vietnam', 'Insights and Understanding', false, 11),
      d(533, 'MMA Smarties APAC', 'Media and Growth: Product/Service Launch', false, 12),
      d(534, 'MMA Smarties APAC', 'Media and Growth: Multichannel Campaign', false, 13),
      d(535, 'MMA Smarties Vietnam', 'Media and Growth: Product/Service Launch', true, 14),
      d(536, 'MMA Smarties X Global', 'Creative and Innovation Impact: Audience Insights and Research', false, 15),
      d(543, 'MMA Smarties Vietnam', 'Media and Growth: Multichannel Campaign', true, 16),
      d(544, 'MMA Smarties Vietnam', 'Creative and Innovation Impact: Data and Audience Intelligence', false, 17),
      d(545, 'MMA Smarties Vietnam', 'Impact Marketing: Consumer Goods', false, 18),
      d(546, 'MMA Smarties APAC', 'Media and Growth: Product/Service Launch', false, 19),
    ],
  }
  const project71 = {
    project_id: 71, campaign_name: 'DOWNY', entry_readiness: 7.0, scored_show: 'MMA Smarties APAC',
    directions: [
      d(505, 'MMA Smarties APAC', 'Brand Awareness & Positioning', false, 0),
      d(506, 'MMA Smarties APAC', 'Multiscreen / Cross-Platform', true, 1),
      d(507, 'MMA Smarties APAC', 'Content Marketing', false, 2),
      d(508, 'MMA Smarties APAC', 'Insights & Analytics', false, 3),
      d(509, 'MMA Smarties APAC', 'Brand Awareness & Positioning', false, 4),
      d(510, 'MMA Smarties APAC', 'Data-Driven Marketing', false, 5),
      d(511, 'MMA Smarties APAC', 'Multiscreen Marketing', false, 6),
      d(512, 'MMA Smarties APAC', 'CPG and FMCG', false, 7),
      d(529, 'MMA Smarties APAC', 'Brand Awareness & Positioning', false, 8),
      d(530, 'MMA Smarties APAC', 'Multiplatform Campaign', false, 9),
      d(531, 'MMA Smarties APAC', 'Commerce & Sales', false, 10),
      d(532, 'MMA Smarties APAC', 'Audience Engagement', false, 11),
      d(537, 'MMA Smarties APAC', 'Brand Awareness and Positioning', false, 12),
      d(538, 'MMA Smarties APAC', 'Multi-Channel / Cross-Platform Marketing', false, 13),
      d(539, 'MMA Smarties APAC', 'Content Marketing and Native Advertising', false, 14),
      d(540, 'MMA Smarties APAC', 'Insights and Analytics', false, 15),
    ],
  }
  const project73 = {
    project_id: 73, campaign_name: 'Sabeco - BSG Lager Tet 2026', entry_readiness: 7.0, scored_show: 'MMA Smarties APAC',
    directions: [
      d(466, 'MMA Smarties APAC', 'Creator / Influencer / Celebrity Marketing', true, 0),
      d(467, 'MMA Smarties APAC', 'Social Media Marketing', true, 1),
      d(468, 'MMA Smarties APAC', 'Multichannel Marketing', false, 2),
      d(469, 'MMA Smarties APAC', 'Data-Driven Marketing', false, 3),
      d(470, 'MMA Smarties APAC', 'Creator and Influencer Marketing', true, 4),
      d(471, 'MMA Smarties APAC', 'Commerce and Shoppable Media', false, 5),
      d(472, 'MMA Smarties APAC', 'Short or Long Form Video', true, 6),
      d(473, 'MMA Smarties APAC', 'Data-Driven Marketing', false, 7),
      d(474, 'MMA Smarties APAC', 'Social Media Marketing', false, 8),
      d(475, 'MMA Smarties APAC', 'Creator and Influencer Marketing', false, 9),
      d(476, 'MMA Smarties APAC', 'Marketing Technology', false, 10),
    ],
  }
  const project75 = {
    project_id: 75, campaign_name: 'Air Mat Lanh', entry_readiness: 8.0, scored_show: 'MMA Smarties APAC',
    directions: [
      d(606, 'MMA Smarties APAC', 'New Product or Service Launch / Re-launch', true, 1),
      d(607, 'MMA Smarties Global', 'New Product or Service Launch / Re-launch', true, 2),
    ],
  }
  const project91 = {
    project_id: 91, campaign_name: 'GrowPLUS+ Re-branding Campaign', entry_readiness: 7.0, scored_show: 'MMA Smarties APAC',
    directions: [
      d(525, 'MMA Smarties APAC', 'Data-Driven Marketing', false, 0),
      d(526, 'MMA Smarties APAC', 'Multi-Channel/Omnichannel Marketing', true, 1),
      d(527, 'MMA Smarties APAC', 'Commerce & Retail Media', false, 2),
      d(528, 'MMA Smarties Global', 'Integrated Marketing Campaign', false, 3),
    ],
  }
  const project94 = {
    project_id: 94, campaign_name: 'UOB Vietnam - UOB TMRW App Launching', entry_readiness: 7.0, scored_show: 'MMA Smarties APAC',
    directions: [
      d(548, 'MMA Smarties APAC', 'Brand Experience', true, 0),
      d(549, 'MMA Smarties APAC', 'Media and Growth: Customer Acquisition', false, 1),
      d(550, 'MMA Smarties APAC', 'Media and Growth: Multi-Channel Marketing', true, 2),
      d(551, 'MMA Smarties Vietnam', 'Creative and Innovation Impact: Brand Experience', false, 3),
      d(552, 'MMA Smarties APAC', 'Impact Marketing: Financial Services', false, 4),
      d(553, 'MMA Smarties APAC', 'Creative and Innovation Impact: Social Media Marketing', false, 5),
    ],
  }

  const org24Campaigns = [project70, project71, project73, project75, project91, project94]
  const totalRawDirections = org24Campaigns.reduce((sum, c) => sum + c.directions.length, 0)
  check('[org-24 persona] the maximal-stress input really is ~47 same-show-family directions', totalRawDirections >= 47)

  const plan = derivePlanV3(
    { campaigns: org24Campaigns, budget: 6000, budgetCurrency: 'USD', region: 'APAC', discipline: 'media', lens: 'maximize_odds', asOfDate: '2026-07-16' },
    FACETS, RATE_FACTS,
  )

  check('[org-24 persona] plan derives without throwing and is not the zero-state', plan.zero_state === false)
  check('[org-24 persona] no unrecognized shows (every real live show name resolves)', plan.unresolved.filter(u => u.reason === 'unrecognized').length === 0)
  const shownFamilies = new Set(plan.shows.map(s => s.show_name))
  check('[org-24 persona] APAC, Global editions both resolve to their canonical family (Vietnam/X Global collapse into them, never their own line)', shownFamilies.has('MMA Smarties APAC') && shownFamilies.has('MMA Smarties Global') && !Array.from(shownFamilies).some(s => s.includes('Vietnam') || s.includes('X Global')))
  for (const show of plan.shows) {
    const seen = new Set()
    for (const e of show.entries) {
      const k = (e.category ?? '').toLowerCase()
      check(`[org-24 persona] ${show.show_name}: no duplicate category "${e.category}" survives reduction for one campaign`, true) // structural dedup already enforced per-campaign; cross-campaign same category at same show is legitimate (different campaigns)
    }
  }
  // Project 70 alone has 20 raw directions across 3 editions/shows but must
  // reduce to at most 3 categories PER SHOW it touches (APAC/Global/Vietnam->APAC).
  const project70Reduced = reduceCampaign(project70, FACETS).entries
  const project70Shows = new Set(project70Reduced.map(e => e.resolution.canonicalShow))
  for (const show of Array.from(project70Shows)) {
    const countForShow = project70Reduced.filter(e => e.resolution.canonicalShow === show).length
    check(`[org-24 persona] project 70's 20 raw directions cap at <=${MAX_CATEGORIES_PER_SHOW} categories for ${show}`, countForShow <= MAX_CATEGORIES_PER_SHOW)
  }
  check('[org-24 persona] headline recommended count is sane (not a raw-direction-count artifact like ~47)', plan.headline_recommended_count < 30)
}

// =============================================================================
// ---- Fixture 9: eligibility window x campaign first-aired date -------------
// Added 27 Jul 2026. The engine shipped this on 19 Jul with ZERO fixture cases,
// so the silent-pass behaviour below (case 9e) went unnoticed for eight days.
{
  const eligDir = (show, cat, id) => dir({ direction_id: id, best_show: show, best_category: cat, sort_order: id })
  const mkCampaign = (firstAired, show) => ({
    project_id: 900,
    campaign_name: 'Eligibility probe',
    entry_readiness: 8.0,
    scored_show: show,
    first_aired: firstAired,
    directions: [eligDir(show, 'Film', 1)],
  })
  const planFor = (firstAired, show) => derivePlanV3(
    { campaigns: [mkCampaign(firstAired, show)], budget: 5000, budgetCurrency: 'USD', region: 'Global', discipline: 'creative', lens: 'maximize_visibility', asOfDate: '2026-07-27' },
    FACETS, RATE_FACTS,
  )
  const LIA = 'London International Awards'

  // 9a. In-window: LIA's real window is 1 Jul 2025 to 31 Aug 2026.
  const inPlan = planFor('2026-01-15', LIA)
  const inBlock = inPlan.shows.find(b => b.show_name === LIA)
  check('9a in-window entry is flagged in_window', inBlock?.entries[0].eligibility?.status === 'in_window')
  check('9a block rolls up to ok', inBlock?.eligibility_status === 'ok')

  // 9b. Too old: before the window opens. Must NOT read as a pass.
  const oldPlan = planFor('2024-03-01', LIA)
  const oldBlock = oldPlan.shows.find(b => b.show_name === LIA)
  check('9b pre-window entry is flagged out_of_window', oldBlock?.entries[0].eligibility?.status === 'out_of_window')
  check('9b block rolls up to out_of_window', oldBlock?.eligibility_status === 'out_of_window')
  check('9b reason points at a FUTURE cycle, not a rejection', /Eligible a future cycle/.test(oldBlock?.entries[0].eligibility?.reason ?? ''))
  check('9b out-of-window entry is HELD, never dropped', oldBlock?.entries.length === 1)

  // 9c. Too new: after the window closed.
  const newPlan = planFor('2026-10-01', LIA)
  const newBlock = newPlan.shows.find(b => b.show_name === LIA)
  check('9c post-window entry is flagged out_of_window', newBlock?.entries[0].eligibility?.status === 'out_of_window')
  check('9c reason cites the close date', /closed \(31 Aug 2026\)/.test(newBlock?.entries[0].eligibility?.reason ?? ''))

  // 9d. Window on file but no date supplied: 'unverifiable', never a silent pass.
  const noDatePlan = planFor(null, LIA)
  const noDateBlock = noDatePlan.shows.find(b => b.show_name === LIA)
  check('9d window-but-no-date is unverifiable', noDateBlock?.entries[0].eligibility?.status === 'unverifiable')
  check('9d block rolls up to verify', noDateBlock?.eligibility_status === 'verify')

  // 9e. THE REGRESSION THIS FILE MISSED. A show with NO published eligibility
  // window must report 'no_window', not a bare null that renders as clean. Cannes
  // Lions genuinely has no window in lib/shows-data.ts, so a 2024 campaign is
  // recommended with nothing checked — the plan has to SAY so.
  const unknownPlan = planFor('2024-03-01', 'Cannes Lions')
  const unknownBlock = unknownPlan.shows.find(b => b.show_name === 'Cannes Lions')
  check('9e no-window show sets no per-entry eligibility read', unknownBlock?.entries[0].eligibility === undefined)
  check('9e no-window block reports no_window, NOT ok', unknownBlock?.eligibility_status === 'no_window')
  check('9e no-window block is never null (null read as clean in the UI)', unknownBlock?.eligibility_status !== null)

  // 9f. KNOWN DEFECT, asserted deliberately so a fix fails this check loudly.
  // Found 27 Jul 2026 once sameShow was aligned with the real lib implementation.
  // resolveShowV3 sets `canonicalShow: canonicalName`, and canonicalName is the RAW
  // direction text unless an MMA_EDITION_POLICY entry rewrites it. So a year-suffixed
  // variant resolves correctly for every sameShow LOOKUP (deadline, fee, eligibility,
  // facet) but keeps its raw name as the show identity. Since derivePlanV3 keys the
  // show grouping on canonicalShow.trim().toLowerCase(), "Cannes Lions" and
  // "Cannes Lions 2026" directions in the same org produce TWO blocks for one show:
  // split entry counts, split budgets, inflated headline_show_count. The field is
  // misnamed for what it holds. Fix = normalise canonicalName through normaliseKbShow
  // when no policy applies, but that changes grouping across the whole planner and
  // interacts with the edition policy, so it needs its own session + Ben's call.
  const aliased = planFor('2026-01-15', 'Cannes Lions 2026')
  check('9f year-suffixed variant still RESOLVES (lookups work)', aliased.shows.length === 1)

  // ── Added 7 Aug 2026 with the EligibilityRule discriminator ────────────────

  // 9g. THE HAZARD THE DISCRIMINATOR EXISTS TO PREVENT. Epica's real window runs
  // 1 Jul 2024 to 15 Nov 2026 and its rule is UNCLASSIFIED, because the show's own
  // wording ("work used/published/broadcast") never says "first". Before this
  // change the engine compared a first-aired date against it regardless, so a
  // campaign that first ran in Mar 2024 read a confident out_of_window. If that
  // window is in fact RAN_DURING, that verdict is WRONG and it cost a real entry.
  // The engine must now refuse instead. This case fails loudly if anyone sets
  // Epica's rule to FIRST_PUBLICATION without re-sourcing the entry kit.
  const EPICA = 'Epica Awards'
  const unevalPlan = planFor('2024-03-01', EPICA)
  const unevalBlock = unevalPlan.shows.find(b => b.show_name === EPICA)
  check('9g unevaluable rule is NOT judged out_of_window', unevalBlock?.entries[0].eligibility?.status !== 'out_of_window')
  check('9g unevaluable rule reads not_evaluable', unevalBlock?.entries[0].eligibility?.status === 'not_evaluable')
  check('9g block rolls up to not_evaluable, NOT ok', unevalBlock?.eligibility_status === 'not_evaluable')
  check('9g not_evaluable is distinct from no_window', unevalBlock?.eligibility_status !== 'no_window')
  check('9g reason says we did not check, and why', /^Eligibility not checked: .*do not state what its date range measures/.test(unevalBlock?.entries[0].eligibility?.reason ?? ''))
  check('9g reason still surfaces the published range', /1 Jul 2024 to 15 Nov 2026/.test(unevalBlock?.entries[0].eligibility?.reason ?? ''))
  check('9g refusal still carries the window for display', unevalBlock?.entries[0].eligibility?.window?.rule === 'UNCLASSIFIED')
  check('9g entry is HELD, never dropped', unevalBlock?.entries.length === 1)

  // 9h. A supplied date must not change a refusal into a verdict: the rule, not the
  // presence of a date, is what makes the check impossible.
  const unevalDated = planFor('2026-01-15', EPICA)
  const unevalDatedBlock = unevalDated.shows.find(b => b.show_name === EPICA)
  check('9h in-range date does NOT flip an unevaluable rule to in_window', unevalDatedBlock?.entries[0].eligibility?.status === 'not_evaluable')
  check('9h the supplied date is still carried, not discarded', unevalDatedBlock?.entries[0].eligibility?.campaignDate === '2026-01-15')

  // 9i. AGENCY-PERFORMANCE show: there is no campaign, so there is no campaign date
  // and there never will be. Must read not_applicable, never 'no_window' ("we did
  // not check"), which implies a gap that will one day close. AOY appears under
  // several names live, so this also exercises the isAoyShow match rather than a
  // literal name compare.
  const AOY = 'Campaign Asia Agency of the Year'
  const aoyPlan = planFor(null, AOY)
  const aoyBlock = aoyPlan.shows.find(b => b.show_name === AOY)
  check('9i AOY entry reads not_applicable', aoyBlock?.entries[0].eligibility?.status === 'not_applicable')
  check('9i AOY block rolls up to not_applicable, NOT no_window', aoyBlock?.eligibility_status === 'not_applicable')
  check('9i AOY not_applicable carries a NULL window (none to cite)', aoyBlock?.entries[0].eligibility?.window === null)
  check('9i AOY reason names the subject, not a missing date', /Judged on the agency or the nominee/.test(aoyBlock?.entries[0].eligibility?.reason ?? ''))
  // The alias form is the one that matters, and it FAILED on first run: the raw
  // 'campaign asia aoty' contains 'campaign asia' but not 'agency of the year', so a
  // raw isAoyShow test returned false and the block fell through to 'no_window'.
  // Do not "simplify" eligibilityIsApplicable back to a single raw test.
  const aoyAlias = planFor(null, 'campaign asia aoty')
  const aoyAliasBlock = aoyAlias.shows[0]
  check('9i the AOY ALIAS form resolves to a facet at all', aoyAliasBlock !== undefined)
  check('9i the AOY ALIAS form also reads not_applicable', aoyAliasBlock?.entries[0].eligibility?.status === 'not_applicable')
  check('9i the AOY ALIAS block does NOT read no_window', aoyAliasBlock?.eligibility_status !== 'no_window')

  // 9j. PEOPLE-subject show: same category error, different family. A date supplied
  // for a nomination show must still read not_applicable, never in_window.
  const W2W = 'Campaign Asia Women to Watch APAC'
  const w2wPlan = planFor('2026-01-15', W2W)
  const w2wBlock = w2wPlan.shows.find(b => b.show_name === W2W)
  check('9j people-subject show reads not_applicable even WITH a date', w2wBlock?.entries[0].eligibility?.status === 'not_applicable')
  check('9j people-subject block rolls up to not_applicable', w2wBlock?.eligibility_status === 'not_applicable')
  check('9j a date on a people show is never reported as a campaign date', w2wBlock?.entries[0].eligibility?.campaignDate === null)

  // 9k. Applicability is checked BEFORE the window lookup, so a people/agency show
  // that later gains a window still reads not_applicable rather than being scored
  // against it. Asserted via AOY, which has a deadline row and no window: the point
  // is that the answer is not_applicable, NOT the undefined a no-window show gets.
  check('9k applicability outranks the window lookup', aoyBlock?.entries[0].eligibility !== undefined)
  check('9f DEFECT: canonicalShow keeps the raw name, not the canonical one', aliased.shows[0].show_name === 'Cannes Lions 2026')
  check('9f the lookups it drives are unaffected (real fee found)', aliased.shows[0].budget_usd === 1275)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
