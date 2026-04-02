'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

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
  best_show: string
  best_category: string
  win_likelihood: number
}

type Evaluation = {
  id: number
  project_id: number
  overall_score: number
  scores: Record<string, number>
  created_at: string
}

type MonthlyUsage = {
  month: string
  directions_generated: number
  evaluations_run: number
  entries_generated: number
  edits_run: number
  video_scripts_generated: number
  total_ai_tokens_used: number
}

const DIMENSION_LABELS: Record<string, string> = {
  strategic_clarity: 'Strategic Clarity',
  insight: 'Insight',
  idea: 'Idea',
  execution: 'Execution',
  results: 'Results',
  jury_fit: 'Jury Fit',
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [projects, setProjects] = useState<Project[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([])
  const [fetching, setFetching] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      // Fetch org ID and role in parallel — redirect non-admins
      const [{ data: orgId }, { data: profileData }] = await Promise.all([
        supabase.rpc('get_my_org_id'),
        supabase.from('profiles').select('role').eq('id', user.id).single(),
      ])

      if (profileData?.role !== 'admin') {
        setAccessDenied(true)
        setFetching(false)
        return
      }

      if (!orgId) { setFetching(false); return }

      const now = new Date()
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

      const [
        { data: projectsData },
        { data: directionsData },
        { data: evaluationsData },
        { data: usageData },
      ] = await Promise.all([
        supabase.from('projects').select('id, campaign_name, client_name, target_shows, status, created_at').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('directions').select('id, project_id, best_show, best_category, win_likelihood').eq('org_id', orgId),
        supabase.from('evaluations').select('id, project_id, overall_score, scores, created_at').eq('org_id', orgId),
        supabase.from('monthly_usage').select('*').eq('org_id', orgId).gte('month', sixMonthsAgo).order('month', { ascending: true }),
      ])

      setProjects(projectsData ?? [])
      setDirections(directionsData ?? [])
      setEvaluations(evaluationsData ?? [])
      setMonthlyUsage(usageData ?? [])
      setFetching(false)
    }

    load()
  }, [user])

  // Redirect after a short delay if access denied
  useEffect(() => {
    if (accessDenied) {
      const t = setTimeout(() => router.push('/projects'), 2500)
      return () => clearTimeout(t)
    }
  }, [accessDenied, router])

  // ── Derived stats ──────────────────────────────────────────────────

  const totalProjects = projects.length
  const totalDirections = directions.length
  const totalEvaluations = evaluations.length
  const readyEntries = evaluations.filter(e => e.overall_score >= 7.5).length

  // Pipeline: categorise each project by highest stage reached
  const projectsWithDirs = new Set(directions.map(d => d.project_id))
  const projectsWithEvals = new Set(evaluations.map(e => e.project_id))
  const projectsReady = new Set(evaluations.filter(e => e.overall_score >= 7.5).map(e => e.project_id))

  let pipelineNone = 0, pipelineDirs = 0, pipelineEval = 0, pipelineReady = 0
  for (const p of projects) {
    if (projectsReady.has(p.id)) pipelineReady++
    else if (projectsWithEvals.has(p.id)) pipelineEval++
    else if (projectsWithDirs.has(p.id)) pipelineDirs++
    else pipelineNone++
  }

  // Entry quality
  const avgScore = evaluations.length > 0
    ? Math.round((evaluations.reduce((s, e) => s + e.overall_score, 0) / evaluations.length) * 10) / 10
    : null

  const scoreBuckets = [
    { label: '0–2', min: 0, max: 2 },
    { label: '2–4', min: 2, max: 4 },
    { label: '4–6', min: 4, max: 6 },
    { label: '6–7', min: 6, max: 7 },
    { label: '7–8', min: 7, max: 8 },
    { label: '8–10', min: 8, max: 10 },
  ].map(b => ({
    ...b,
    count: evaluations.filter(e => e.overall_score >= b.min && e.overall_score < (b.max === 10 ? 10.01 : b.max)).length,
  }))
  const maxBucketCount = Math.max(...scoreBuckets.map(b => b.count), 1)

  const dimensionAvgs: Record<string, number> = {}
  const dimKeys = Object.keys(DIMENSION_LABELS)
  for (const key of dimKeys) {
    const vals = evaluations.map(e => e.scores?.[key]).filter(v => v !== undefined) as number[]
    dimensionAvgs[key] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0
  }

  // Award strategy: top 8 shows by combined frequency
  const showCounts: Record<string, number> = {}
  for (const d of directions) {
    if (d.best_show) showCounts[d.best_show] = (showCounts[d.best_show] ?? 0) + 1
  }
  for (const p of projects) {
    for (const show of (p.target_shows ?? [])) {
      showCounts[show] = (showCounts[show] ?? 0) + 1
    }
  }
  const topShows = Object.entries(showCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const maxShowCount = Math.max(...topShows.map(s => s[1]), 1)

  // Top 5 entries
  const topEntries = [...evaluations]
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 5)
    .map(e => ({
      ...e,
      projectName: projects.find(p => p.id === e.project_id)?.campaign_name ?? 'Unknown',
    }))

  // Projects by status
  const statusCounts = { active: 0, draft: 0, final: 0 }
  for (const p of projects) {
    if (p.status === 'active') statusCounts.active++
    else if (p.status === 'final') statusCounts.final++
    else statusCounts.draft++
  }

  // AI activity — current month usage
  const currentMonth = monthlyUsage[monthlyUsage.length - 1]
  const evalSparkline = monthlyUsage.slice(-4)
  const maxSparkVal = Math.max(...evalSparkline.map(m => m.evaluations_run), 1)

  // ── Loading / access denied ────────────────────────────────────────

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 font-medium mb-1">Admin access required</p>
          <p className="text-gray-400 text-sm">Redirecting you to projects…</p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <span className="font-semibold text-gray-900">AwardAI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Projects
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Org-level overview across all projects</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Projects', value: totalProjects },
            { label: 'Directions Generated', value: totalDirections },
            { label: 'Evaluations Run', value: totalEvaluations },
            { label: 'Entries Ready (≥7.5)', value: readyEntries },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Entry Readiness Pipeline */}
        {totalProjects > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Entry Readiness Pipeline</h2>
            <div className="flex rounded-lg overflow-hidden h-8 mb-3">
              {pipelineReady > 0 && (
                <div
                  className="bg-green-600 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(pipelineReady / totalProjects) * 100}%` }}
                >
                  {pipelineReady}
                </div>
              )}
              {pipelineEval > 0 && (
                <div
                  className="bg-green-300 flex items-center justify-center text-green-900 text-xs font-medium"
                  style={{ width: `${(pipelineEval / totalProjects) * 100}%` }}
                >
                  {pipelineEval}
                </div>
              )}
              {pipelineDirs > 0 && (
                <div
                  className="bg-amber-200 flex items-center justify-center text-amber-900 text-xs font-medium"
                  style={{ width: `${(pipelineDirs / totalProjects) * 100}%` }}
                >
                  {pipelineDirs}
                </div>
              )}
              {pipelineNone > 0 && (
                <div
                  className="bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-medium"
                  style={{ width: `${(pipelineNone / totalProjects) * 100}%` }}
                >
                  {pipelineNone}
                </div>
              )}
            </div>
            <div className="flex gap-5 flex-wrap">
              {[
                { label: 'Score ≥7.5', color: 'bg-green-600', count: pipelineReady },
                { label: 'Evaluated', color: 'bg-green-300', count: pipelineEval },
                { label: 'Directions ready', color: 'bg-amber-200', count: pipelineDirs },
                { label: 'No directions', color: 'bg-gray-100', count: pipelineNone },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
                  <span className="text-xs text-gray-500">{s.label} ({s.count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="md:col-span-2 space-y-6">

            {/* Entry Quality */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Entry Quality</h2>
              {evaluations.length === 0 ? (
                <p className="text-gray-400 text-sm mt-4">No evaluations yet.</p>
              ) : (
                <>
                  <p className="text-3xl font-semibold text-gray-900 mt-2">
                    {avgScore ?? '—'}
                    <span className="text-base text-gray-400 font-normal ml-1">/ 10 avg</span>
                  </p>

                  {/* Score histogram */}
                  <div className="mt-5">
                    <p className="text-xs text-gray-400 mb-2">Score distribution</p>
                    <div className="flex items-end gap-1.5 h-16">
                      {scoreBuckets.map(b => (
                        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-t ${
                              b.min >= 8 ? 'bg-green-500' :
                              b.min >= 6 ? 'bg-amber-400' : 'bg-red-300'
                            }`}
                            style={{ height: `${Math.max((b.count / maxBucketCount) * 52, b.count > 0 ? 4 : 0)}px` }}
                          />
                          <span className="text-xs text-gray-400">{b.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dimension averages */}
                  <div className="mt-5 space-y-2">
                    <p className="text-xs text-gray-400 mb-2">Dimension averages</p>
                    {dimKeys.map(key => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-32 shrink-0">{DIMENSION_LABELS[key]}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              dimensionAvgs[key] >= 8 ? 'bg-green-500' :
                              dimensionAvgs[key] >= 6 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${(dimensionAvgs[key] / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-6 text-right">{dimensionAvgs[key]}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Award Strategy */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Award Strategy</h2>
              {topShows.length === 0 ? (
                <p className="text-gray-400 text-sm">No shows targeted yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {topShows.map(([show, count]) => (
                    <div key={show} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-44 truncate shrink-0">{show}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-green-700 h-2 rounded-full"
                          style={{ width: `${(count / maxShowCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">

            {/* Top Entries */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Entries</h2>
              {topEntries.length === 0 ? (
                <p className="text-gray-400 text-sm">No evaluations yet.</p>
              ) : (
                <div className="space-y-3">
                  {topEntries.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{e.projectName}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${
                        e.overall_score >= 8 ? 'text-green-700' :
                        e.overall_score >= 6 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {e.overall_score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects by Status */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Projects by Status</h2>
              <div className="space-y-2">
                {[
                  { label: 'Active', count: statusCounts.active, badge: 'bg-green-100 text-green-700' },
                  { label: 'Draft', count: statusCounts.draft, badge: 'bg-gray-100 text-gray-500' },
                  { label: 'Final', count: statusCounts.final, badge: 'bg-green-100 text-green-800' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{s.label}</span>
                    <span className="text-sm font-medium text-gray-700">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Activity */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">AI Activity</h2>
              {!currentMonth ? (
                <p className="text-gray-400 text-sm">No activity recorded yet.</p>
              ) : (
                <>
                  <div className="space-y-2 mb-5">
                    {[
                      { label: 'Directions', value: currentMonth.directions_generated },
                      { label: 'Evaluations', value: currentMonth.evaluations_run },
                      { label: 'Drafts', value: currentMonth.entries_generated },
                      { label: 'Edits', value: currentMonth.edits_run },
                      { label: 'Video Scripts', value: currentMonth.video_scripts_generated },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{row.label}</span>
                        <span className="text-xs font-medium text-gray-700">{row.value ?? 0}</span>
                      </div>
                    ))}
                  </div>

                  {/* Evaluations sparkline (4 months) */}
                  {evalSparkline.length > 1 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Evaluations (last {evalSparkline.length} months)</p>
                      <div className="flex items-end gap-1 h-10">
                        {evalSparkline.map((m, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full bg-green-200 rounded-sm"
                              style={{ height: `${Math.max((m.evaluations_run / maxSparkVal) * 32, m.evaluations_run > 0 ? 4 : 0)}px` }}
                            />
                            <span className="text-xs text-gray-300">
                              {new Date(m.month).toLocaleDateString('en-GB', { month: 'short' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
