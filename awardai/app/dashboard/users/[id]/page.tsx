'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ── Pricing ────────────────────────────────────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
}
function calcCost(model: string | null, inp: number | null, out: number | null): number {
  const p = PRICING[model ?? ''] ?? PRICING['claude-sonnet-4-6']
  return ((inp ?? 0) / 1_000_000) * p.input + ((out ?? 0) / 1_000_000) * p.output
}
function fmtCost(c: number): string {
  return c < 0.005 ? '<$0.01' : `$${c.toFixed(2)}`
}

// ── Action labels ──────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  'generate_directions': 'Generate Directions',
  'generate-directions': 'Generate Directions',
  'generate_draft': 'Generate Draft',
  'generate-draft': 'Generate Draft',
  'evaluate_entry': 'Evaluate Entry',
  'evaluate-entry': 'Evaluate Entry',
  'edit_entry': 'Edit Entry',
  'edit-entry': 'Edit Entry',
  'generate_video_script': 'Generate Script',
  'generate-video-script': 'Generate Script',
  'chat_evaluation': 'Eval Chat',
  'chat-evaluation': 'Eval Chat',
  'suggest_categories': 'Suggest Categories',
}

// ── Types ──────────────────────────────────────────────────────────────────────
type ProfileDetail = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  created_at: string
}
type ProjectDetail = {
  id: number
  campaign_name: string
  client_name: string | null
  target_shows: string[]
  status: string
  created_at: string
}
type DirectionDetail = {
  id: number
  project_id: number
  created_at: string
}
type DraftDetail = {
  id: number
  direction_id: number
  created_at: string
}
type EvalDetail = {
  id: number
  project_id: number
  overall_score: number
  created_at: string
}
type LogDetail = {
  id: number
  action: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function UserDetailPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const targetUserId = params.id as string

  const [profileDetail, setProfileDetail] = useState<ProfileDetail | null>(null)
  const [userProjects, setUserProjects] = useState<ProjectDetail[]>([])
  const [userDirections, setUserDirections] = useState<DirectionDetail[]>([])
  const [userDrafts, setUserDrafts] = useState<DraftDetail[]>([])
  const [userEvals, setUserEvals] = useState<EvalDetail[]>([])
  const [userLogs, setUserLogs] = useState<LogDetail[]>([])
  const [fetching, setFetching] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      // Admin guard — same pattern as dashboard
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

      // Verify target user belongs to same org
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .eq('id', targetUserId)
        .eq('org_id', orgId)
        .single()

      if (!targetProfile) {
        setNotFound(true)
        setFetching(false)
        return
      }

      // Fetch all data for this user in parallel
      const [
        { data: projectsData },
        { data: directionsData },
        { data: draftsData },
        { data: evalsData },
        { data: logsData },
      ] = await Promise.all([
        supabase.from('projects')
          .select('id, campaign_name, client_name, target_shows, status, created_at')
          .eq('user_id', targetUserId)
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
        supabase.from('directions')
          .select('id, project_id, created_at')
          .eq('created_by', targetUserId)
          .eq('org_id', orgId),
        supabase.from('entry_drafts')
          .select('id, direction_id, created_at')
          .eq('created_by', targetUserId)
          .eq('org_id', orgId),
        supabase.from('evaluations')
          .select('id, project_id, overall_score, created_at')
          .eq('created_by', targetUserId)
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
        supabase.from('usage_logs')
          .select('id, action, model, input_tokens, output_tokens, created_at')
          .eq('user_id', targetUserId)
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      setProfileDetail(targetProfile)
      setUserProjects(projectsData ?? [])
      setUserDirections(directionsData ?? [])
      setUserDrafts(draftsData ?? [])
      setUserEvals(evalsData ?? [])
      setUserLogs(logsData ?? [])
      setFetching(false)
    }

    load()
  }, [user, targetUserId])

  // Redirect if access denied
  useEffect(() => {
    if (accessDenied) {
      const t = setTimeout(() => router.push('/projects'), 2500)
      return () => clearTimeout(t)
    }
  }, [accessDenied, router])

  // ── Derived computations ────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const totalCost = userLogs.reduce((sum, l) => sum + calcCost(l.model, l.input_tokens, l.output_tokens), 0)
  const monthLogs = userLogs.filter(l => new Date(l.created_at) >= monthStart)
  const costThisMonth = monthLogs.reduce((sum, l) => sum + calcCost(l.model, l.input_tokens, l.output_tokens), 0)
  const lastActive = userLogs[0]?.created_at ?? null

  // Cost by model
  const costByModel: Record<string, { cost: number; actions: number }> = {}
  for (const log of userLogs) {
    const model = log.model ?? 'unknown'
    const cost = calcCost(log.model, log.input_tokens, log.output_tokens)
    if (!costByModel[model]) costByModel[model] = { cost: 0, actions: 0 }
    costByModel[model].cost += cost
    costByModel[model].actions++
  }
  const maxModelCost = Math.max(...Object.values(costByModel).map(v => v.cost), 0.001)

  // Monthly cost trend (last 4 months)
  const monthlyCost = Array.from({ length: 4 }, (_, i) => {
    const mStart = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1)
    const mEnd = new Date(now.getFullYear(), now.getMonth() - (3 - i) + 1, 1)
    const mLogs = userLogs.filter(l => { const d = new Date(l.created_at); return d >= mStart && d < mEnd })
    return {
      label: mStart.toLocaleDateString('en-GB', { month: 'short' }),
      cost: mLogs.reduce((sum, l) => sum + calcCost(l.model, l.input_tokens, l.output_tokens), 0),
    }
  })
  const maxMonthlyCost = Math.max(...monthlyCost.map(m => m.cost), 0.001)

  // Flags
  type FlagItem = { key: string; label: string; desc: string; color: string }
  const flags: FlagItem[] = []

  const draftDirIds = new Set(userDrafts.map(d => d.direction_id))
  const stuckDirs = userDirections.filter(d => new Date(d.created_at) < threeDaysAgo && !draftDirIds.has(d.id))
  if (stuckDirs.length > 0) {
    flags.push({
      key: 'stuck',
      label: 'Stuck in workflow',
      desc: `${stuckDirs.length} direction${stuckDirs.length > 1 ? 's' : ''} with no draft generated after 3+ days`,
      color: 'amber',
    })
  }
  if (userDrafts.length > 0 && userEvals.length === 0) {
    flags.push({
      key: 'no_eval',
      label: 'No evaluation run',
      desc: 'Has entry drafts but no evaluations completed yet',
      color: 'amber',
    })
  }
  if (userProjects.length > 0 && (!lastActive || new Date(lastActive) < fourteenDaysAgo)) {
    flags.push({
      key: 'inactive',
      label: 'Inactive',
      desc: 'No AI activity recorded in the last 14 days despite having open projects',
      color: 'gray',
    })
  }

  // Project stage breakdown
  const projectStages = userProjects.map(p => {
    const pDirs = userDirections.filter(d => d.project_id === p.id)
    const pDirIds = new Set(pDirs.map(d => d.id))
    const hasDrafts = userDrafts.some(d => pDirIds.has(d.direction_id))
    const pEvals = userEvals.filter(e => e.project_id === p.id)
    const topScore = pEvals.length > 0 ? Math.max(...pEvals.map(e => e.overall_score)) : null
    const isReady = topScore !== null && topScore >= 7.5

    let stage: string
    let stageColor: 'green' | 'amber' | 'gray'
    if (isReady) { stage = `Ready — ${topScore}/10`; stageColor = 'green' }
    else if (pEvals.length > 0) { stage = `Evaluated — ${topScore}/10`; stageColor = 'green' }
    else if (hasDrafts) { stage = 'Draft ready'; stageColor = 'amber' }
    else if (pDirs.length > 0) { stage = 'Directions only'; stageColor = 'amber' }
    else { stage = 'No activity'; stageColor = 'gray' }

    return { ...p, stage, stageColor }
  })

  // Recent activity log (last 20)
  const recentLogs = userLogs.slice(0, 20)

  // ── Loading / guards ────────────────────────────────────────────────────────
  if (loading || fetching) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  if (accessDenied) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-700 font-medium mb-1">Admin access required</p>
        <p className="text-gray-400 text-sm">Redirecting…</p>
      </div>
    </div>
  )

  if (notFound || !profileDetail) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-700 font-medium mb-2">User not found</p>
        <Link href="/dashboard" className="text-sm text-green-700 hover:text-green-600">← Back to dashboard</Link>
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
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
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          ← Dashboard
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* User header card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {profileDetail.full_name ?? profileDetail.email ?? 'Unknown user'}
              </h1>
              {profileDetail.full_name && (
                <p className="text-sm text-gray-500 mt-0.5">{profileDetail.email}</p>
              )}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  profileDetail.role === 'admin' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {profileDetail.role ?? 'member'}
                </span>
                <span className="text-xs text-gray-400">
                  Member since {new Date(profileDetail.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                {lastActive ? (
                  <span className="text-xs text-gray-400">
                    Last active {new Date(lastActive).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">No activity recorded</span>
                )}
              </div>
            </div>
            {flags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap justify-end max-w-xs shrink-0">
                {flags.map(f => (
                  <span key={f.key} className={`text-xs px-2 py-1 rounded-full font-medium ${
                    f.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                    f.color === 'red' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {f.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Projects', value: userProjects.length },
            { label: 'Drafts Generated', value: userDrafts.length },
            { label: 'Evaluations Run', value: userEvals.length },
            { label: 'Total AI Cost', value: fmtCost(totalCost) },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Flags detail panel */}
        {flags.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-amber-800 mb-3">⚠ Flags</h2>
            <div className="space-y-2.5">
              {flags.map(f => (
                <div key={f.key} className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 shrink-0 ${
                    f.color === 'amber' ? 'bg-amber-200 text-amber-800' :
                    f.color === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {f.label}
                  </span>
                  <p className="text-xs text-amber-700 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Cost by model */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Cost by Model</h2>
            {Object.keys(costByModel).length === 0 ? (
              <p className="text-gray-400 text-sm">No AI usage recorded.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(costByModel)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([model, data]) => (
                    <div key={model}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-600 font-medium">
                          {model.replace('claude-', '').replace('-4-6', '')}
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-gray-700">{fmtCost(data.cost)}</span>
                          <span className="text-xs text-gray-400 ml-2">{data.actions} call{data.actions !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-green-700 h-1.5 rounded-full"
                          style={{ width: `${(data.cost / maxModelCost) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                <div className="pt-3 border-t border-gray-100 flex justify-between">
                  <span className="text-xs text-gray-400">This month</span>
                  <span className="text-xs font-semibold text-gray-700">{fmtCost(costThisMonth)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Monthly cost trend */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Cost</h2>
            <div className="flex items-end gap-3 h-28">
              {monthlyCost.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs text-gray-500">{fmtCost(m.cost)}</span>
                  <div className="w-full flex items-end" style={{ height: '60px' }}>
                    <div
                      className="w-full bg-green-200 rounded-t"
                      style={{ height: `${Math.max((m.cost / maxMonthlyCost) * 60, m.cost > 0 ? 4 : 0)}px` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Projects</h2>
          {projectStages.length === 0 ? (
            <p className="text-gray-400 text-sm">No projects yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {projectStages.map(p => (
                <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.campaign_name}</p>
                    {p.client_name && <p className="text-xs text-gray-400 mt-0.5">{p.client_name}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.stageColor === 'green' ? 'bg-green-100 text-green-700' :
                      p.stageColor === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.stage}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity log */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <span className="text-xs text-gray-400">Last {recentLogs.length} actions</span>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-gray-400 text-sm">No activity logged yet.</p>
          ) : (
            <div>
              <div className="grid grid-cols-4 text-xs text-gray-400 font-medium pb-2 border-b border-gray-100">
                <span>Action</span>
                <span>Model</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Date</span>
              </div>
              <div className="divide-y divide-gray-50">
                {recentLogs.map(log => {
                  const cost = calcCost(log.model, log.input_tokens, log.output_tokens)
                  return (
                    <div key={log.id} className="grid grid-cols-4 text-xs py-2">
                      <span className="text-gray-700 truncate pr-2">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="text-gray-400">
                        {log.model ? log.model.replace('claude-', '').replace('-4-6', '') : '—'}
                      </span>
                      <span className="text-right text-gray-600">{fmtCost(cost)}</span>
                      <span className="text-right text-gray-400">
                        {new Date(log.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
