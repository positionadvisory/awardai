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

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURES'}   ${pass} assertions, ${DEADLINES_2026.length} rows`)
process.exit(fail === 0 ? 0 : 1)
