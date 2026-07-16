// scripts/planner-engine-fixture.mjs — Portfolio Planner v2, build session P1.
//
// Unit fixture for lib/planner-engine.ts. UNLIKE lib/data-needed.ts (which the
// data-needed-fixture.mjs imports directly, because it is genuinely
// dependency-free), lib/planner-engine.ts value-imports
// isExcludedFacet/facetAdmitsDiscipline from lib/planner-facets.ts, which in
// turn imports lib/supabase.ts (createClient() throws immediately without
// live env vars) and uses the app's `@/*` path alias (which plain Node ESM
// does not resolve). This is the SAME class of problem the data-needed
// fixture's own header describes for "the entry-form-v2 fixtures elsewhere in
// this repo" (Deno-only / JSX-bearing source files) — the precedented fix in
// this codebase is to HAND-COPY the pure logic under test into the fixture,
// flagged clearly, rather than force a real import through a shim.
//
// HAND-COPIED below, byte-identical to lib/planner-engine.ts and the two tiny
// predicates from lib/planner-facets.ts as of this session (16 Jul 2026):
//   - computeAxisWeights, resolveCycleStatus, derivePlan (planner-engine.ts)
//   - isExcludedFacet, facetAdmitsDiscipline (planner-facets.ts)
//   - a minimal sameShow (show-taxonomy.ts's tolerant-compare contract; the
//     real function also runs normaliseKbShow's alias table first, which this
//     fixture's mock show names never need to exercise)
// If lib/planner-engine.ts or lib/planner-facets.ts change, this file must be
// re-synced by hand — same discipline as every other hand-copy fixture here.
//
// Run:
//   node scripts/planner-engine-fixture.mjs

// ---- hand-copied: sameShow (minimal, case-insensitive exact match — no
// mock show name in this fixture needs the alias/year-strip machinery) ------
function sameShow(a, b) {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ---- hand-copied: lib/planner-facets.ts's two pure predicates -------------
function isExcludedFacet(facet) {
  return !!facet?.excluded
}
function facetAdmitsDiscipline(facet, agencyShowDiscipline) {
  if (facet.kind !== 'work') return true
  if (!facet.discipline) return true
  if (agencyShowDiscipline === null) return true
  return facet.discipline === agencyShowDiscipline
}

// ---- hand-copied: lib/planner-engine.ts ------------------------------------
const AGENCY_TO_SHOW_DISCIPLINE = {
  media: 'media',
  creative: 'creative',
  PR: 'PR',
  mobile_performance: 'mobile',
}
function agencyShowDiscipline(discipline) {
  if (discipline === 'full_service') return null
  return AGENCY_TO_SHOW_DISCIPLINE[discipline]
}

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
  for (const axis of AXES) {
    normalized[axis] = total > 0 ? raw[axis] / total : 0.25
  }
  return normalized
}

const GLOBAL_SLOT_CAP_BY_MATURITY = { beginner: 1, intermediate: 2, advanced: 4 }
const GEO_PRIORITY = { national: 0, regional: 1, global: 2 }

function resolveCycleStatus(showName, asOfDate, deadlines) {
  const found = deadlines.find(d => sameShow(d.show, showName))
  if (!found || !found.finalDate) {
    return { status: 'unknown_cycle', finalDate: null }
  }
  const asOf = new Date(asOfDate + 'T00:00:00')
  const final = new Date(found.finalDate + 'T00:00:00')
  return { status: final < asOf ? 'next_cycle' : 'live', finalDate: found.finalDate }
}

