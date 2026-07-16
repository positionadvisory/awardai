// scripts/planner-engine-fixture.mjs — Portfolio Planner v2. P1 build; extended
// in P2.1 for the region gate (#6), discipline tilt (#5), and campaigns-ready (#4).
//
// UNLIKE lib/data-needed.ts, lib/planner-engine.ts value-imports predicates from
// lib/planner-facets.ts (which imports lib/supabase.ts and uses the @/* alias),
// so the precedented fix here is to HAND-COPY the pure logic under test into the
// fixture, flagged clearly, rather than force a real import through a shim.
//
// HAND-COPIED below, byte-identical to lib/planner-engine.ts + lib/planner-facets.ts
// + lib/fx.ts (the pure parts) as of P2.1 (16 Jul 2026):
//   - computeAxisWeights, resolveCycleStatus, deriveCapacity, derivePlan (engine)
//   - isExcludedFacet, facetAdmitsDiscipline, normalizeUserRegion,
//     REGION_ELIGIBILITY, regionAdmits (facets)
//   - convert + FX_RATES (fx.ts) — only the pure conversion, for deriveCapacity
//   - a minimal sameShow (show-taxonomy.ts's tolerant-compare contract)
// If any of those files change, re-sync this file by hand.
//
// Run:  node scripts/planner-engine-fixture.mjs

