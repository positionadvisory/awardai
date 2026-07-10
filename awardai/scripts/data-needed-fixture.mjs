// scripts/data-needed-fixture.mjs — Workbench P2 Chunk 3 (S138 continued)
//
// Unit fixture for lib/data-needed.ts. Unlike the entry-form-v2 fixtures
// elsewhere in this repo (which hand-copy pure functions because their source
// files import Deno-only or JSX-bearing modules), lib/data-needed.ts is
// genuinely dependency-free TypeScript, so this fixture IMPORTS THE REAL FILE
// directly. No hand-copy, no drift risk.
//
// Run (Node 22.6-22.x needs the flag explicitly; later majors strip by
// default but the flag is harmless to leave on):
//   node --experimental-strip-types scripts/data-needed-fixture.mjs
//
// PROVENANCE NOTE on the two "Nicky" cases below: the Workbench-P2 brief asks
// for "Nicky's two real bracketed examples from the screenshots." This session
// does not have access to the original screenshots (they were viewed live in
// a prior chat, never saved to disk) or to a captured verbatim quote of the
// bracket text itself. The two NICKY-DERIVED cases instead encode the two
// concrete data-needed items Ben's own write-up attributed to that feedback
// session (Entry-Workbench-UX-Plan-2026-07-10.md P2 mockup: "GEO research
// reach numbers -- Owner: Frances" and "Outcome line per jury/speaking role --
// Owner: Nicky"), reformatted into the bracket+trailing-"Owner:" syntax the
// parser actually reads out of drafts. Flagged here and in the PR/session log
// so nobody mistakes this for a verified verbatim transcript.

import { parseDataRequests, extractOwner, normalizeRequestText, mergeScannedItems } from '../lib/data-needed.ts'

