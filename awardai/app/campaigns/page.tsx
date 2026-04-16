'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: number
  campaign_name: string
  agency: string | null
  client: string | null
  show_raw: string | null
  award_category: string | null
  award_tier: string | null
  year: number | null
  what: string | null
  win_factor: string | null
  similarity: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Return at most `limit` words, appending … if truncated. */
function w(text: string | null | undefined, limit = 30): string | null {
  if (!text?.trim()) return null
  const words = text.trim().split(/\s+/)
  if (words.length <= limit) return text.trim()
  return words.slice(0, limit).join(' ') + '…'
}

// ─── Tier badge colours ────────────────────────────────────────────────────────

function tierStyle(tier: string | null): string {
  if (!tier) return 'bg-gray-100 text-gray-500'
  const t = tier.toLowerCase()
  if (t.includes('grand prix') || t.includes('grand prize')) return 'bg-yellow-100 text-yellow-800 border border-yellow-200'
  if (t.includes('gold'))   return 'bg-amber-100 text-amber-700 border border-amber-200'
  if (t.includes('silver')) return 'bg-slate-100 text-slate-600 border border-slate-200'
  if (t.includes('bronze')) return 'bg-orange-100 text-orange-700 border border-orange-200'
  if (t.includes('shortlist') || t.includes('finalist')) return 'bg-blue-50 text-blue-600 border border-blue-200'
  return 'bg-gray-100 text-gray-500'
}

// ─── Similarity bar ────────────────────────────────────────────────────────────

function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const colour =
    pct >= 80 ? 'bg-green-700' :
    pct >= 60 ? 'bg-green-500' :
    pct >= 40 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-500 tabular-nums">{pct}%</span>
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function CampaignCard({ c }: { c: Campaign }) {
  const idea = w(c.what, 30)
  const winFactor = w(c.win_factor, 30)
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
      <div className="px-5 py-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-snug truncate">
              {c.campaign_name || '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {[c.agency, c.client].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <SimilarityBadge score={c.similarity} />
        </div>

        {/* Show / category / tier */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {c.show_raw && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {c.show_raw}
            </span>
          )}
          {c.award_category && (
            <span className="text-xs text-gray-500 truncate max-w-[220px]">
              {c.award_category}
            </span>
          )}
          {c.award_tier && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierStyle(c.award_tier)}`}>
              {c.award_tier}
            </span>
          )}
        </div>

        {/* Idea — fixed 30-word summary, no expand */}
        {idea && (
          <p className="mt-3 text-xs text-gray-700 leading-relaxed">
            <span className="font-medium text-gray-500">Idea: </span>{idea}
          </p>
        )}

        {/* Win factor — fixed 30-word summary */}
        {winFactor && (
          <p className="mt-1.5 text-xs text-gray-700 leading-relaxed">
            <span className="font-medium text-green-700">Win factor: </span>{winFactor}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [showFilter, setShowFilter] = useState('')
  const [results, setResults] = useState<Campaign[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [showOptions, setShowOptions] = useState<string[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auth guard — restricted to super-admin only
  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && user.email !== 'ben@positionadvisory.com') router.push('/projects')
  }, [user, loading, router])

  // Fetch profile + distinct shows on mount
  useEffect(() => {
    if (!user) return

    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserRole(data?.role ?? null))

    // Fetch distinct show names from campaigns
    supabase
      .from('campaigns')
      .select('show_raw')
      .not('show_raw', 'is', null)
      .then(({ data }) => {
        if (!data) return
        // Extract base show name (strip trailing year like " 2023")
        const baseNames = data
          .map(row => (row.show_raw as string).replace(/\s+\d{4}$/, '').trim())
          .filter(Boolean)
        const unique = Array.from(new Set(baseNames)).sort()
        setShowOptions(unique)
      })
  }, [user])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = query.trim()
    if (!q) return

    setSearching(true)
    setError('')
    setResults([])
    setSearched(false)

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase configuration')

      // match-campaigns uses service_role internally — anon key as Bearer is sufficient.
      // (User is already verified by the page's useAuth guard.)
      const res = await fetch(`${supabaseUrl}/functions/v1/match-campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          query: q,
          show_filter: showFilter || null,
          result_limit: 12,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      setResults(data.results ?? [])
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
        <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/projects" className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
                <span className="text-xs font-bold text-white">S</span>
              </div>
              <span className="font-semibold text-gray-900">Shortlist</span>
            </Link>
            <span className="text-gray-300">·</span>
            <span className="text-sm font-medium text-gray-700">Winning Campaigns</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Projects
            </Link>
            {userRole === 'admin' && (
              <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                Dashboard
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Winning Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Search 876 award-winning campaigns by idea, strategy, or category. Powered by semantic vector search.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. emotional storytelling that changed behaviour, or data-driven OOH campaign…"
              className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent placeholder:text-gray-400"
              disabled={searching}
              autoFocus
            />
            <select
              value={showFilter}
              onChange={e => setShowFilter(e.target.value)}
              className="sm:w-48 px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-700 text-gray-700 disabled:opacity-50"
              disabled={searching}
            >
              <option value="">All shows</option>
              {showOptions.map(show => (
                <option key={show} value={show}>{show}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="px-5 py-2.5 text-sm font-medium bg-green-800 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {/* Hint */}
          <p className="mt-2.5 text-xs text-gray-400">
            Tip: describe the idea, the problem it solved, or the emotion it used — the more specific, the better the results.
          </p>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {searching && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
                <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!searching && results.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mb-4">
              {results.length} result{results.length !== 1 ? 's' : ''}
              {showFilter ? ` · filtered to "${showFilter}"` : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(c => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </div>
          </>
        )}

        {/* Empty state — after search, no results */}
        {!searching && searched && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No matching campaigns found.</p>
            <p className="text-gray-400 text-xs mt-1">Try broader language or remove the show filter.</p>
          </div>
        )}

        {/* Initial empty state — nothing searched yet */}
        {!searching && !searched && !error && (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">Search the winning campaigns library</p>
            <p className="text-gray-400 text-xs mt-1 max-w-xs mx-auto">
              876 award-winning campaigns from Cannes, D&AD, One Show, Effies, and more — ranked by semantic similarity to your query.
            </p>
          </div>
        )}

      </main>
    </div>
  )
}
