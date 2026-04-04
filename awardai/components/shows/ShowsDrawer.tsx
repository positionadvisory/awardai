'use client'
/**
 * ShowsDrawer.tsx — Award Show Timeline & Budget Drawer
 * =============================================================================
 * Slide-over panel that surfaces the DeadlineCalendar and BudgetCalculator
 * features without leaving the project workspace.
 *
 * Usage:
 *   <ShowsDrawer
 *     open={showsDrawerOpen}
 *     onClose={() => setShowsDrawerOpen(false)}
 *     initialTab="calendar"            // or "budget"
 *     prefilledShow="Cannes Lions"      // optional — pre-selects show in budget
 *     prefilledQuality={78}             // optional — quality score 0–100
 *   />
 *
 * Integration points in projects-id-page:
 *   1. After directions are generated — "Explore timeline & budget →" button
 *   2. Direction card with evaluation — "Estimate ROI →" button
 *      (pre-fills show + converts overallScore: score/10 × 100 = quality)
 *
 * Destination: components/shows/ShowsDrawer.tsx
 * =============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import DeadlineCalendar from '@/components/shows/DeadlineCalendar'
import BudgetCalculator from '@/components/shows/BudgetCalculator'

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawerTab = 'calendar' | 'budget'

type Props = {
  open: boolean
  onClose: () => void
  initialTab?: DrawerTab
  prefilledShow?: string
  prefilledQuality?: number
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShowsDrawer({
  open,
  onClose,
  initialTab = 'calendar',
  prefilledShow,
  prefilledQuality,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>(initialTab)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sync tab when the drawer opens with a specific initial tab
  useEffect(() => {
    if (open) {
      setTab(initialTab)
      // Scroll to top when reopened
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }, [open, initialTab])

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 'min(90vw, 820px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Show timelines and budget"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">S</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Show Intelligence</p>
              <p className="text-xs text-gray-400">Timelines, deadlines & entry ROI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white shrink-0 px-6">
          {([
            { key: 'calendar' as DrawerTab, label: 'Timeline', icon: '📅' },
            { key: 'budget'   as DrawerTab, label: 'Budget & ROI', icon: '📊' },
          ] as { key: DrawerTab; label: string; icon: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                if (scrollRef.current) scrollRef.current.scrollTop = 0
              }}
              className={`flex items-center gap-1.5 text-sm font-medium px-1 py-3 mr-6 border-b-2 transition-colors ${
                t.key === tab
                  ? 'border-green-700 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.key === 'budget' && prefilledShow && (
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-0.5">
                  prefilled
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50">
          {tab === 'calendar' && <DeadlineCalendar />}
          {tab === 'budget' && (
            <BudgetCalculator
              prefilledShow={prefilledShow}
              prefilledQuality={prefilledQuality}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-white shrink-0">
          <p className="text-xs text-gray-400">
            ⚠ All dates and win rates are estimates based on historical data. Verify official
            deadlines before submitting. Win probability does not guarantee a result.
          </p>
        </div>
      </div>
    </>
  )
}
