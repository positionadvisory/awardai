// lib/data-needed.ts — Workbench P2 (S138)
//
// Pure, dependency-free parsing + merge helpers for the per-section
// "data needed" checklist. No React, no Supabase, no Deno globals: this file
// is unit-testable in plain Node (see scripts/data-needed-fixture.mjs) and is
// imported by both the client (components/DataNeededList + SectionWorkbench)
// and, later, any edge/server code that wants the same extraction.
//
// The checklist is USER-OWNED state. These helpers never mutate their inputs
// and never drop a user-checked item: a re-scan only APPENDS genuinely new
// requests (matched by normalized text) and always preserves what already
// exists. See Workbench-P2-Design-Build-Brief-2026-07-10.md, Chunk 3.

export type DataNeededSource = 'parsed' | 'jury' | 'manual'

export type DataNeededItem = {
  id: string
  text: string
  owner?: string | null
  done: boolean
  source: DataNeededSource
}

export type ParsedRequest = {
  text: string
  owner: string | null
}

// A trailing "Owner: Name" token inside a bracket assigns the ask to a person.
// Case-insensitive, anchored to the end of the bracket content. The owner
// capture is DELIBERATELY BOUNDED to 1-3 word-tokens (first/last name, or an
// initial): an unbounded `[^\]]+?` here (the original Chunk 1 shape) will
// happily swallow a whole runaway sentence as "the owner" whenever the literal
// substring "Owner:" occurs anywhere before the bracket's end, which is not
// the same guarantee as "mentioned mid-sentence is ignored" -- it only looks
// anchored because $ forces the capture to reach the string end, and a short
// name usually does. Found via the Chunk 3 fixture (data-needed-fixture.mjs
// check 7): "a note that Owner: Nicky flagged this earlier in the review"
// mis-captured owner="Nicky flagged this earlier in the review". Bounding to
// 1-3 tokens makes a genuine trailing "Owner: Name" match while a mid-sentence
// "Owner:" followed by ordinary prose fails to match at all (falls through to
// owner: null), because the prose can't be squeezed into <=3 tokens before $.
const OWNER_RE = /[;,.]?\s*Owner:\s*([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})\s*$/i

// The drafter emits explicit placeholders as [INSERT FIGURE: description] when a
// figure a section needs is not in the source material (see the config drafter
// prompt). We also treat any other bracketed block as a candidate ask.
const INSERT_PREFIX_RE = /^INSERT(?:\s+FIGURE)?\s*:?\s*/i

// All non-nested bracket blocks. Drafter placeholders are never nested, so a
// simple [^\]] class is correct and avoids catastrophic backtracking.
const BRACKET_RE = /\[([^\][]+)\]/g

/** Split a raw bracket body into { text, owner }, stripping an INSERT prefix. */
export function extractOwner(rawInner: string): ParsedRequest {
  let owner: string | null = null
  let body = rawInner

  const ownerMatch = body.match(OWNER_RE)
  if (ownerMatch) {
    owner = ownerMatch[1].trim() || null
    body = body.slice(0, ownerMatch.index).trim()
  }

  body = body.replace(INSERT_PREFIX_RE, '').trim()
  return { text: body, owner }
}

/**
 * Extract data requests from a section's current text. Returns one entry per
 * bracketed ask, in document order, de-duplicated by normalized text within
 * this single pass. Never throws on odd input; returns [] for empty/undefined.
 */
export function parseDataRequests(text: string | null | undefined): ParsedRequest[] {
  if (!text) return []
  const out: ParsedRequest[] = []
  const seen = new Set<string>()
  // Reset lastIndex defensively (module-level regex with /g is stateful).
  BRACKET_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BRACKET_RE.exec(text)) !== null) {
    const parsed = extractOwner(m[1])
    if (!parsed.text) continue
    const key = normalizeRequestText(parsed.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(parsed)
  }
  return out
}

/** Normalized form used for diffing/dedup: lowercase, collapsed whitespace, no edge punctuation. */
export function normalizeRequestText(s: string): string {
  // Trim edge whitespace + common punctuation. Deliberately an explicit ASCII/
  // dash class, NOT \p{P} with the /u flag: this project's TS target is below
  // ES2015, which rejects the unicode flag (same downlevel constraint as the
  // Set-spread gotcha). Hyphen is last in the class so it stays literal.
  const EDGE = "[\\s.,;:!?\"'()\\]\\[{}\\u2013\\u2014-]+"
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(new RegExp('^' + EDGE + '|' + EDGE + '$', 'g'), '')
    .trim()
}

/**
 * Merge freshly-scanned requests into an existing checklist. Existing items are
 * preserved verbatim (order + checked state); a scanned request is appended only
 * if no existing item has the same normalized text. Pure: returns a new array.
 * `makeId` supplies ids for appended items (caller owns id strategy).
 */
export function mergeScannedItems(
  existing: DataNeededItem[],
  scanned: ParsedRequest[],
  makeId: () => string,
): DataNeededItem[] {
  const present = new Set(existing.map(i => normalizeRequestText(i.text)))
  const appended: DataNeededItem[] = []
  for (const req of scanned) {
    const key = normalizeRequestText(req.text)
    if (!key || present.has(key)) continue
    present.add(key)
    appended.push({
      id: makeId(),
      text: req.text,
      owner: req.owner,
      done: false,
      source: 'parsed',
    })
  }
  return appended.length ? [...existing, ...appended] : existing
}
