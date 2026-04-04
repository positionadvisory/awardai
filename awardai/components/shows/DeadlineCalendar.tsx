'use client'
/**
 * DeadlineCalendar.tsx — Award Show Timeline
 * =============================================================================
 * Gantt-style visual timeline of all award show deadlines tracked in DEADLINES_2026.
 *
 * Features:
 *  - "Upcoming in 60 days" urgency strip with day countdown
 *  - 20-week shared Gantt axis (today fixed at 30% from left)
 *  - Amber gradient bars = prep phase windows (shortlisting → polish)
 *  - Red tick = submission deadline
 *  - White band = jury period
 *  - Green dot = ceremony date
 *  - Vertical red line = today
 *  - Past shows rendered as grey bars
 *
 * Destination: components/shows/DeadlineCalendar.tsx
 * =============================================================================
 */

import { DEADLINES_2026, PREP_PHASES, URGENCY_THRESHOLDS } from '@/lib/shows-data'

export default function DeadlineCalendar() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const toDate  = (s: string) => { const d = new Date(s + 'T00:00:00'); d.setHours(0,0,0,0); return d }
  const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  const fmtShort = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const todayLabel = today.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // Sort shows by deadline; split into upcoming / past
  const sorted = [...DEADLINES_2026].sort(
    (a, b) => toDate(a.finalDate).getTime() - toDate(b.finalDate).getTime()
  )
  const upcoming2m  = sorted.filter(d => { const dl = dayDiff(today, toDate(d.finalDate)); return dl >= 0 && dl <= 60 })
  const upcomingAll = sorted.filter(d => toDate(d.finalDate) >= today)
  const past        = sorted.filter(d => toDate(d.finalDate) < today)
  const ordered     = [...upcomingAll, ...past.slice().reverse()] // past most-recent-first at bottom

  // Shared x-axis: 20-week window, today fixed at ~30% from the left
  const todayPct  = 30
  const windowDays = 140
  const leftDays   = Math.round((todayPct / 100) * windowDays)
  const winStart   = new Date(today.getTime() - leftDays * 86400000)
  const winEnd     = new Date(today.getTime() + (windowDays - leftDays) * 86400000)

  const toX = (d: Date) =>
    Math.min(102, Math.max(-2, (dayDiff(winStart, d) / windowDays) * 100))
  const todayX = toX(today)

  // Month-axis labels
  const monthLabels: { label: string; x: number }[] = []
  const cur = new Date(winStart)
  cur.setDate(1)
  cur.setMonth(cur.getMonth() + 1)
  while (cur <= winEnd) {
    monthLabels.push({
      label: cur.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      x: toX(cur),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  return (
    <div className="px-6 pb-10 pt-2">

      {/* Disclaimer */}
      <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        <strong>Dates are approximate</strong> — always verify final deadlines at official show websites before submitting.
      </div>

      {/* Upcoming in next 60 days */}
      {upcoming2m.length > 0 && (
        <div className="mb-5 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Upcoming in the next 60 days
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {upcoming2m.map(s => {
              const d = dayDiff(today, toDate(s.finalDate))
              const isCritical = d <= URGENCY_THRESHOLDS.CRITICAL
              const isTight    = d <= URGENCY_THRESHOLDS.TIGHT && !isCritical
              return (
                <div key={s.show} className="px-4 py-2.5 flex items-center gap-3">
                  <span
                    className={`text-sm font-bold tabular-nums min-w-[36px] text-right ${
                      isCritical ? 'text-red-600' : isTight ? 'text-amber-600' : 'text-gray-700'
                    }`}
                  >
                    {d}d
                  </span>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-sm font-medium text-gray-900 flex-1">{s.show}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    deadline {fmtShort(s.finalDate)}
                  </span>
                  {isCritical && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shrink-0">
                      Critical
                    </span>
                  )}
                  {isTight && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      Tight
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-4 px-3 py-2.5 bg-white border border-gray-200 rounded-lg items-center">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-amber-400 opacity-70" />
          Prep phases (shortlisting → polish)
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-gray-400 opacity-60" />
          Past (closed)
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-0.5 h-4 bg-red-500 rounded" />
          Submission deadline
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-80" />
          Ceremony
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
          <div className="w-0.5 h-4 bg-red-500 rounded" />
          TODAY — {todayLabel}
        </div>
      </div>

      {/* Gantt timeline */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

        {/* Month axis header */}
        <div
          className="relative border-b border-gray-200 bg-gray-50"
          style={{ height: 28 }}
        >
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${m.x}%` }}
            >
              <div
                className="absolute top-0 bottom-0 w-px bg-gray-200"
                style={{ opacity: 0.6 }}
              />
              <span className="text-xs text-gray-400 pl-1.5 whitespace-nowrap select-none">
                {m.label}
              </span>
            </div>
          ))}
          {/* Today line in header */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${todayX}%`, boxShadow: '0 0 6px rgba(239,68,68,0.5)' }}
          />
        </div>

        {/* One row per show */}
        {ordered.map((show, idx) => {
          const finalDt  = toDate(show.finalDate)
          const juryDt   = toDate(show.juryDate)
          const ceremDt  = toDate(show.ceremonyDate)
          const isPast   = finalDt < today
          const daysLeft = dayDiff(today, finalDt)
          const isCritical = !isPast && daysLeft <= URGENCY_THRESHOLDS.CRITICAL
          const isTight    = !isPast && daysLeft <= URGENCY_THRESHOLDS.TIGHT && !isCritical
          const isPrepare  = !isPast && daysLeft <= URGENCY_THRESHOLDS.PREPARE && !isTight && !isCritical

          const finalX   = toX(finalDt)
          const juryEndX = toX(juryDt)
          const ceremX   = toX(ceremDt)
          const juryW    = Math.max(0, juryEndX - finalX)

          // For past shows, show a short grey bar
          const pastBarStart = toX(new Date(finalDt.getTime() - 30 * 86400000))

          const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(249,250,251,1)'

          const nameColor = isPast
            ? 'text-gray-400'
            : isCritical
            ? 'text-red-600'
            : isTight
            ? 'text-amber-700'
            : 'text-gray-900'

          return (
            <div
              key={show.show}
              className="flex items-stretch border-b border-gray-100 last:border-0"
              style={{ background: rowBg, minHeight: 44 }}
            >
              {/* Show label */}
              <div
                className="flex flex-col justify-center px-3 py-2 shrink-0 z-10"
                style={{ width: 200, background: rowBg }}
              >
                <p className={`text-xs font-semibold leading-tight ${nameColor}`}>
                  {show.show}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isPast
                    ? 'Closed'
                    : daysLeft === 0
                    ? 'TODAY'
                    : `${daysLeft}d`}
                </p>
              </div>

              {/* Bar area */}
              <div className="flex-1 relative overflow-visible" style={{ minHeight: 44 }}>
                {/* Today line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${todayX}%`, opacity: 0.85, boxShadow: '0 0 5px rgba(239,68,68,0.4)' }}
                />

                {isPast ? (
                  // Past: simple grey bar
                  pastBarStart < 102 && finalX > -2 && (
                    <div
                      className="absolute rounded bg-gray-300"
                      style={{
                        top: 14, height: 16,
                        left: `${Math.max(0, pastBarStart)}%`,
                        width: `${Math.max(2, finalX - Math.max(0, pastBarStart))}%`,
                        opacity: 0.5,
                      }}
                      title={`${show.show} — Closed ${fmtShort(show.finalDate)}`}
                    />
                  )
                ) : (
                  <>
                    {/* Prep phase amber gradient segments */}
                    {PREP_PHASES.map((p, pi) => {
                      const ps = new Date(finalDt.getTime() + p.dStart * 86400000)
                      const pe = new Date(finalDt.getTime() + p.dEnd   * 86400000)
                      const px = toX(ps)
                      const pw = Math.max(0, toX(pe) - px)
                      if (pw < 0.1) return null
                      return (
                        <div
                          key={p.label}
                          title={p.label}
                          className="absolute"
                          style={{
                            top: 14, height: 16,
                            left: `${Math.max(0, px)}%`,
                            width: `${pw}%`,
                            background: '#fbbf24',
                            opacity: 0.18 + pi * 0.12,
                            borderRadius: pi === 0 ? '3px 0 0 3px' : pi === 4 ? '0 3px 3px 0' : 0,
                          }}
                        />
                      )
                    })}

                    {/* Submission deadline tick */}
                    {finalX >= -2 && finalX <= 102 && (
                      <div
                        title={`Deadline: ${fmtShort(show.finalDate)}`}
                        className="absolute bg-red-500 z-10"
                        style={{ top: 8, bottom: 8, left: `${finalX}%`, width: 2, opacity: 0.9 }}
                      />
                    )}

                    {/* Jury period band */}
                    {juryW > 0.5 && (
                      <div
                        title="Jury period"
                        className="absolute bg-gray-900"
                        style={{ top: 14, height: 16, left: `${finalX}%`, width: `${juryW}%`, opacity: 0.06 }}
                      />
                    )}

                    {/* Ceremony dot */}
                    {ceremX >= -2 && ceremX <= 102 && (
                      <div
                        title={`Ceremony: ${fmtShort(show.ceremonyDate)}`}
                        className="absolute rounded-full bg-green-500 z-10"
                        style={{
                          top: 17, width: 10, height: 10,
                          left: `${ceremX}%`,
                          transform: 'translateX(-50%)',
                          opacity: 0.8,
                        }}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Right meta */}
              <div className="flex flex-col justify-center items-end px-3 py-2 shrink-0" style={{ width: 130 }}>
                <p className={`text-xs font-semibold ${isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                  {fmtShort(show.finalDate)}
                </p>
                {!isPast && show.juryDate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Jury {fmtShort(show.juryDate)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-xs text-gray-400 text-right">
        ● = ceremony &nbsp;|&nbsp; red tick = submission deadline &nbsp;|&nbsp; amber gradient = prep phases
      </p>
    </div>
  )
}
