// lib/indie-copy.ts
//
// Every string the Indie pre-read shows an entrant, in one place.
//
// SOURCE OF RECORD: Indie-Pre-Read-Flow-and-Copy-2026-09-08.md section 9. Each
// value below is that file's locked copy byte for byte. It is not a starting
// point to improve: the register was settled against Julian's neutral-middleman
// constraint and the no-free-tier rule, and a helpful edit here breaks a
// commitment made to a partner rather than a style preference.
//
// FOUR STRINGS ARE NOT FROM T5 SECTION 9, and each is marked NOT-T5 at its own
// definition with the decision that authorised it. Nothing else may be added
// without going back to that file.
//
// NO CATEGORY CONFIG LIVES HERE. Labels, word limits and slugs come from
// GET /api/indie/categories, which reads the same show_profiles rows the jury
// scores against. A second copy in the frontend is a copy that drifts, and the
// one that drifts first is the one on the entrant's screen.

export const INDIE_LANDING_URL_BASE = 'https://gotshortlisted.com/indie'
export const INDIE_SRC_ABSENT = 'support'
export const INDIE_VALID_SRC = ['reg', 'sub', 'form', 'support']

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export const LANDING_H1 = 'A read on your Indie Awards entry, before the deadline.'
export const LANDING_SUB = 'Paste what you have written. You get a read on how each scored section is holding up, and the three changes most worth making. Under a minute. One free read per entry.'
export const PICKER_H = 'Which category are you entering?'
export const PICKER_PLACEHOLDER = 'Choose your category'
export const PICKER_NOTE = 'The scored sections are different in each category, so this changes what you are asked to paste.'
export const CONFIRM_CHANGE = 'Change category'
export const BOXES_H = 'Paste your four scored sections.'
export const BACKGROUND_LABEL = 'Background'
export const BACKGROUND_NOTE = '150 words on the entry form, not scored. Optional here, and it makes the rest of the read sharper.'
export const ENTRY_ID_LABEL = 'Entry ID (optional)'
export const ENTRY_ID_NOTE = 'On your AwardStage confirmation, in the form IND-ML-1-1. Adding it means we can tell your entries apart if you read more than one.'
export const ENTRY_ID_PLACEHOLDER = 'IND-'
export const EMAIL_LABEL = 'Work email'
export const EMAIL_NOTE = 'Your read opens on this page. The link also goes to this address so you can come back to it.'
export const CONSENT_CHECKBOX = 'I have read how this works below.'
export const CONSENT_BLOCK = 'What happens to what you paste. We use your text to produce this one read and to email you the link to it. We do not pass it to the Indie Awards, to its judges, or to anyone else. If you upload a file instead, we read the text out of it and keep the text only: the file itself is never stored. One free read per entry, and no card is asked for at any point on this page.'
export const SUBMIT_LABEL = 'Read my entry'
export const SUBMIT_SUB = 'No account. No card. Under a minute.'
export const PDF_TOGGLE = 'Would rather upload? Send the PDF instead.'
export const PDF_NOTE = 'Upload takes longer. We have to find your four sections in the document before anything can be read, so it runs about two minutes and we email you the link rather than keeping you here. Pasting is faster and gives a sharper read, because you tell us which section is which.'
export const PDF_SUBMIT_LABEL = 'Send my entry'
export const PDF_SENT_H = 'On its way.'
export const PDF_SENT_CAVEAT = 'If we cannot get text out of the file, we will say so and ask you to paste instead. Scanned documents and image-only PDFs are the usual reason.'
export const PDF_FILE_HINT = 'PDF or Word document'

export function confirmLine(category: string): string {
  return 'Entering ' + category + '.'
}
export function boxesNote(category: string): string {
  return 'These are the four sections ' + category + ' is scored on, in the order the entry form asks for them. Paste each one into its own box. Partial is fine, and a section left empty is read as missing rather than weak.'
}
export function countUnder(n: number, limit: number): string {
  return n + ' of ' + limit + ' words'
}
export function countOver(n: number, limit: number): string {
  return n + ' words, ' + limit + ' on the entry form'
}
export function pdfSentBody(filename: string, email: string): string {
  return 'We are reading ' + filename + ' now. The link lands in your inbox at ' + email + ' in about two minutes. You can close this page.'
}

