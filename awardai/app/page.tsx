'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  target_shows: string[]
  status: string
  created_at: string
}

type Direction = {
  id: number
  project_id: number
  best_show: string | null
  best_category: string | null
  win_likelihood: number | null // stores category_fit score (Phase 3.5 semantic)
}

type EvaluationScores = {
  strategic_clarity?: number
  insight?: number
  idea?: number
  execution?: number
  results?: number
  jury_fit?: number
}

type Evaluation = {
  id: number
  project_id: number
  overall_score: number
  scores: EvaluationScores
  created_at: string
}

type MonthlyUsage = {
  month: string
  directions_generated: number | null
  evaluations_run: number | null
  entries_generated: number | null
  video_scripts_generated: number | null
  edits_run: number | null
  total_ai_tokens_used: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIMENSION_LABELS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'strategic_clarity', label: 'Strategic Clarity' },
  { key: 'insight',           label: 'Insight' },
  { key: 'idea',              label: 'Idea' },
  { key: 'execution',         label: 'Execution' },
  { key: 'results',           label: 'Results' },
  { key: 'jury_fit',          label: 'Jury Fit' },
]

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function scoreColor(score: number) {
  if (score >= 8) return 'bg-green-600'
  if (score >= 6) return 'bg-amber-500'
  return 'bg-red-500'
}