// ---- hand-copied: sameShow (minimal, case-insensitive exact match) ---------
function sameShow(a, b) {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ---- hand-copied: lib/planner-facets.ts's pure predicates ------------------
function isExcludedFacet(facet) {
  return !!facet?.excluded
}
function facetAdmitsDiscipline(facet, agencyShowDiscipline) {
  if (facet.kind !== 'work') return true
  if (!facet.discipline) return true
  if (agencyShowDiscipline === null) return true
  return facet.discipline === agencyShowDiscipline
}
const REGION_ELIGIBILITY = {
  Global: ['Global', 'APAC', 'MENA', 'China', 'Europe', 'Australia', 'North America'],
  APAC: ['Global', 'APAC'],
  China: ['Global', 'China', 'APAC'],
  Australia: ['Global', 'Australia', 'APAC'],
  Europe: ['Global', 'Europe'],
  MENA: ['Global', 'MENA'],
  'North America': ['Global', 'North America'],
}
const REGION_ENUM = ['Global', 'APAC', 'MENA', 'China', 'Europe', 'Australia', 'North America']
const REGION_KEYWORDS = [
  { region: 'China', needles: ['china', 'shanghai', 'beijing', 'hong kong'] },
  { region: 'Australia', needles: ['australia', 'sydney', 'melbourne', 'new zealand'] },
  { region: 'North America', needles: ['north america', 'united states', 'usa', ' us ', 'new york', 'chicago', 'canada', 'toronto'] },
  { region: 'Europe', needles: ['europe', 'united kingdom', ' uk ', 'london', 'france', 'paris', 'germany', 'berlin'] },
  { region: 'MENA', needles: ['mena', 'middle east', 'dubai', 'uae', 'saudi', 'egypt', 'africa'] },
  { region: 'APAC', needles: ['apac', 'asia', 'singapore', 'bangkok', 'tokyo', 'japan', 'india', 'malaysia', 'pacific'] },
]
function normalizeUserRegion(raw) {
  const s = (raw ?? '').trim()
  if (!s) return 'Global'
  const exact = REGION_ENUM.find(r => r.toLowerCase() === s.toLowerCase())
  if (exact) return exact
  const hay = ` ${s.toLowerCase()} `
  for (const { region, needles } of REGION_KEYWORDS) {
    if (needles.some(n => hay.includes(n))) return region
  }
  return 'Global'
}
function regionAdmits(userRegion, facet) {
  const geo = facet.geo_scope ?? 'global'
  if (geo === 'global') return true
  if (!facet.region) return true
  const eligible = REGION_ELIGIBILITY[userRegion] ?? REGION_ELIGIBILITY.Global
  return eligible.includes(facet.region)
}

// ---- hand-copied: lib/fx.ts convert (pure) --------------------------------
const FX_RATES = {
  USD: { usd_per_unit: 1, as_of: '' },
  EUR: { usd_per_unit: 1.1646, as_of: '2026-06-14' },
  GBP: { usd_per_unit: 1.341, as_of: '2026-06-14' },
  SGD: { usd_per_unit: 0.7787, as_of: '2026-06-14' },
  HKD: { usd_per_unit: 1 / 7.8, as_of: '2026-06-26' },
  CNY: { usd_per_unit: 1 / 6.8, as_of: '2026-06-01' },
}
function convert(amount, from, to) {
  const fromRate = FX_RATES[from]
  const toRate = FX_RATES[to]
  if (!fromRate || !toRate) throw new Error(`fx.convert: no dated rate for ${!fromRate ? from : to}.`)
  if (from === to) return { value: amount, currency: to, rate_date: '' }
  const usdValue = amount * fromRate.usd_per_unit
  return { value: usdValue / toRate.usd_per_unit, currency: to, rate_date: '' }
}

// ---- hand-copied: lib/planner-engine.ts ------------------------------------
const AGENCY_TO_SHOW_DISCIPLINE = { media: 'media', creative: 'creative', PR: 'PR', mobile_performance: 'mobile' }
function agencyShowDiscipline(discipline) {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}
const TYPICAL_ENTRY_FEE_USD = 700
const TARGET_SHOWS_PER_CAMPAIGN = 3
const BASE_WEIGHTS_BY_MATURITY = {
  beginner: { effectiveness: 0.35, craft: 0.25, creative_fame: 0.05, specialist: 0.35 },
  intermediate: { effectiveness: 0.3, craft: 0.25, creative_fame: 0.15, specialist: 0.3 },
  advanced: { effectiveness: 0.2, craft: 0.25, creative_fame: 0.3, specialist: 0.25 },
}
const LENS_TILT = {
  maximize_visibility: { effectiveness: 1.0, craft: 1.1, creative_fame: 1.5, specialist: 1.2 },
  maximize_odds: { effectiveness: 1.1, craft: 0.9, creative_fame: 0.6, specialist: 1.4 },
  maximize_client_travel: { effectiveness: 1.5, craft: 0.9, creative_fame: 0.8, specialist: 0.9 },
}
const DISCIPLINE_TILT = {
  media: { effectiveness: 1.2, craft: 0.9, creative_fame: 0.9, specialist: 1.1 },
  creative: { effectiveness: 0.95, craft: 1.15, creative_fame: 1.1, specialist: 1.0 },
  PR: { effectiveness: 1.05, craft: 0.85, creative_fame: 0.75, specialist: 1.25 },
  mobile_performance: { effectiveness: 1.25, craft: 0.85, creative_fame: 0.8, specialist: 1.05 },
  full_service: { effectiveness: 1.0, craft: 1.0, creative_fame: 1.0, specialist: 1.0 },
}
const AXES = ['effectiveness', 'craft', 'creative_fame', 'specialist']
function computeAxisWeights(maturity, lens, discipline) {
  const base = BASE_WEIGHTS_BY_MATURITY[maturity]
  const lensT = LENS_TILT[lens]
  const discT = DISCIPLINE_TILT[discipline]
  const raw = { effectiveness: 0, craft: 0, creative_fame: 0, specialist: 0 }
  let total = 0
  for (const axis of AXES) {
    const v = base[axis] * lensT[axis] * discT[axis]
    raw[axis] = v
    total += v
  }
  const normalized = { effectiveness: 0, craft: 0, creative_fame: 0, specialist: 0 }
  for (const axis of AXES) normalized[axis] = total > 0 ? raw[axis] / total : 0.25
  return normalized
}
const GLOBAL_SLOT_CAP_BY_MATURITY = { beginner: 1, intermediate: 2, advanced: 4 }
const GEO_PRIORITY = { national: 0, regional: 1, global: 2 }
function resolveCycleStatus(showName, asOfDate, deadlines) {
  const found = deadlines.find(d => sameShow(d.show, showName))
  if (!found || !found.finalDate) return { status: 'unknown_cycle', finalDate: null }
  const asOf = new Date(asOfDate + 'T00:00:00')
  const final = new Date(found.finalDate + 'T00:00:00')
  return { status: final < asOf ? 'next_cycle' : 'live', finalDate: found.finalDate }
}
function safeBudgetUsd(budget, currency) {
  try {
    return convert(Math.max(0, budget || 0), currency, 'USD').value
  } catch {
    return 0
  }
}
function deriveCapacity(input) {
  const budgetUsd = safeBudgetUsd(input.budget, input.budgetCurrency)
  const affordableEntries = TYPICAL_ENTRY_FEE_USD > 0 ? Math.floor(budgetUsd / TYPICAL_ENTRY_FEE_USD) : 0
  const campaigns = input.campaignsReady != null && input.campaignsReady > 0 ? input.campaignsReady : null
  const entriesPerCampaign = campaigns ? affordableEntries / campaigns : null
  const underBudgeted = entriesPerCampaign !== null && entriesPerCampaign < 1
  const maxRecommended = campaigns ? Math.max(1, campaigns * TARGET_SHOWS_PER_CAMPAIGN) : null
  return {
    budget_usd: budgetUsd,
    typical_entry_fee_usd: TYPICAL_ENTRY_FEE_USD,
    affordable_entries: affordableEntries,
    campaigns_ready: campaigns,
    entries_per_campaign: entriesPerCampaign,
    under_budgeted: underBudgeted,
    max_recommended_shows: maxRecommended,
  }
}
function derivePlan(input, facets, asOfDate, deadlines) {
  const showDiscipline = agencyShowDiscipline(input.discipline)
  const userRegion = normalizeUserRegion(input.region)
  const excludedNotEnterable = []
  const isPinned = name => input.pins.some(p => sameShow(p, name))
  const isUserExcluded = name => input.excludes.some(e => sameShow(e, name))

  const filtered = facets.filter(f => {
    if (isExcludedFacet(f)) {
      excludedNotEnterable.push(f.show_name)
      return false
    }
    if (isUserExcluded(f.show_name)) return false
    if (isPinned(f.show_name)) return true
    return regionAdmits(userRegion, f)
  })

  const axisWeights = computeAxisWeights(input.maturity, input.lens, input.discipline)
  const capacity = deriveCapacity(input)

  const toLineItem = f => {
    const { status, finalDate } = resolveCycleStatus(f.show_name, asOfDate, deadlines)
    return { show_name: f.show_name, facet: f, cycle_status: status, final_date: finalDate, pinned: isPinned(f.show_name) }
  }

  const admitsDisc = f => facetAdmitsDiscipline(f, showDiscipline)
  const workFacets = filtered.filter(f => f.kind === 'work')
  const workSorted = workFacets.slice().sort((a, b) => {
    const ga = GEO_PRIORITY[a.geo_scope ?? 'global']
    const gb = GEO_PRIORITY[b.geo_scope ?? 'global']
    if (ga !== gb) return ga - gb
    const da = admitsDisc(a) ? 0 : 1
    const db = admitsDisc(b) ? 0 : 1
    if (da !== db) return da - db
    const wa = a.axis ? axisWeights[a.axis] : 0
    const wb = b.axis ? axisWeights[b.axis] : 0
    if (wa !== wb) return wb - wa
    return a.show_name.localeCompare(b.show_name)
  })

  let globalSlotsUsed = 0
  const globalCap = GLOBAL_SLOT_CAP_BY_MATURITY[input.maturity]
  const maxRecommended = capacity.max_recommended_shows
  let recommendedUsed = 0
  const work = workSorted.map(f => {
    const li = toLineItem(f)
    const geo = f.geo_scope ?? 'global'
    let tier
    if (geo === 'global') {
      if (li.pinned || globalSlotsUsed < globalCap) {
        tier = 'prestige'
        if (!li.pinned) globalSlotsUsed += 1
      } else {
        tier = 'flexible_reserve'
      }
    } else {
      tier = 'core'
    }
    if (tier !== 'flexible_reserve' && !li.pinned) {
      if (maxRecommended !== null && recommendedUsed >= maxRecommended) tier = 'flexible_reserve'
      else recommendedUsed += 1
    } else if (tier !== 'flexible_reserve' && li.pinned) {
      recommendedUsed += 1
    }
    return { ...li, tier, on_discipline: admitsDisc(f) }
  })

  const agencyTitles = filtered.filter(f => f.kind === 'agency_title').map(toLineItem)
  const people = filtered.filter(f => f.kind === 'people').map(toLineItem)

  const isBrand = input.orgType === 'brand'
  const laneDefaults = { agency_titles_visible: !isBrand, people_visible: true }

  const coverageGaps = []
  const hasNationalFloor = work.some(li => (li.facet.geo_scope ?? 'global') === 'national' && li.cycle_status === 'live')
  if (!hasNationalFloor) {
    coverageGaps.push({
      region: input.region,
      reason:
        'No live national-scope show is covered for this region/discipline yet. Flag for a show request rather than defaulting to a regional/global-only plan silently.',
    })
  }
  const recommended = work.filter(li => li.tier !== 'flexible_reserve')
  if (showDiscipline !== null && recommended.length > 0 && !recommended.some(li => li.on_discipline)) {
    coverageGaps.push({
      region: input.region,
      reason:
        'No show on your exact discipline is available for this market, so the plan leans on adjacent-discipline shows. A tighter fit may need a show request.',
    })
  }

  return {
    input,
    as_of_date: asOfDate,
    resolved_region: userRegion,
    axis_weights: axisWeights,
    capacity,
    work,
    agency_titles: agencyTitles,
    people,
    lane_defaults: laneDefaults,
    coverage_gaps: coverageGaps,
    excluded_not_directly_enterable: excludedNotEnterable,
  }
}

// ── Fixture data (mock facets — shape matches planner_facets exactly) ───────
const FACETS = [
  { show_name: 'D&AD', kind: 'work', axis: 'craft', discipline: 'creative', geo_scope: 'global', region: 'Global', source: 'show_profiles' },
  { show_name: 'Effie APAC', kind: 'work', axis: 'effectiveness', discipline: 'creative', geo_scope: 'regional', region: 'APAC', source: 'show_profiles' },
  { show_name: 'Cannes Lions', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', region: 'Global', source: 'show_profiles' },
  { show_name: 'Clio Awards', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', region: 'Global', source: 'show_profiles' },
  { show_name: 'ANDY Awards', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', region: 'Global', source: 'show_profiles' },
  { show_name: 'Festival of Media', kind: 'work', axis: 'effectiveness', discipline: 'media', geo_scope: 'regional', region: 'APAC', source: 'show_profiles' },
  { show_name: 'Spikes Asia', kind: 'work', axis: 'specialist', discipline: 'creative', geo_scope: 'regional', region: 'APAC', source: 'show_profiles' },
  { show_name: 'PRCA UK Awards', kind: 'work', axis: 'specialist', discipline: 'PR', geo_scope: 'national', region: 'Europe', market: 'UK', source: 'show_profiles' },
  { show_name: 'SABRE Awards North America', kind: 'work', axis: 'specialist', discipline: 'PR', geo_scope: 'regional', region: 'North America', source: 'show_profiles' },
  { show_name: 'ROI Festival', kind: 'work', axis: 'effectiveness', discipline: 'creative', geo_scope: 'national', region: 'China', source: 'show_profiles' },
  { show_name: 'National Effectiveness Show', kind: 'work', axis: 'effectiveness', discipline: 'creative', geo_scope: 'national', region: 'APAC', source: 'show_profiles' },
  { show_name: 'Global SABRE Awards', kind: 'work', axis: 'specialist', discipline: 'PR', geo_scope: 'global', region: 'Global', excluded: 'not_directly_enterable', source: 'show_profiles' },
  { show_name: 'Campaign Asia Agency of the Year', kind: 'agency_title', geo_scope: 'regional', region: 'APAC', source: 'show_profiles' },
  { show_name: 'Campaign UK Agency of the Year', kind: 'agency_title', geo_scope: 'national', region: 'Europe', market: 'UK', source: 'show_profiles' },
  { show_name: 'Campaign Asia Women to Watch APAC', kind: 'people', geo_scope: 'regional', region: 'APAC', source: 'show_profiles' },
]

const DEADLINES = [
  { show: 'D&AD', finalDate: '2026-12-01' },
  { show: 'Effie APAC', finalDate: '2026-12-01' },
  { show: 'Cannes Lions', finalDate: '2026-12-01' },
  { show: 'Clio Awards', finalDate: '2026-12-01' },
  { show: 'ANDY Awards', finalDate: '2026-12-01' },
  { show: 'Festival of Media', finalDate: '2026-12-01' },
  { show: 'Spikes Asia', finalDate: '2026-12-01' },
  { show: 'PRCA UK Awards', finalDate: '2026-12-01' },
  { show: 'SABRE Awards North America', finalDate: '2026-12-01' },
  { show: 'ROI Festival', finalDate: '2026-12-01' },
  // Closed-cycle test show: deadline already passed relative to AS_OF (2026-07-16).
  { show: 'National Effectiveness Show', finalDate: '2026-03-01' },
  { show: 'Global SABRE Awards', finalDate: '2026-12-01' },
  { show: 'Campaign Asia Agency of the Year', finalDate: '2026-12-01' },
  { show: 'Campaign UK Agency of the Year', finalDate: '2026-12-01' },
  { show: 'Campaign Asia Women to Watch APAC', finalDate: '2026-12-01' },
]

const AS_OF = '2026-07-16'

function baseInput(overrides = {}) {
  return {
    discipline: 'creative',
    maturity: 'intermediate',
    region: 'APAC',
    budget: 50000,
    budgetCurrency: 'USD',
    campaignsReady: null,
    pins: [],
    excludes: [],
    lens: 'maximize_client_travel',
    orgType: 'agency',
    ...overrides,
  }
}

let fails = 0
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '   <-- ' + detail}`)
  if (!cond) fails++
}
const show = s => JSON.stringify(s)
const names = lines => lines.map(l => l.show_name)

console.log('lib/planner-engine.ts fixture (P2.1)\n')

// 1. Determinism.
{
  const input = baseInput()
  const p1 = derivePlan(input, FACETS, AS_OF, DEADLINES)
  const p2 = derivePlan(input, FACETS, AS_OF, DEADLINES)
  check('1. Determinism: two runs of identical input produce identical JSON', JSON.stringify(p1) === JSON.stringify(p2))
}

// 2. Discipline is now a TILT, not a hard filter (P2.1 #5). A media agency
// STILL SEES creative shows (they are no longer removed) but its own-discipline
// show leads and off-discipline shows are flagged on_discipline:false.
{
  const input = baseInput({ discipline: 'media' })
  const plan = derivePlan(input, FACETS, AS_OF, DEADLINES)
  const dad = plan.work.find(li => li.show_name === 'D&AD')
  const fom = plan.work.find(li => li.show_name === 'Festival of Media')
  check('2. Discipline tilt: media agency now STILL receives D&AD (not hard-filtered)', !!dad, show(names(plan.work)))
  check('2b. Discipline tilt: D&AD marked off-discipline for a media agency', dad?.on_discipline === false, show(dad))
  check('2c. Discipline tilt: Festival of Media marked on-discipline', fom?.on_discipline === true, show(fom))
  // On-discipline leads within its geo tier: FoM before Effie/Spikes (all regional).
  const order = names(plan.work)
  const iFom = order.indexOf('Festival of Media')
  const iEffie = order.indexOf('Effie APAC')
  const iSpikes = order.indexOf('Spikes Asia')
  check('2d. Discipline tilt: on-discipline regional show leads its tier', iFom >= 0 && iFom < iEffie && iFom < iSpikes, show(order))
}

// 3. Geo ladder tilt by maturity (unchanged rule): advanced > beginner prestige.
{
  const beginnerPlan = derivePlan(baseInput({ maturity: 'beginner' }), FACETS, AS_OF, DEADLINES)
  const advancedPlan = derivePlan(baseInput({ maturity: 'advanced' }), FACETS, AS_OF, DEADLINES)
  const countPrestige = plan => plan.work.filter(li => li.tier === 'prestige').length
  check(
    '3. Geo ladder tilt: advanced agency gets more prestige-tier global slots than beginner',
    countPrestige(advancedPlan) > countPrestige(beginnerPlan),
    `beginner=${countPrestige(beginnerPlan)} advanced=${countPrestige(advancedPlan)}`,
  )
  const nationalLine = beginnerPlan.work.find(li => li.show_name === 'National Effectiveness Show')
  check('3b. National-scope line always tiers as core', nationalLine?.tier === 'core', show(nationalLine))
}

// 4. Closed-deadline + coverage gap (region-accurate now).
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const nationalLine = plan.work.find(li => li.show_name === 'National Effectiveness Show')
  check('4. Closed-deadline: past-deadline show resolves to next_cycle, not live', nationalLine?.cycle_status === 'next_cycle', show(nationalLine))
  check(
    '4b. Closed-deadline: a next_cycle-only national show still flags exactly one coverage gap (national floor), region APAC',
    plan.coverage_gaps.length === 1 && plan.coverage_gaps[0].region === 'APAC',
    show(plan.coverage_gaps),
  )
}

// 5. Global SABRE exclusion (unchanged): never in any lane; pin cannot override.
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const inAnyLane = [...plan.work, ...plan.agency_titles, ...plan.people].some(li => li.show_name === 'Global SABRE Awards')
  check('5. Global SABRE: excluded from every lane', !inAnyLane)
  check('5b. Global SABRE: recorded in excluded_not_directly_enterable', plan.excluded_not_directly_enterable.includes('Global SABRE Awards'), show(plan.excluded_not_directly_enterable))
  const pinnedPlan = derivePlan(baseInput({ pins: ['Global SABRE Awards'] }), FACETS, AS_OF, DEADLINES)
  const pinnedInAnyLane = [...pinnedPlan.work, ...pinnedPlan.agency_titles, ...pinnedPlan.people].some(li => li.show_name === 'Global SABRE Awards')
  check('5c. Global SABRE: a pin cannot override the hard exclusion', !pinnedInAnyLane)
}

// 6. No rate/odds field anywhere.
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const allLines = [...plan.work, ...plan.agency_titles, ...plan.people]
  const forbiddenKeys = ['win_rate', 'shortlist_rate', 'odds', 'win_odds', 'rate']
  const offender = allLines.find(li => forbiddenKeys.some(k => k in li.facet || k in li))
  check('6. No plan line item ever carries a rate/odds field', !offender, show(offender))
}

// 7. REGION GATE (P2.1 #6): a China agency never receives a UK/US national or
// regional show in ANY lane; a global show still appears; an APAC regional show
// appears (China is within APAC); a pinned foreign show still overrides.
{
  const plan = derivePlan(baseInput({ discipline: 'full_service', region: 'China' }), FACETS, AS_OF, DEADLINES)
  const allNames = names([...plan.work, ...plan.agency_titles, ...plan.people])
  check('7. Region gate: China agency does NOT get PRCA UK Awards (UK national)', !allNames.includes('PRCA UK Awards'), show(allNames))
  check('7b. Region gate: China agency does NOT get SABRE Awards North America (NA regional)', !allNames.includes('SABRE Awards North America'), show(allNames))
  check('7c. Region gate: China agency does NOT get Campaign UK Agency of the Year (UK national title)', !allNames.includes('Campaign UK Agency of the Year'), show(allNames))
  check('7d. Region gate: China agency STILL gets a global show (Cannes Lions)', allNames.includes('Cannes Lions'), show(allNames))
  check('7e. Region gate: China agency gets APAC regional shows (China ⊂ APAC): Spikes Asia', allNames.includes('Spikes Asia'), show(allNames))
  check('7f. Region gate: China agency gets its own national show (ROI Festival)', allNames.includes('ROI Festival'), show(allNames))
  check('7g. Region gate: APAC-only agency does NOT get China-national ROI Festival', !names(derivePlan(baseInput({ discipline: 'full_service', region: 'APAC' }), FACETS, AS_OF, DEADLINES).work).includes('ROI Festival'))
  const pinned = derivePlan(baseInput({ discipline: 'full_service', region: 'China', pins: ['PRCA UK Awards'] }), FACETS, AS_OF, DEADLINES)
  check('7h. Region gate: a pin overrides the region gate (China agency pins PRCA UK)', names(pinned.work).includes('PRCA UK Awards'), show(names(pinned.work)))
}

// 8. CAMPAIGNS BREADTH CAP (P2.1 #4): campaigns-ready limits recommended
// (non-reserve) work shows to campaigns * 3; overflow demotes to reserve.
{
  const uncapped = derivePlan(baseInput({ discipline: 'full_service', campaignsReady: null }), FACETS, AS_OF, DEADLINES)
  const capped = derivePlan(baseInput({ discipline: 'full_service', campaignsReady: 1 }), FACETS, AS_OF, DEADLINES)
  const rec = plan => plan.work.filter(li => li.tier !== 'flexible_reserve').length
  check('8. Campaigns breadth: 1 campaign caps recommended work shows at 3', rec(capped) === 3, `capped=${rec(capped)}`)
  check('8b. Campaigns breadth: uncapped plan recommends strictly more than the capped plan', rec(uncapped) > rec(capped), `uncapped=${rec(uncapped)} capped=${rec(capped)}`)
  check('8c. Campaigns breadth: overflow is demoted to reserve, never dropped (same total work lines)', uncapped.work.length === capped.work.length, `uncapped=${uncapped.work.length} capped=${capped.work.length}`)
}

// 9. ENTRIES-PER-CAMPAIGN is DERIVED, not assumed (P2.1 #4).
{
  const healthy = derivePlan(baseInput({ budget: 7000, budgetCurrency: 'USD', campaignsReady: 2 }), FACETS, AS_OF, DEADLINES)
  check('9. Capacity: 7000 USD / ~700 = 10 affordable entries', healthy.capacity.affordable_entries === 10, show(healthy.capacity))
  check('9b. Capacity: entries_per_campaign = affordable / campaigns = 10/2 = 5', healthy.capacity.entries_per_campaign === 5, show(healthy.capacity))
  check('9c. Capacity: healthy plan is not under_budgeted', healthy.capacity.under_budgeted === false)
  const tight = derivePlan(baseInput({ budget: 700, budgetCurrency: 'USD', campaignsReady: 20 }), FACETS, AS_OF, DEADLINES)
  check('9d. Capacity: budget under one entry per campaign flags under_budgeted', tight.capacity.under_budgeted === true, show(tight.capacity))
  const none = derivePlan(baseInput({ campaignsReady: null }), FACETS, AS_OF, DEADLINES)
  check('9e. Capacity: no campaigns supplied -> entries_per_campaign null, max_recommended null', none.capacity.entries_per_campaign === null && none.capacity.max_recommended_shows === null, show(none.capacity))
}

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILURE(S)`}`)
process.exit(fails === 0 ? 0 : 1)
