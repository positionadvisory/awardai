'use client'
/**
 * ShowsDrawer.tsx — Award Show Timeline & Budget Drawer
 * =============================================================================
 * Slide-over panel surfacing the DeadlineCalendar and BudgetPlanner features
 * without leaving the project workspace.
 *
 * Usage:
 *   <ShowsDrawer
 *     open={showsDrawerOpen}
 *     onClose={() => setShowsDrawerOpen(false)}
 *     initialTab="calendar"            // or "budget"
 *     directions={directions}          // Direction[] from project state
 *     orgId={orgId}                    // for loading/saving cost defaults
 *     prefilledShow="Cannes Lions"     // optional — highlights show in planner
 *   />
 *
 * Destination: components/shows/ShowsDrawer.tsx
 * =============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'

// ── Lazy child components (ssr: false prevents hydration mismatches) ───────────

const DeadlineCalendar = dynamic(
  () => import('@/components/shows/DeadlineCalendar'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '8rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Loading calendar…</span>
      </div>
    ),
  }
)

const BudgetPlanner = dynamic(
  () => import('@/components/shows/BudgetPlanner'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '8rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Loading planner…</span>
      </div>
    ),
  }
)

const RoiRanking = dynamic(
  () => import('@/components/shows/RoiRanking'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '8rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Loading ROI rankings…</span>
      </div>
    ),
  }
)

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawerTab = 'calendar' | 'budget' | 'roi'

type Direction = {
  id: number
  name: string
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null
}

type Props = {
  open: boolean
  onClose: () => void
  initialTab?: DrawerTab
  directions?: Direction[]
  orgId?: number | null
  prefilledShow?: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ShowsDrawer({
  open,
  onClose,
  initialTab = 'calendar',
  directions = [],
  orgId,
  prefilledShow,
}: Props) {
  const [tab, setTab]           = useState<DrawerTab>(initialTab)
  const [mounted, setMounted]   = useState(false)
  const scrollRef               = useRef<HTMLDivElement>(null)

  // Portal guard — only render on client after hydration
  useEffect(() => { setMounted(true) }, [])

  // Sync tab + scroll to top when drawer opens
  useEffect(() => {
    if (open) {
      setTab(initialTab)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }, [open, initialTab])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!mounted || !open) return null

  const hasBudgetData = directions.some(d => d.best_show)

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 9998 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0, bottom: 0, right: 0,
          width: 'min(90vw, 860px)',
          zIndex: 9999,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Show timelines and budget planning"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">S</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Show Intelligence</p>
              <p className="text-xs text-gray-400">Deadline calendar &amp; entry budget planner</p>
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
            { key: 'calendar' as DrawerTab, label: 'Timeline',       icon: '📅' },
            { key: 'budget'   as DrawerTab, label: 'Budget Planner',  icon: '📋' },
            { key: 'roi'      as DrawerTab, label: 'ROI Index',       icon: '📊' },
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
                  this direction
                </span>
              )}
              {t.key === 'budget' && hasBudgetData && !prefilledShow && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full ml-0.5">
                  {directions.filter(d => d.best_show).length} direction{directions.filter(d => d.best_show).length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50">
          {tab === 'calendar' && <DeadlineCalendar />}
          {tab === 'budget' && (
            <BudgetPlanner
              directions={directions}
              orgId={orgId}
              prefilledShow={prefilledShow}
            />
          )}
          {tab === 'roi' && <RoiRanking />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-white shrink-0">
          <p className="text-xs text-gray-400">
            ⚠ Entry fees and deadlines are estimates from historical data. Always verify at official show websites before committing budget.
          </p>
        </div>

      </div>
    </>,
    document.body
  )
}