let fails = 0
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '   <-- ' + detail}`)
  if (!cond) fails++
}
const show = (s) => JSON.stringify(s)

console.log('lib/data-needed.ts fixture\n')

// 1. Drafter placeholder, INSERT FIGURE prefix + trailing owner.
{
  const out = parseDataRequests('The campaign reached [INSERT FIGURE: total media impressions; Owner: Frances] people across the region.')
  check(
    '1. INSERT FIGURE + owner: prefix stripped, owner extracted',
    out.length === 1 && out[0].text === 'total media impressions' && out[0].owner === 'Frances',
    show(out)
  )
}

// 2. Generic bracket, no owner.
{
  const out = parseDataRequests('Awaiting the client sign-off on [final budget breakdown] before submission.')
  check(
    '2. Generic bracket, no owner: owner null, text trimmed',
    out.length === 1 && out[0].text === 'final budget breakdown' && out[0].owner === null,
    show(out)
  )
}

// 3. Bracket with a trailing owner but no INSERT prefix.
{
  const out = parseDataRequests('[Confirm the jury panel size, Owner: Julian]')
  check(
    '3. Owner without INSERT prefix: owner still extracted, no prefix to strip',
    out.length === 1 && out[0].text === 'Confirm the jury panel size' && out[0].owner === 'Julian',
    show(out)
  )
}

// 4. Empty / null / undefined input never throws, always [].
{
  const a = parseDataRequests('')
  const b = parseDataRequests(null)
  const c = parseDataRequests(undefined)
  check('4. Empty/null/undefined input -> []', a.length === 0 && b.length === 0 && c.length === 0, `${show(a)} ${show(b)} ${show(c)}`)
}

// 5. No brackets at all -> [].
{
  const out = parseDataRequests('This section has no placeholders, just prose.')
  check('5. No brackets -> []', out.length === 0, show(out))
}

// 6. Duplicate asks within one pass are de-duplicated by normalized text.
{
  const out = parseDataRequests('Need [reach numbers] here and again [Reach Numbers.] later.')
  check('6. Same ask twice in one section -> de-duped to one item', out.length === 1 && out[0].text === 'reach numbers', show(out))
}

// 7. extractOwner: "Owner:" must be TRAILING to count -- a mid-sentence mention is not an assignment.
{
  const notTrailing = extractOwner('a note that Owner: Nicky flagged this earlier in the review')
  check(
    '7. "Owner:" not at the end is left alone (regex is end-anchored)',
    notTrailing.owner === null && notTrailing.text === 'a note that Owner: Nicky flagged this earlier in the review',
    show(notTrailing)
  )
}

// 8. normalizeRequestText collapses whitespace, strips edge punctuation (incl. an em dash), keeps internal hyphens.
{
  const n1 = normalizeRequestText('  Reach   Numbers!! ')
  const n2 = normalizeRequestText('—Reach Numbers—')
  const n3 = normalizeRequestText('year-over-year growth')
  check(
    '8. normalizeRequestText: whitespace/punct/em-dash edges stripped, internal hyphen kept',
    n1 === 'reach numbers' && n2 === 'reach numbers' && n3 === 'year-over-year growth',
    `${show(n1)} ${show(n2)} ${show(n3)}`
  )
}

// 9. mergeScannedItems: preserves existing (including checked state), appends only the genuinely new one, skips a re-scan dupe.
{
  const existing = [
    { id: 'e1', text: 'GEO research reach numbers', owner: 'Frances', done: true, source: 'parsed' },
  ]
  const scanned = [
    { text: 'GEO Research Reach Numbers.', owner: 'Frances' }, // same ask, re-scanned -- must NOT duplicate or reset done
    { text: 'Confirm speaking-role outcome', owner: 'Nicky' }, // genuinely new
  ]
  let nextId = 100
  const merged = mergeScannedItems(existing, scanned, () => `new-${nextId++}`)
  const kept = merged.find(i => i.id === 'e1')
  const added = merged.find(i => i.text === 'Confirm speaking-role outcome')
  check(
    '9. mergeScannedItems: existing checked item untouched, only the new ask appended',
    merged.length === 2 && kept?.done === true && !!added && added.source === 'parsed',
    show(merged)
  )
}

// 10. mergeScannedItems: nothing new -> returns the SAME array reference (no gratuitous state churn / re-renders).
{
  const existing = [{ id: 'e1', text: 'budget breakdown', owner: null, done: false, source: 'manual' }]
  const scanned = [{ text: 'Budget Breakdown', owner: null }]
  const merged = mergeScannedItems(existing, scanned, () => 'unused')
  check('10. mergeScannedItems: no new items -> same array reference returned', merged === existing)
}

// 11. NICKY-DERIVED -- GEO research reach numbers, owner Frances. See provenance note at top of file:
// reconstructed from Entry-Workbench-UX-Plan-2026-07-10.md's write-up of the live feedback session
// mockup, NOT a verbatim screenshot transcript (the screenshots are not available to this session).
{
  const out = parseDataRequests('Regional performance is strong, but [GEO research reach numbers; Owner: Frances] still needs sourcing before this section can be scored fully.')
  check(
    '11. Nicky-derived case A (GEO reach numbers / Frances)',
    out.length === 1 && out[0].text === 'GEO research reach numbers' && out[0].owner === 'Frances',
    show(out)
  )
}

// 12. NICKY-DERIVED -- outcome line per jury/speaking role, owner Nicky. Same provenance caveat as #11.
{
  const out = parseDataRequests('Speaking credentials are listed but [outcome line per jury or speaking role; Owner: Nicky] is still missing for two of the three roles.')
  check(
    '12. Nicky-derived case B (outcome line per jury/speaking role / Nicky)',
    out.length === 1 && out[0].text === 'outcome line per jury or speaking role' && out[0].owner === 'Nicky',
    show(out)
  )
}

console.log(fails === 0 ? '\nAll checks passed.' : `\n${fails} check(s) FAILED.`)
process.exit(fails === 0 ? 0 : 1)
