'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_STATEMENTS } from '@/lib/generatingStatements'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick a random starting index so repeat visits feel fresh. */
function randomStart(len: number) {
  return Math.floor(Math.random() * len)
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
   * The bar will reach ~70 % by this time, then hold until isGenerating = false.
   * Default: 20 000 (20 s)
   */
  estimatedDuration?: number
  /** How long each statement is shown, in milliseconds. Default: 5 000 */
  statementInterval?: number
  /** Called after the completion animation finishes so the parent can hide the bar. */
  onComplete?: () => void
  /**
   * Optional custom statements array. If omitted, falls back to DEFAULT_STATEMENTS
   * (the original 100 loading statements used for draft generation).
   * Import the relevant array from @/lib/generatingStatements and pass it here.
   */
  statements?: string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * GeneratingBar
 *
 * Drop this component wherever a generate / evaluate / save action is loading.
 *
 * Basic usage:
 *   <GeneratingBar isGenerating={isLoading} onComplete={() => setShowBar(false)} />
 *
 * With custom statements:
 *   import { JURY_EVAL_STATEMENTS } from '@/lib/generatingStatements'
 *   <GeneratingBar isGenerating={isLoading} statements={JURY_EVAL_STATEMENTS} estimatedDuration={50000} />
 *
 * Available statement arrays (import from @/lib/generatingStatements):
 *   DEFAULT_STATEMENTS       — original loading statements (draft generation)
 *   MATERIALS_EVAL_STATEMENTS — evaluate materials as entry
 *   JURY_EVAL_STATEMENTS     — jury evaluation simulation
 *   COACH_REVIEW_STATEMENTS  — coach review
 *   SCRIPT_GENERATE_STATEMENTS — generate video script
 *   SCRIPT_REVIEW_STATEMENTS  — review video script
 */
export default function GeneratingBar({
  isGenerating,
  estimatedDuration = 20_000,
  statementInterval = 5_000,
  onComplete,
  statements: statementsProp,
}: GeneratingBarProps) {
  const statements = statementsProp ?? DEFAULT_STATEMENTS

  // Progress 0–100
  const [progress, setProgress] = useState(0)
  // Which statement is showing
  const [statementIdx, setStatementIdx] = useState(() => randomStart(statements.length))
  // Fade state for statement text
  const [visible, setVisible] = useState(true)

  const progressRef = useRef(progress)
  progressRef.current = progress

  const isGeneratingRef = useRef(isGenerating)
  isGeneratingRef.current = isGenerating

  // Reset index when statements array changes
  useEffect(() => {
    setStatementIdx(randomStart(statements.length))
  }, [statements])

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

    // Animate toward 70 % over estimatedDuration, then hold
    setProgress(0)
    const TARGET = 70
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
        setStatementIdx(prev => (prev + 1) % statements.length)
        setVisible(true)
      }, 400) // cross-fade gap
    }, statementInterval)

    return () => clearInterval(cycle)
  }, [isGenerating, statementInterval, statements])

  return (
    <div style={{ width: '100%' }}>
      {/* Track */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '32px',
        backgroundColor: '#e5e7eb',
        borderRadius: '9999px',
        overflow: 'hidden',
      }}>
        {/* Light green fill */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          backgroundColor: '#86efac',
          borderRadius: '9999px',
          width: `${progress}%`,
          transition: `width ${progress === 100 ? '500ms' : '200ms'} ease-out`,
        }} />

        {/* Statement text — overlaid, centered, always dark */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: '#374151',
            textAlign: 'center',
            lineHeight: 1.3,
            userSelect: 'none',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}>
            {statements[statementIdx]}
          </span>
        </div>
      </div>
    </div>
  )
}
