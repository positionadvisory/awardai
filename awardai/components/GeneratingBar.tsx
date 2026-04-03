'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Statements ──────────────────────────────────────────────────────────────
// Edit this list or replace it with the contents of loading-statements.md.
// Each string should be 5–8 words.
const STATEMENTS: string[] = [
  'Polishing words until they blind the jury.',
  'Finding synonyms for "groundbreaking" and "unprecedented."',
  'Making good work sound like great work.',
  'Replacing "we made an ad" with poetry.',
  'Adding gravitas to an already grave situation.',
  'Sprinkling in just enough humility to seem humble.',
  'Choosing words that echo in judging rooms.',
  'Turning bullet points into prose worth reading.',
  'Making the obvious sound like a revelation.',
  'Giving the brief a proper origin story.',
  'Thinking about what judges eat for breakfast.',
  'Anticipating the judge who skims everything.',
  'Writing for the jury member half-asleep.',
  'Calibrating tone for underpaid, overcaffeinated jurors.',
  'Channeling what a Grand Prix winner sounds like.',
  'Imagining twelve strangers debating your entry.',
  'Making sure London jurors get the reference.',
  'Adjusting for juries who've seen it all.',
  'Writing as if Cannes is watching. It is.',
  'Appealing to jurors who judge on instinct.',
  'Reminding the entry the work is the hero.',
  'Contextualizing the insight nobody else would have found.',
  'Making the target audience sound worth caring about.',
  'Finding the human truth buried in the data.',
  'Inflating the cultural tension just a touch.',
  'Connecting the dots between brief and brilliance.',
  'Giving the results section its moment to shine.',
  'Making a modest budget sound like a choice.',
  'Framing the constraint as the creative catalyst.',
  'Turning "client liked it" into strategic alignment.',
  'Drafting. Deleting. Redrafting. Nearly there.',
  'Asking if this really needs another adjective.',
  'Considering if "disrupted" is the right verb.',
  'Second-guessing the opening line again.',
  'Editing for clarity. Also for drama.',
  'Checking the word count with quiet optimism.',
  'Re-reading the brief one final, unnecessary time.',
  'Making peace with the word "leverage."',
  'Running it through the pretension detector.',
  'Adding warmth without losing the sharp edge.',
  'Translating agency-speak into judging-room currency.',
  'Cross-referencing this year\'s winning entry themes.',
  'Verifying the campaign actually ran somewhere public.',
  'Making sure the results are technically defensible.',
  'Noting proudly it ran in more than one market.',
  'Quietly checking if anyone else entered this.',
  'Situating the work in the cultural moment.',
  'Giving the timeline a more flattering narrative arc.',
  'Distinguishing this from every other social campaign.',
  'Reminding the entry that humility is optional.',
  'Teaching a machine to care about craft.',
  'AI carefully not overselling. That\'s your job.',
  'Generating language no human would have chosen.',
  'Distilling your brief into something actually legible.',
  'Processing the nuance. Most of it, anyway.',
  'Asking the algorithm to channel David Abbott.',
  'Simulating the voice of a very confident strategist.',
  'Letting the machine draft; you edit ruthlessly.',
  'No shortcuts were taken. Mostly.',
  'Even the AI paused on that last line.',
  'Racing the deadline you set for yourself.',
  'Three days before entry close. Very normal.',
  'Submitting is the hardest part. Almost there.',
  'Turns out good writing takes actual time.',
  'Retroactively making this feel very planned.',
  'Reconstructing the timeline with generous rounding.',
  'Remembering why you entered this category.',
  'This would have been faster with more sleep.',
  'Entry closes in hours. You\'re fine. Probably.',
  'Finding the save button before time runs out.',
  'Making the numbers do more emotional lifting.',
  'Contextualizing the result against a very modest benchmark.',
  'Noting the uplift, which was real and measurable.',
  'Finding the metric that tells the best story.',
  'Making sure ROI is the supporting act, not the lead.',
  'Translating awareness into something a jury respects.',
  'Calculating the reach one more time, for confidence.',
  'Results don\'t lie. Framing does the rest.',
  'Giving the effectiveness section its rightful gravitas.',
  'Turning percentage points into proof of cultural impact.',
  'Considering whether this is actually a PR entry.',
  'Debating if "integrated" is still a real category.',
  'Reminding the entry it belongs in Titanium.',
  'Quietly hedging across three possible categories.',
  'This is definitely not just a print ad.',
  'Confirming the use of technology was intentional.',
  'Verifying this qualifies as "real-time" by any definition.',
  'Arguing for purpose without losing the product.',
  'Making the case for craft in a craft category.',
  'Noting this isn\'t social media. It\'s culture.',
  'Removing the phrase "as a brand, we believe."',
  'Striking "authentically" from the record. Again.',
  'Replacing "journey" with something less 2018.',
  'Deleting the word "holistic" out of principle.',
  'Quietly removing three unnecessary exclamation marks.',
  'Considering whether "storytelling" still means anything.',
  'Making the CEO quote sound slightly less corporate.',
  'Ensuring "disruptive" earns its place this time.',
  'Cutting the last paragraph. You know which one.',
  'Submitting with confidence. Mild, well-earned confidence.',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick a random starting index so repeat visits feel fresh. */
function randomStart() {
  return Math.floor(Math.random() * STATEMENTS.length)
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeneratingBarProps {
  /**
   * When true the bar animates and statements cycle.
   * When it flips to false the bar completes to 100 % then unmounts.
   */
  isGenerating: boolean
  /**
   * Rough expected duration in milliseconds.
   * The bar will reach ~85 % by this time, then hold until isGenerating = false.
   * Default: 20 000 (20 s)
   */
  estimatedDuration?: number
  /** How long each statement is shown, in milliseconds. Default: 5 000 */
  statementInterval?: number
  /** Called after the completion animation finishes so the parent can hide the bar. */
  onComplete?: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * GeneratingBar
 *
 * Drop this component wherever a generate / evaluate / save action is loading.
 *
 * Usage:
 *   <GeneratingBar isGenerating={isLoading} onComplete={() => setShowBar(false)} />
 *
 * The parent is responsible for showing/hiding the component.
 * Simplest pattern:
 *   {isLoading && <GeneratingBar isGenerating={isLoading} />}
 *
 * Or for a smoother exit, track a separate `showBar` boolean:
 *   const [showBar, setShowBar] = useState(false)
 *   // set showBar = true when request starts
 *   <GeneratingBar isGenerating={isLoading} onComplete={() => setShowBar(false)} />
 */
export default function GeneratingBar({
  isGenerating,
  estimatedDuration = 20_000,
  statementInterval = 5_000,
  onComplete,
}: GeneratingBarProps) {
  // Progress 0–100
  const [progress, setProgress] = useState(0)
  // Which statement is showing
  const [statementIdx, setStatementIdx] = useState(randomStart)
  // Fade state for statement text
  const [visible, setVisible] = useState(true)

  const progressRef = useRef(progress)
  progressRef.current = progress

  const isGeneratingRef = useRef(isGenerating)
  isGeneratingRef.current = isGenerating

  // ── Progress animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating) {
      // Complete to 100 %
      setProgress(100)
      const timer = setTimeout(() => {
        onComplete?.()
      }, 600) // let the 100 % fill animate before unmounting
      return () => clearTimeout(timer)
    }

    // Animate toward 85 % over estimatedDuration, then hold
    setProgress(0)
    const TARGET = 85
    const TICK_MS = 200
    const totalTicks = estimatedDuration / TICK_MS
    const increment = TARGET / totalTicks

    const interval = setInterval(() => {
      setProgress(prev => {
        if (!isGeneratingRef.current) {
          clearInterval(interval)
          return prev
        }
        const next = prev + increment
        if (next >= TARGET) {
          clearInterval(interval)
          return TARGET
        }
        return next
      })
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [isGenerating, estimatedDuration, onComplete])

  // ── Statement cycling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating) return

    const cycle = setInterval(() => {
      // Fade out
      setVisible(false)
      setTimeout(() => {
        setStatementIdx(prev => (prev + 1) % STATEMENTS.length)
        setVisible(true)
      }, 400) // cross-fade gap
    }, statementInterval)

    return () => clearInterval(cycle)
  }, [isGenerating, statementInterval])

  return (
    <div className="w-full">
      {/* Track */}
      <div className="relative w-full h-8 bg-gray-100 rounded-full overflow-hidden">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-green-600 rounded-full transition-all"
          style={{
            width: `${progress}%`,
            transitionDuration: progress === 100 ? '500ms' : '200ms',
            transitionTimingFunction: 'ease-out',
          }}
        />

        {/* Statement text — overlaid, centered */}
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <span
            className="text-xs font-medium text-white/90 text-center leading-tight select-none transition-opacity duration-400"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {STATEMENTS[statementIdx]}
          </span>
        </div>
      </div>
    </div>
  )
}
