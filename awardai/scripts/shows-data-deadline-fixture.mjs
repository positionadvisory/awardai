// scripts/shows-data-deadline-fixture.mjs — deadline honesty fixture.
// Added 29 Aug 2026 (APP-SHOW-DATES-HONESTY).
//
// WHY THIS EXISTS. lib/shows-data.ts carried finalDate '2026-08-31' for London
// International Awards, marked confidence 'verified', byte-identical to that
// row's own eligibilityWindow.end. The ELIGIBILITY cut-off had been written into
// the DEADLINE field. Production therefore told every LIA user "2 days to
// deadline, too tight for entry + video", and would have flipped to "Deadline
// passed" on 1 Sep while LIA entries were still open. The same figure reached a
// customer call and the daily brief as "final entry deadline: Monday, August 31,
// 2026". LIA publishes no entry close at all: its fees page says entries run
// "from 1st July 2026 until Entry System Closes" with "No Late Fees"
// (re-verified live 29 Aug 2026).
//
// NOTE ON METHOD, deliberately different from the other three fixtures in this
// folder. planner-engine-fixture.mjs and planner-v3-engine-fixture.mjs HAND-COPY
// the logic under test, and that file's own header records what it cost: it
// asserted a sixteen-day-old snapshot for eight days without anyone noticing.
// This fixture hand-copies nothing. lib/shows-data.ts is a leaf module with zero
// imports, so Node's native type stripping (unflagged since 22.18) imports the
// real file directly. Change a row and this fixture sees the change. If it ever
// throws on a syntax Node cannot strip (enum, namespace, parameter properties),
// that is the signal to bundle it, not to start copying rows in here by hand.
//
// Run: node scripts/shows-data-deadline-fixture.mjs
// Requires Node >= 22.18.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src  = resolve(here, '..', 'lib', 'shows-data.ts')

const { getDeadlineUrgency, DEADLINES_2026 } = await import(pathToFileURL(src).href)