function scoreTextColor(score: number) {
  if (score >= 8) return 'text-green-700'
  if (score >= 6) return 'text-amber-700'
  return 'text-red-600'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function monthLabel(m: string): string {
  // m is like '2026-03'
  try {
    const [year, month] = m.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  } catch {
    return m
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [fetching, setFetching] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([])

  useEffect(() => {
    if (!user) return
    supabase.rpc('get_my_org_id').then(async ({ data: oid }) => {
      if (!oid) { setFetching(false); return }

      const [
        { data: projs },
        { data: dirs },
        { data: evals },
        { data: usage },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('id, campaign_name, client_name, target_shows, status, created_at')
          .eq('org_id', oid)
          .order('created_at', { ascending: false }),
        supabase
          .from('directions')
          .select('id, project_id, best_show, best_category, win_likelihood')
          .eq('org_id', oid),
        supabase
          .from('evaluations')
          .select('id, project_id, overall_score, scores, created_at')
          .eq('org_id', oid)
          .order('created_at', { ascending: false }),
        supabase
          .from('monthly_usage')
          .select('*')
          .eq('org_id', oid)
          .order('month', { ascending: false })
          .limit(6),
      ])

      setProjects(projs || [])
      setDirections(dirs || [])
      setEvaluations(evals || [])
      setMonthlyUsage(usage || [])
      setFetching(false)
    })
  }, [user])

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  // ── Derived: pipeline ────────────────────────────────────────────────────
  const projectIds = new Set(projects.map(p => p.id))
  const projectsWithDirections = new Set(directions.map(d => d.project_id).filter(id => projectIds.has(id)))
  const projectsWithEvaluations = new Set(evaluations.map(e => e.project_id).filter(id => projectIds.has(id)))

  // Best evaluation score per project
  const bestScoreByProject: Record<number, number> = {}
  for (const ev of evaluations) {
    if (!bestScoreByProject[ev.project_id] || ev.overall_score > bestScoreByProject[ev.project_id]) {
      bestScoreByProject[ev.project_id] = ev.overall_score
    }
  }
  const projectsHighScore = new Set(
    Object.entries(bestScoreByProject)
      .filter(([, score]) => score >= 7.5)
      .map(([id]) => Number(id))
  )

  const pipeline = [
    { label: 'No directions yet',  count: projects.filter(p => !projectsWithDirections.has(p.id)).length,    color: 'bg-gray-200' },
    { label: 'Directions ready',   count: projects.filter(p => projectsWithDirections.has(p.id) && !projectsWithEvaluations.has(p.id)).length, color: 'bg-blue-300' },
    { label: 'Evaluated',          count: projects.filter(p => projectsWithEvaluations.has(p.id) && !projectsHighScore.has(p.id)).length, color: 'bg-amber-400' },
    { label: 'Score 7.5+',         count: projectsHighScore.size,                                            color: 'bg-green-600' },
  ]

  // ── Derived: project status ──────────────────────────────────────────────
  const statusCounts = {
    draft:  projects.filter(p => p.status === 'draft').length,
    active: projects.filter(p => p.status === 'active').length,
    final:  projects.filter(p => p.status === 'final').length,
  }

  // ── Derived: evaluation scores ───────────────────────────────────────────
  const allScores = evaluations.map(e => e.overall_score)
  const avgScore = avg(allScores)

  // Score distribution buckets
  const scoreBuckets = [
    { label: '0–4',  min: 0,  max: 4,  count: 0 },
    { label: '4–6',  min: 4,  max: 6,  count: 0 },
    { label: '6–7',  min: 6,  max: 7,  count: 0 },
    { label: '7–8',  min: 7,  max: 8,  count: 0 },
    { label: '8–9',  min: 8,  max: 9,  count: 0 },
    { label: '9–10', min: 9,  max: 11, count: 0 },
  ]
  for (const score of allScores) {
    const bucket = scoreBuckets.find(b => score >= b.min && score < b.max)
    if (bucket) bucket.count++
  }
  const maxBucketCount = Math.max(...scoreBuckets.map(b => b.count), 1)

  // Per-dimension averages
  const dimensionAvgs = DIMENSION_LABELS.map(dim => ({
    ...dim,
    avg: avg(evaluations.map(e => e.scores[dim.key] ?? 0).filter(s => s > 0)),
  }))

  // Top 5 evaluations by score
  const topEvaluations = [...evaluations]
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 5)
    .map(ev => ({
      ...ev,
      projectName: projects.find(p => p.id === ev.project_id)?.campaign_name || 'Unknown',
    }))

  // ── Derived: show targeting ──────────────────────────────────────────────
  const showCounts: Record<string, number> = {}

  // From directions.best_show
  for (const d of directions) {
    if (d.best_show) showCounts[d.best_show] = (showCounts[d.best_show] || 0) + 1
  }
  // From projects.target_shows
  for (const p of projects) {
    for (const show of (p.target_shows || [])) {
      showCounts[show] = (showCounts[show] || 0) + 1
    }
  }

  const topShows = Object.entries(showCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const maxShowCount = Math.max(...topShows.map(([, c]) => c), 1)

  // ── Derived: activity this month ─────────────────────────────────────────
  const currentUsage = monthlyUsage[0] // most recent month
  const currentMonthLabel = currentUsage ? monthLabel(currentUsage.month) : 'This month'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">S</span>
              </div>
              <span className="font-semibold text-gray-900">Shortlist</span>
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-medium text-gray-700">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/projects')}
              className="text-sm text-green-700 hover:text-green-600 transition-colors">
              ← Projects
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Projects',        value: projects.length,      sub: `${statusCounts.active} active · ${statusCounts.final} final` },
            { label: 'Directions Generated',  value: directions.length,    sub: `Across all projects` },
            { label: 'Evaluations Run',       value: evaluations.length,   sub: evaluations.length > 0 ? `Avg score ${avgScore.toFixed(1)}/10` : 'No evaluations yet' },
            { label: 'Entries Ready',         value: projectsHighScore.size, sub: `Score 7.5+ out of ${projects.length} projects` },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mb-1">{card.value}</p>
              <p className="text-xs text-gray-400">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Entry Pipeline (hero) ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Entry Readiness Pipeline</h2>
          <p className="text-xs text-gray-400 mb-6">Where are your projects in the workflow?</p>

          {projects.length === 0 ? (
            <p className="text-sm text-gray-400">No projects yet.</p>
          ) : (
            <>
              {/* Visual pipeline */}
              <div className="flex gap-2 mb-6 h-12 rounded-xl overflow-hidden">
                {pipeline.filter(s => s.count > 0).map(stage => (
                  <div key={stage.label}
                    className={`${stage.color} flex items-center justify-center transition-all`}
                    style={{ flex: stage.count }}>
                    <span className="text-white text-xs font-semibold tabular-nums">{stage.count}</span>
                  </div>
                ))}
                {pipeline.every(s => s.count === 0) && (
                  <div className="bg-gray-100 flex-1 rounded-xl" />
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4">
                {pipeline.map(stage => (
                  <div key={stage.label} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${stage.color}`} />
                    <span className="text-xs text-gray-600">{stage.label}</span>
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">{stage.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Left col (wide) — quality + strategy */}
          <div className="col-span-2 space-y-6">

            {/* Entry Quality */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-baseline gap-3 mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Entry Quality</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Evaluation scores across all entries</p>
                </div>
                {evaluations.length > 0 && (
                  <div className="ml-auto text-right">
                    <span className={`text-3xl font-bold tabular-nums ${scoreTextColor(avgScore)}`}>
                      {avgScore.toFixed(1)}
                    </span>
                    <span className="text-gray-400 text-sm">/10 avg</span>
                  </div>
                )}
              </div>

              {evaluations.length === 0 ? (
                <p className="text-sm text-gray-400">No evaluations yet. Evaluate an entry to see quality data here.</p>
              ) : (
                <>
                  {/* Score distribution */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Score Distribution</p>
                  <div className="space-y-1.5 mb-6">
                    {scoreBuckets.map(bucket => (
                      <div key={bucket.label} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-8 flex-shrink-0 text-right">{bucket.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              bucket.label === '9–10' ? 'bg-green-600' :
                              bucket.label === '8–9'  ? 'bg-green-500' :
                              bucket.label === '7–8'  ? 'bg-amber-400' :
                              bucket.label === '6–7'  ? 'bg-amber-500' :
                              'bg-red-400'
                            }`}
                            style={{ width: `${(bucket.count / maxBucketCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6 tabular-nums">{bucket.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* Dimension averages */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dimension Averages</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {dimensionAvgs.map(dim => (
                      <div key={dim.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-28 flex-shrink-0">{dim.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${scoreColor(dim.avg)}`}
                            style={{ width: `${(dim.avg / 10) * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums w-8 ${scoreTextColor(dim.avg)}`}>
                          {dim.avg > 0 ? dim.avg.toFixed(1) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Award Strategy */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Award Strategy</h2>
              <p className="text-xs text-gray-400 mb-5">Shows most frequently targeted across projects and directions</p>

              {topShows.length === 0 ? (
                <p className="text-sm text-gray-400">No shows targeted yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {topShows.map(([show, count]) => (
                    <div key={show} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-44 flex-shrink-0 truncate">{show}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full bg-green-700 rounded-full"
                          style={{ width: `${(count / maxShowCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600 tabular-nums w-4">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right col (narrow) — leaderboard + activity */}
          <div className="space-y-6">

            {/* Top Entries */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Top Entries</h2>
              <p className="text-xs text-gray-400 mb-4">Highest evaluation scores</p>

              {topEvaluations.length === 0 ? (
                <p className="text-sm text-gray-400">No evaluations yet.</p>
              ) : (
                <div className="space-y-3">
                  {topEvaluations.map((ev, i) => (
                    <div key={ev.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-4 flex-shrink-0 tabular-nums font-medium">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{ev.projectName}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${scoreTextColor(ev.overall_score)}`}>
                        {ev.overall_score.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Status breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Projects by Status</h2>
              {projects.length === 0 ? (
                <p className="text-sm text-gray-400">No projects yet.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Active',  count: statusCounts.active, color: 'bg-green-100 text-green-700' },
                    { label: 'Draft',   count: statusCounts.draft,  color: 'bg-gray-100 text-gray-500' },
                    { label: 'Final',   count: statusCounts.final,  color: 'bg-green-50 text-green-800 border border-green-200' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Activity */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800">AI Activity</h2>
                {currentUsage && (
                  <span className="text-xs text-gray-400">{currentMonthLabel}</span>
                )}
              </div>

              {!currentUsage ? (
                <p className="text-sm text-gray-400">No usage data yet.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Directions',      value: currentUsage.directions_generated },
                    { label: 'Evaluations',     value: currentUsage.evaluations_run },
                    { label: 'Draft entries',   value: currentUsage.entries_generated },
                    { label: 'Video scripts',   value: currentUsage.video_scripts_generated },
                    { label: 'Field edits',     value: currentUsage.edits_run },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{item.label}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{item.value ?? 0}</span>
                    </div>
                  ))}
                  {(currentUsage.total_ai_tokens_used ?? 0) > 0 && (
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">Total tokens</span>
                      <span className="text-xs font-semibold text-gray-600 tabular-nums">
                        {formatTokens(currentUsage.total_ai_tokens_used ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Sparkline-style monthly comparison — last 4 months */}
              {monthlyUsage.length > 1 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-3">Evaluations — last {Math.min(monthlyUsage.length, 4)} months</p>
                  <div className="flex items-end gap-1.5 h-12">
                    {[...monthlyUsage].slice(0, 4).reverse().map(m => {
                      const val = m.evaluations_run ?? 0
                      const maxEvals = Math.max(...monthlyUsage.slice(0, 4).map(x => x.evaluations_run ?? 0), 1)
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full bg-gray-100 rounded-sm overflow-hidden flex items-end" style={{ height: '36px' }}>
                            <div
                              className="w-full bg-green-600 rounded-sm"
                              style={{ height: `${(val / maxEvals) * 100}%`, minHeight: val > 0 ? '4px' : '0' }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 leading-none">{monthLabel(m.month)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </main>
    </div>
  )
}