function derivePlan(input, facets, asOfDate, deadlines) {
  const showDiscipline = agencyShowDiscipline(input.discipline)
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
    return facetAdmitsDiscipline(f, showDiscipline)
  })

  const axisWeights = computeAxisWeights(input.maturity, input.lens, input.discipline)

  const toLineItem = f => {
    const { status, finalDate } = resolveCycleStatus(f.show_name, asOfDate, deadlines)
    return {
      show_name: f.show_name,
      facet: f,
      cycle_status: status,
      final_date: finalDate,
      pinned: isPinned(f.show_name),
    }
  }

  const workFacets = filtered.filter(f => f.kind === 'work')
  const workSorted = workFacets.slice().sort((a, b) => {
    const ga = GEO_PRIORITY[a.geo_scope ?? 'global']
    const gb = GEO_PRIORITY[b.geo_scope ?? 'global']
    if (ga !== gb) return ga - gb
    const wa = a.axis ? axisWeights[a.axis] : 0
    const wb = b.axis ? axisWeights[b.axis] : 0
    if (wa !== wb) return wb - wa
    return a.show_name.localeCompare(b.show_name)
  })

  let globalSlotsUsed = 0
  const globalCap = GLOBAL_SLOT_CAP_BY_MATURITY[input.maturity]
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
    return { ...li, tier }
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

  return {
    input,
    as_of_date: asOfDate,
    axis_weights: axisWeights,
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
  { show_name: 'D&AD', kind: 'work', axis: 'craft', discipline: 'creative', geo_scope: 'global', source: 'show_profiles' },
  { show_name: 'Effie APAC', kind: 'work', axis: 'effectiveness', discipline: 'creative', geo_scope: 'regional', source: 'show_profiles' },
  { show_name: 'Cannes Lions', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', source: 'show_profiles' },
  { show_name: 'Clio Awards', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', source: 'show_profiles' },
  { show_name: 'ANDY Awards', kind: 'work', axis: 'creative_fame', discipline: 'creative', geo_scope: 'global', source: 'show_profiles' },
  { show_name: 'Festival of Media', kind: 'work', axis: 'effectiveness', discipline: 'media', geo_scope: 'regional', source: 'show_profiles' },
  { show_name: 'National Effectiveness Show', kind: 'work', axis: 'effectiveness', discipline: 'creative', geo_scope: 'national', source: 'show_profiles' },
  {
    show_name: 'Global SABRE Awards',
    kind: 'work',
    axis: 'specialist',
    discipline: 'PR',
    geo_scope: 'global',
    excluded: 'not_directly_enterable',
    source: 'show_profiles',
  },
  { show_name: 'Campaign Asia Agency of the Year', kind: 'agency_title', geo_scope: 'regional', source: 'show_profiles' },
  { show_name: 'Campaign Asia Women to Watch APAC', kind: 'people', geo_scope: 'regional', source: 'show_profiles' },
]

const DEADLINES = [
  { show: 'D&AD', finalDate: '2026-12-01' },
  { show: 'Effie APAC', finalDate: '2026-12-01' },
  { show: 'Cannes Lions', finalDate: '2026-12-01' },
  { show: 'Clio Awards', finalDate: '2026-12-01' },
  { show: 'ANDY Awards', finalDate: '2026-12-01' },
  { show: 'Festival of Media', finalDate: '2026-12-01' },
  // Closed-cycle test show: its deadline already passed relative to the fixed
  // asOfDate used below (2026-07-16).
  { show: 'National Effectiveness Show', finalDate: '2026-03-01' },
  { show: 'Global SABRE Awards', finalDate: '2026-12-01' },
  { show: 'Campaign Asia Agency of the Year', finalDate: '2026-12-01' },
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

console.log('lib/planner-engine.ts fixture\n')

// 1. Determinism: identical inputs -> byte-identical plan (JSON round-trip).
{
  const input = baseInput()
  const p1 = derivePlan(input, FACETS, AS_OF, DEADLINES)
  const p2 = derivePlan(input, FACETS, AS_OF, DEADLINES)
  check('1. Determinism: two runs of identical input produce identical JSON', JSON.stringify(p1) === JSON.stringify(p2))
}

// 2. Discipline filter: a media-discipline agency never receives D&AD (a
// creative-discipline craft show).
{
  const input = baseInput({ discipline: 'media' })
  const plan = derivePlan(input, FACETS, AS_OF, DEADLINES)
  const hasDAD = plan.work.some(li => li.show_name === 'D&AD')
  check('2. Discipline filter: media agency never receives D&AD', !hasDAD, show(plan.work.map(l => l.show_name)))
  // Sanity: the same media agency SHOULD still receive Festival of Media
  // (a media-discipline show) and the discipline-agnostic titles/people lanes.
  const hasFOM = plan.work.some(li => li.show_name === 'Festival of Media')
  check('2b. Discipline filter: media agency still receives Festival of Media', hasFOM)
}

// 3. Geo ladder tilt: a beginner and an advanced agency, otherwise identical
// inputs, get different global-slot allocation (advanced gets strictly more
// 'prestige'-tier global lines, per GLOBAL_SLOT_CAP_BY_MATURITY 1 vs 4).
{
  const beginnerPlan = derivePlan(baseInput({ maturity: 'beginner' }), FACETS, AS_OF, DEADLINES)
  const advancedPlan = derivePlan(baseInput({ maturity: 'advanced' }), FACETS, AS_OF, DEADLINES)
  const countPrestige = plan => plan.work.filter(li => li.tier === 'prestige').length
  check(
    '3. Geo ladder tilt: advanced agency gets more prestige-tier global slots than beginner',
    countPrestige(advancedPlan) > countPrestige(beginnerPlan),
    `beginner=${countPrestige(beginnerPlan)} advanced=${countPrestige(advancedPlan)}`,
  )
  // National floor line must always be 'core' tier regardless of maturity.
  const nationalLine = beginnerPlan.work.find(li => li.show_name === 'National Effectiveness Show')
  check('3b. National-scope line always tiers as core', nationalLine?.tier === 'core', show(nationalLine))
}

// 4. Closed-deadline exclusion: National Effectiveness Show's deadline
// (2026-03-01) has passed relative to AS_OF (2026-07-16) -> cycle_status
// 'next_cycle', and it must not satisfy the national-floor coverage check
// (so a coverage gap should be flagged for that plan run).
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const nationalLine = plan.work.find(li => li.show_name === 'National Effectiveness Show')
  check('4. Closed-deadline: past-deadline show resolves to next_cycle, not live', nationalLine?.cycle_status === 'next_cycle', show(nationalLine))
  check(
    '4b. Closed-deadline: a next_cycle-only national show still flags a coverage gap (never silently treated as the live floor)',
    plan.coverage_gaps.length === 1 && plan.coverage_gaps[0].region === 'APAC',
    show(plan.coverage_gaps),
  )
}

// 5. Global SABRE exclusion: never appears in ANY lane, and is recorded in
// excluded_not_directly_enterable.
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const inAnyLane = [...plan.work, ...plan.agency_titles, ...plan.people].some(li => li.show_name === 'Global SABRE Awards')
  check('5. Global SABRE: excluded from every lane', !inAnyLane)
  check(
    '5b. Global SABRE: recorded in excluded_not_directly_enterable',
    plan.excluded_not_directly_enterable.includes('Global SABRE Awards'),
    show(plan.excluded_not_directly_enterable),
  )
  // Even a PIN cannot override a hard exclusion (excluded is checked before pins).
  const pinnedPlan = derivePlan(baseInput({ pins: ['Global SABRE Awards'] }), FACETS, AS_OF, DEADLINES)
  const pinnedInAnyLane = [...pinnedPlan.work, ...pinnedPlan.agency_titles, ...pinnedPlan.people].some(
    li => li.show_name === 'Global SABRE Awards',
  )
  check('5c. Global SABRE: a pin cannot override the hard exclusion', !pinnedInAnyLane)
}

// 6. No rate/odds field anywhere in a facet or a plan line item (structural
// guarantee — the engine must never carry odds; that lives only in
// lib/rate-facts.ts / GatedNumber).
{
  const plan = derivePlan(baseInput(), FACETS, AS_OF, DEADLINES)
  const allLines = [...plan.work, ...plan.agency_titles, ...plan.people]
  const forbiddenKeys = ['win_rate', 'shortlist_rate', 'odds', 'win_odds', 'rate']
  const offender = allLines.find(li => forbiddenKeys.some(k => k in li.facet || k in li))
  check('6. No plan line item ever carries a rate/odds field', !offender, show(offender))
}

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILURE(S)`}`)
process.exit(fails === 0 ? 0 : 1)