// NOT-T5. The inline notext state. T5 2g commits the page to saying so ("If we
// cannot get text out of the file, we will say so and ask you to paste
// instead") but section 9 defines the string only as an EMAIL body, 5c. These
// are 5c's own sentences on the page, including its last line, which exists
// because without it a failed upload reads as a wasted single chance.
export function pdfNoTextInline(filename: string): string {
  return filename + ' came through, but there was no text in it we could read. That usually means it is a scan or an image rather than a text document. Paste your sections above instead, and the read comes back in under a minute. This has not used up your free read.'
}

// NOT-T5. The nothing-found twin of pdfNoTextInline above: the file has
// readable text, but the segmenter found none of the four scored sections in
// it (a deck, a brief, a draft with nothing written yet). Ben's framing,
// approved 9 Sep 2026 (T7e): this is not the scan/image case, so it must not
// open on "there was no text in it we could read", which is wrong for this
// file and would send the entrant hunting for a scanner that is not the
// problem.
export function pdfNoSectionsInline(filename: string, category: string): string {
  return filename + ' came through and we could read it, but none of the four sections ' + category + ' is scored on are in it yet. You probably do not want a read at this stage. When the sections exist, paste them above and the read comes back in under a minute. This has not used up your free read.'
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export const PROGRESS_H = 'Reading your entry. Under a minute.'
export const PROGRESS_ESTIMATE_MS = 45000
export const PROGRESS_ACCENT = '#c9a95c'
export const PROGRESS_INTERVAL_MS = 5000
export const PROGRESS_RANDOM_START = false
export const PROGRESS_OVERRUN = 'This one is taking longer than usual. Leave the page open, or close it and we will email you the link when it lands.'
export const PROGRESS_OVERRUN_AFTER_MS = 90000

export const INDIE_READ_STATEMENTS = [
  'Reading your four sections.',
  'Checking each one against how this category is scored.',
  'Looking for the claim with nothing behind it.',
  'Working out which section a jury stops at.',
  'Weighing the evidence you have given.',
  'Comparing the shape against what usually places.',
  'Deciding which three changes are worth your time.',
  'Nearly there.',
]

export const INDIE_PDF_STATEMENTS = [
  'Opening your document.',
  'Finding the four scored sections.',
]

// ---------------------------------------------------------------------------
// Read page
// ---------------------------------------------------------------------------

export const SHAPE_NOT_GRADE_H = 'Read this as a shape, not a grade.'
export const SHAPE_NOT_GRADE_BODY = 'Four sections, four bands, and the pattern between them is the point. A section marked low is not a verdict on the work. It is a description of what is currently on the page for a jury to read.'

// NOT-T5. Adopted by the QB as a condition of the launch gate after T3
// ("the line sits next to the bands", Calibration-2026-Report section on the
// copy caveat). T3's wording is a sentence in the entrant's own frame, and it
// is also the honest explanation of any low band, so it sits with the bands
// rather than in a footer.
export const READ_IS_OF_THE_DOCUMENT = 'This reads your written case the way a judge reads it. It cannot see your film, your design or your photography.'

export const READ_SUB = 'A read on your entry, before the deadline.'
export const NO_SCORE_LINE = 'No overall score is quoted here, deliberately. A single number on a draft entry is a headline, and this is a diagnostic.'
export const FOOTER_CHIP_A = 'Shortlist analysis · no overall score quoted'
export const ADJUSTMENTS_NOTE = 'Your entry can be edited until the deadline. These are ordered by how much they move the read, not by how easy they are.'

export const BAND_LEGEND: { band: string; meaning: string }[] = [
  { band: 'Strongest', meaning: 'The section a jury will remember.' },
  { band: 'Strong', meaning: 'Doing its job, and could still be sharpened.' },
  { band: 'Solid', meaning: 'Nothing wrong with it, nothing that stands out.' },
  { band: 'Needs detail', meaning: 'The argument is there. The specifics are not.' },
  { band: 'Blocking', meaning: 'A jury stops here. Fix this before you submit.' },
  { band: 'Unproven chain', meaning: 'The claim is made. The evidence for it is not on the page.' },
]

// ADJUSTMENTS_H keys off the count the payload reports, so the heading can
// never promise three items over a list of two. T7a measured the jury
// returning four gaps on all 88 production evaluations, so three is the
// expected case rather than the lucky one.
export function adjustmentsHeading(count: number): string {
  return count === 3 ? 'Three changes worth making' : 'Changes worth making'
}

export function tokenReused(date: string): string {
  return 'This read is already done. Nothing has changed since ' + date + ', because a read is produced once per entry.'
}

// ---------------------------------------------------------------------------
// Stage 2 and stage 3
// ---------------------------------------------------------------------------

export const STAGE2_CONTROL = 'See which other Indie categories fit this work'
export const STAGE2_CONTROL_NOTE = 'Same entry, read against the other 2027 categories. About 65 seconds.'
export const STAGE2_BUTTON = 'Show me'
export const STAGE2_PROGRESS_H = 'Checking this against the other 2027 categories.'
export const STAGE2_ESTIMATE_MS = 70000
export const STAGE2_RESULT_H = 'Also fits'
export const STAGE2_FEE_NOTE = 'Each additional Indie category is a separate entry and a separate fee. These are ranked on fit with what the category rewards, not on how likely you are to win.'
export const STAGE2_EMPTY = 'Nothing else fits well enough to be worth a fee. This work belongs in the category you have chosen and nowhere else on the 2027 list.'

export const INDIE_DIRECTIONS_STATEMENTS = [
  'Reading the work again, without the category in mind.',
  'Setting it against each 2027 category in turn.',
  'Discarding the ones it only half fits.',
  'Checking what each category actually rewards.',
  'Ranking what is left.',
]

export const STAGE3_H = 'Where else this work could go'
export const STAGE3_BUTTON = 'Unlock this'
export const STAGE3_LOCKED_MARK = '[locked]'

export function stage3Sub(n: number): string {
  return n + ' shows outside the Indie Awards, with a category named in each.'
}

export const CTA1_H = 'Unlock this, and everything else'
export const CTA1_BODY = 'Shortlist is $299 a month. The first 7 days are free and a card is needed to start, so cancel inside the week and nothing is charged. That opens where else this work goes, the entry drafting, and the jury read on every show we cover.'
export const CTA1_BUTTON = 'Start the 7-day trial'
export const CTA2_H = 'Read first, decide later'
export const CTA2_BODY = 'We publish on how award programs are actually run: which categories are worth a fee, how juries read entries, what a program looks like when it compounds.'
export const CTA2_LINK = 'Read the articles'
export const CTA3_H = 'Another entry to check?'
export const CTA3_BODY = 'Every Indie entry gets one free read. If you have a second one in a different category, run it.'
export const CTA3_LINK = 'Run another entry'

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

// Locked by the QB, 8 Sep. Two 429 reasons, two strings, and they must not be
// swapped: the daily ceiling means come back tomorrow, the per-caller throttle
// means this connection specifically. Showing the queue string to somebody on
// a shared office IP tells them the whole service is full when it is not.
export const QUEUE_DAILY_CAP = 'We have hit today\'s limit for free reads. Leave your email and the read comes back tomorrow, no charge, or come back after midnight UTC.'
export const QUEUE_IP_THROTTLE = 'Too many reads have come from this connection in the last hour. Give it a little while and try again; nothing has been used up.'

// NOT-T5. section_alignment_warnings above zero means the bands may be
// attached to the wrong criteria, which is worse than no read, so the page
// refuses rather than renders. No T5 string covers a defect T5 did not know
// about.
export const READ_FAILED = 'We could not finish this read. Nothing has been charged and nothing has been used up. Paste your sections again in a few minutes.'

// NOT-T5. The read exists but this page could not load it, which is neither a
// bad token nor a failed read, so it must not borrow either of their strings:
// READ_FAILED tells the entrant nothing has been used up, which would be a
// guess here, and READ_NOT_FOUND would send them off to run a second read they
// do not need.
export const READ_LOAD_FAILED = 'This read did not load. Reload the page and it should come back.'

// NOT-T5. A mutated token and an expired token return the same 404 from the
// API on purpose, so they say the same thing here. One line, no detail: a
// distinct expired message would confirm to a guesser that the token existed.
export const READ_NOT_FOUND = 'This link does not open a read. Check the link in your email, or run a new read.'