let pass = 0, fail = 0
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++ } else {
    fail++
    console.error(`FAIL: ${label}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

// ── The three states that used to collapse into 'ok' ───────────────────────
// This is the whole point. 'ok' must mean "there is a deadline and it is
// comfortably away", never "we hold nothing" and never "the show publishes
// nothing". Same class as the planner eligibility roll-up, which learned it
// twice before this file learned it once.
is('unknown show is not ok', getDeadlineUrgency('Some Show We Do Not Carry').level, 'unknown')
is('empty show name is not ok', getDeadlineUrgency('').level, 'unknown')
is('null show name is not ok', getDeadlineUrgency(null).level, 'unknown')
is('LIA publishes no close', getDeadlineUrgency('London International Awards').level, 'no_published_close')
is('LIA offers no daysLeft', getDeadlineUrgency('London International Awards').daysLeft, null)
is('a row with an empty finalDate is not ok', getDeadlineUrgency('Spikes Asia').level, 'no_published_close')

// ── THE GUARD. No row may file an eligibility bound as an entry deadline. ──
// finalDate is when ENTRIES CLOSE. eligibilityWindow bounds THE WORK. The type
// comment in shows-data.ts has said so since 7 Aug 2026 and the LIA row broke it
// anyway, so the rule is now mechanical rather than documentary.
const collisions = DEADLINES_2026
  .filter(d => d.finalDate && d.eligibilityWindow && d.finalDate === d.eligibilityWindow.end)
  .map(d => d.show)
is('no row files an eligibility end as a deadline', collisions, [])

// ── Row integrity ──────────────────────────────────────────────────────────
is('no duplicate show names',
   DEADLINES_2026.map(d => d.show).filter((n, i, a) => a.indexOf(n) !== i), [])
is('every row carries lastVerified',
   DEADLINES_2026.filter(d => !d.lastVerified).map(d => d.show), [])
is('every finalDate is a real ISO date',
   DEADLINES_2026.filter(d => d.finalDate && Number.isNaN(Date.parse(d.finalDate + 'T00:00:00'))).map(d => d.show), [])
is('every eligibilityWindow carries a rule',
   DEADLINES_2026.filter(d => d.eligibilityWindow && !d.eligibilityWindow.rule).map(d => d.show), [])

// ── Exact match must beat a substring neighbour sitting earlier in the array ─
// The matcher tested equality, contains and contained-by in one .find(), so the
// first row that merely CONTAINED the query won over a later row that equalled
// it. Now two passes: exact, then tolerant.
for (const row of DEADLINES_2026) {
  const got = getDeadlineUrgency(row.show)
  if (row.finalDate) {
    is(`exact name resolves its own row: ${row.show}`, got.deadlineDate, row.finalDate)
  }
}

// ── Dated rows for the currently open cycles ───────────────────────────────
for (const [name, date] of [
  ['ICCO Global Awards', '2026-08-28'],
  ['The Drum Awards Festival', '2026-09-03'],
  ['ADCE Awards', '2026-09-25'],
  ['Eurobest', '2026-10-15'],
  ['Epica Awards', '2026-10-30'],
  ['The Indie Awards', '2026-12-03'],
]) {
  is(`${name} carries its verified close`, getDeadlineUrgency(name).deadlineDate, date)
}

// ── NO SUBSTRING CAPTURE (added 31 Aug 2026) ───────────────────────────────
// The 24 Aug addendum predicted that "a new short show name can silently
// capture another show's date". It was already live. getDeadlineUrgency's
// second pass tested `d.show.includes(query) || query.includes(d.show)`, so
// One Show Indies -- a separately carried show, active in dynamic_shows with
// its own show_profiles row and a 38-entry category list -- inherited The One
// Show's 20 Feb 2026 close, and resolveWinRateKey handed it the same show's
// $625 fee. African Cristal Festival inherited Cristal Festival's row the same
// way. The substring pass is gone; resolution is exact, then via the alias map
// (a decision list), and a show we hold no deadline for returns 'unknown'.
//
// These assertions exist to stop the substring pass being reintroduced as a
// "tolerance fix". A LONGER NAME IS A DIFFERENT SHOW until KB_SHOW_ALIASES says
// otherwise. If one of these starts failing because we genuinely carried the
// show, delete that line -- do not loosen the matcher.
const { resolveWinRateKey } = await import(pathToFileURL(src).href)

for (const [longer, mustNotBecome] of [
  ['One Show Indies', '2026-02-20'],          // The One Show's close
  ['African Cristal Festival', 'Cristal Festival'],
]) {
  const u = getDeadlineUrgency(longer)
  is(`${longer} does not inherit a neighbour's deadline`, u.level, 'unknown')
  is(`${longer} exposes no deadline date`, u.deadlineDate, null)
  void mustNotBecome
}
is('One Show Indies is charged no fee it does not have', resolveWinRateKey('One Show Indies'), null)
is('bare "Festival of Media" picks no FoM programme for the user', getDeadlineUrgency('Festival of Media').level, 'unknown')

// ── The alias map IS the tolerance, and it must carry these ────────────────
// Every name below was written by generate-directions into a live directions
// row and resolved to nothing (31 Aug 2026 findings). They are name drift on
// shows we DO carry, so they must resolve; the shows we do not carry must not.
for (const [variant, canonical] of [
  ['Cannes Lions 2026', 'Cannes Lions'],
  ['Cannes Lions - Film', 'Cannes Lions'],
  ['Effies', 'Effie APAC'],
  ['Effie Awards APAC', 'Effie APAC'],
  ['Asia Pacific Effie Awards', 'Effie APAC'],
  ['SMARTIES APAC', 'MMA Smarties APAC'],
  ['MMA Smarties X Global', 'MMA Smarties Global'],
  ['The One Show', 'One Show'],
  ['Campaign Asia Agency of the Year Awards', 'Campaign Asia Agency of the Year'],
  ['Campaign Asia-Pacific Agency of the Year', 'Campaign Asia Agency of the Year'],
]) {
  const want = DEADLINES_2026.find(d => d.show === canonical)
  if (!want) { is(`canonical exists: ${canonical}`, false, true); continue }
  is(`variant resolves: ${variant} -> ${canonical}`, getDeadlineUrgency(variant).deadlineDate, want.finalDate ?? null)
}

// ── Shows we do NOT carry must stay uncarried ──────────────────────────────
// Every one of these is a real programme the model recommended to a real org.
// They must read 'unknown', never borrow a neighbour's date.
for (const uncarried of [
  'MMA Smarties Vietnam', 'MMA Smarties China', 'Festival of Media Global',
  'WARC Awards for Effectiveness', 'WARC Awards for Asian Strategy',
  'Clio Health', 'Effies North America', 'Effies EMEA',
]) {
  is(`uncarried show reads unknown: ${uncarried}`, getDeadlineUrgency(uncarried).level, 'unknown')
}

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURES'}   ${pass} assertions, ${DEADLINES_2026.length} rows`)
process.exit(fail === 0 ? 0 : 1)
