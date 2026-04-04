'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  status: string
  created_at: string
  target_shows: string[]
  award_year: number | null
}

type AgencyProfile = {
  id: number
  agency_name: string | null
  agency_city: string | null
  credentials_summary: string | null
  strategic_approach: string | null
  sector_focus: string[] | null
  results_language_notes: string | null
  typical_clients: string | null
  awards_heritage: string | null
  generated_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function extractPdfText(file: File): Promise<string> {
  // Dynamically import pdfjs to avoid SSR issues — already in project bundle via workspace page
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const maxPages = Math.min(pdf.numPages, 20) // cap at 20 pages for credentials decks
  const textParts: string[] = []

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter(item => 'str' in item)
      .map(item => (item as { str: string }).str)
      .join(' ')
    if (pageText.trim()) textParts.push(pageText)
  }

  return textParts.join('\n\n').slice(0, 15000) // cap at 15k chars for edge function
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Projects
  const [projects, setProjects] = useState<Project[]>([])
  const [fetching, setFetching] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [yearFilter, setYearFilter] = useState<number | null>(null)

  // Agency profile
  const [agencyProfile, setAgencyProfile] = useState<AgencyProfile | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [uploadingCredentials, setUploadingCredentials] = useState(false)
  const [credentialsError, setCredentialsError] = useState('')
  const [credentialsInputMode, setCredentialsInputMode] = useState<'pdf' | 'url'>('pdf')
  const [credentialsUrl, setCredentialsUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const credentialsInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()
      .then(({ data: profile }) => {
        if (!profile?.org_id) { setFetching(false); return }
        setUserRole(profile.role ?? null)
        setOrgId(profile.org_id)

        // Fetch projects + agency profile in parallel
        return Promise.all([
          supabase
            .from('projects')
            .select('id, campaign_name, client_name, status, created_at, target_shows, award_year')
            .eq('org_id', profile.org_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('agency_profiles')
            .select('*')
            .eq('org_id', profile.org_id)
            .maybeSingle(),
        ])
      })
      .then((results) => {
        if (!results) return
        const [projResult, profileResult] = results
        if (projResult && !projResult.error && projResult.data) setProjects(projResult.data)
        if (profileResult && !profileResult.error && profileResult.data) {
          setAgencyProfile(profileResult.data)
          // Auto-open profile panel if no profile yet — nudge toward setup
        }
        setFetching(false)
      })
  }, [user])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Agency profile credential upload ──────────────────────────────────────

  // Shared: POST body to extract-agency-profile edge function
  const callExtractEdgeFunction = async (body: Record<string, string>) => {
    const { data: refreshData } = await supabase.auth.refreshSession()
    const accessToken = refreshData?.session?.access_token
    if (!accessToken) { window.location.href = '/login'; return null }

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-agency-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Server error ${res.status}`)
    }
    return await res.json()
  }

  // Shared: validate + extract text from a PDF file, then call edge function
  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setCredentialsError('Please use a PDF file.')
      return
    }
    if (file.size > 40 * 1024 * 1024) {
      setCredentialsError('File must be under 40 MB.')
      return
    }
    setUploadingCredentials(true)
    setCredentialsError('')
    try {
      const credentialsText = await extractPdfText(file)
      if (!credentialsText.trim() || credentialsText.length < 100) {
        setCredentialsError('Could not extract readable text from this PDF. Try a text-based PDF rather than a scanned image.')
        return
      }
      const data = await callExtractEdgeFunction({ credentials_text: credentialsText })
      if (data) { setAgencyProfile(data.profile); setProfileOpen(true) }
    } catch (err) {
      setCredentialsError(`Could not extract profile: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploadingCredentials(false)
      if (credentialsInputRef.current) credentialsInputRef.current.value = ''
    }
  }

  const handleCredentialsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processPdfFile(file)
  }

  const handleCredentialsDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await processPdfFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleCredentialsUrl = async () => {
    const url = credentialsUrl.trim()
    if (!url) return
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setCredentialsError('Please enter a full URL starting with https://')
      return
    }
    setUploadingCredentials(true)
    setCredentialsError('')
    try {
      const data = await callExtractEdgeFunction({ url })
      if (data) { setAgencyProfile(data.profile); setProfileOpen(true); setCredentialsUrl('') }
    } catch (err) {
      setCredentialsError(`Could not extract profile: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploadingCredentials(false)
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const allYears = Array.from(
    new Set(projects.map(p => p.award_year).filter((y): y is number => y !== null))
  ).sort((a, b) => b - a)

  const filteredProjects = yearFilter
    ? projects.filter(p => p.award_year === yearFilter)
    : projects

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
              <span className="text-xs font-bold text-white">A</span>
            </div>
            <span className="font-semibold text-gray-900">AwardAI</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
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

        {/* ── Agency Profile Panel ──────────────────────────────────────────── */}
        <div className="mb-8 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-sm">
                🏢
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">
                  {agencyProfile?.agency_name
                    ? agencyProfile.agency_name
                    : 'Agency Profile'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {agencyProfile
                    ? `${agencyProfile.agency_city ? agencyProfile.agency_city + ' · ' : ''}Used to personalise all AI-generated entries`
                    : 'Upload your credentials deck to personalise AI-generated entries'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!agencyProfile && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                  Not set up
                </span>
              )}
              {agencyProfile && (
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                  Active
                </span>
              )}
              <span className="text-gray-400 text-sm">{profileOpen ? '↑' : '↓'}</span>
            </div>
          </button>

          {profileOpen && (
            <div className="border-t border-gray-100 px-5 py-5">
              {agencyProfile ? (
                <div className="space-y-4">
                  {/* Extracted profile summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {agencyProfile.credentials_summary && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Agency overview</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{agencyProfile.credentials_summary}</p>
                      </div>
                    )}
                    {agencyProfile.strategic_approach && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Strategic approach</p>
                        <p className="text-sm text-gray-700">{agencyProfile.strategic_approach}</p>
                      </div>
                    )}
                    {agencyProfile.sector_focus && agencyProfile.sector_focus.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Primary sectors</p>
                        <div className="flex flex-wrap gap-1.5">
                          {agencyProfile.sector_focus.map(s => (
                            <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {agencyProfile.results_language_notes && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Results language</p>
                        <p className="text-sm text-gray-700">{agencyProfile.results_language_notes}</p>
                      </div>
                    )}
                    {agencyProfile.awards_heritage && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Awards heritage</p>
                        <p className="text-sm text-gray-700">{agencyProfile.awards_heritage}</p>
                      </div>
                    )}
                  </div>
                  {agencyProfile.generated_at && (
                    <p className="text-xs text-gray-400">
                      Extracted {new Date(agencyProfile.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  {/* Re-extract */}
                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Re-extract from</p>
                    {/* Mode toggle */}
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                      <button type="button" onClick={() => { setCredentialsInputMode('pdf'); setCredentialsError('') }}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors ${credentialsInputMode === 'pdf' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                        📄 Upload PDF
                      </button>
                      <button type="button" onClick={() => { setCredentialsInputMode('url'); setCredentialsError('') }}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors ${credentialsInputMode === 'url' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                        🌐 Website URL
                      </button>
                    </div>
                    {credentialsInputMode === 'pdf' ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleCredentialsDrop}
                        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${isDragging ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-500'} ${uploadingCredentials ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
                      >
                        <label className="cursor-pointer">
                          {uploadingCredentials ? (
                            <span className="flex items-center justify-center gap-2 text-xs text-gray-500">
                              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                              Extracting…
                            </span>
                          ) : isDragging ? (
                            <span className="text-xs font-medium text-green-700">Drop to extract</span>
                          ) : (
                            <span className="text-xs text-gray-500">
                              <span className="font-medium text-gray-700">Drop a PDF here</span>, or <span className="text-green-700 font-medium">click to browse</span>
                              <span className="block text-gray-400 mt-0.5">Max 40 MB</span>
                            </span>
                          )}
                          <input ref={credentialsInputRef} type="file" accept=".pdf" onChange={handleCredentialsUpload} disabled={uploadingCredentials} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <input type="url" value={credentialsUrl} onChange={e => setCredentialsUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCredentialsUrl() }}
                            placeholder="https://www.youragency.com" disabled={uploadingCredentials}
                            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors disabled:opacity-50" />
                          <button onClick={handleCredentialsUrl} disabled={!credentialsUrl.trim() || uploadingCredentials}
                            className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                            {uploadingCredentials ? (<><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Extracting…</>) : 'Extract'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">We'll fetch your website and extract your agency context from it.</p>
                      </div>
                    )}
                    {credentialsError && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{credentialsError}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700 mb-1 font-medium">What this does</p>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Upload your credentials deck or link to your agency website. AwardAI extracts your strategic approach, sector expertise, and writing style — then quietly injects this context into every entry draft and evaluation, making outputs feel like they came from your agency, not a generic AI.
                    </p>
                  </div>

                  {/* Mode toggle */}
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                    <button type="button" onClick={() => { setCredentialsInputMode('pdf'); setCredentialsError('') }}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${credentialsInputMode === 'pdf' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                      📄 Upload PDF
                    </button>
                    <button type="button" onClick={() => { setCredentialsInputMode('url'); setCredentialsError('') }}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${credentialsInputMode === 'url' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                      🌐 Website URL
                    </button>
                  </div>

                  {credentialsInputMode === 'pdf' ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleCredentialsDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-500'} ${uploadingCredentials ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
                    >
                      <label className="cursor-pointer">
                        {uploadingCredentials ? (
                          <span className="flex items-center justify-center gap-2 text-sm text-gray-500">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                            Extracting profile…
                          </span>
                        ) : isDragging ? (
                          <span className="text-sm font-medium text-green-700">Drop to extract</span>
                        ) : (
                          <span className="text-sm text-gray-500">
                            <span className="font-medium text-gray-700">Drop your credentials deck here</span>, or <span className="text-green-700 font-medium">click to browse</span>
                            <span className="block text-xs text-gray-400 mt-1">PDF · Max 40 MB</span>
                          </span>
                        )}
                        <input ref={credentialsInputRef} type="file" accept=".pdf" onChange={handleCredentialsUpload} disabled={uploadingCredentials} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input type="url" value={credentialsUrl} onChange={e => setCredentialsUrl(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleCredentialsUrl() }}
                          placeholder="https://www.youragency.com" disabled={uploadingCredentials}
                          className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors disabled:opacity-50" />
                        <button onClick={handleCredentialsUrl} disabled={!credentialsUrl.trim() || uploadingCredentials}
                          className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                          {uploadingCredentials ? (<><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Extracting…</>) : 'Extract'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">We'll fetch your website and extract your agency context from it.</p>
                    </div>
                  )}

                  {credentialsError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{credentialsError}</p>
                  )}
                  <button onClick={() => setProfileOpen(false)} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Skip for now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Projects header + filters ─────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0 flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
              <p className="text-gray-400 text-sm mt-0.5">Manage your award entry projects</p>
            </div>
            {/* Year filter — only shown when there are multiple seasons */}
            {allYears.length > 1 && (
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={() => setYearFilter(null)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    yearFilter === null
                      ? 'bg-gray-800 text-white border-gray-700'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  All
                </button>
                {allYears.map(y => (
                  <button
                    key={y}
                    onClick={() => setYearFilter(y)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      yearFilter === y
                        ? 'bg-gray-800 text-white border-gray-700'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => router.push('/projects/new')}
            className="shrink-0 bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Project
          </button>
        </div>

        {/* ── Project list ──────────────────────────────────────────────────── */}
        {fetching ? (
          <div className="text-gray-400 text-sm">Loading projects…</div>
        ) : filteredProjects.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-16 text-center">
            {yearFilter ? (
              <>
                <p className="text-gray-400 text-sm mb-3">No projects for {yearFilter}</p>
                <button
                  onClick={() => setYearFilter(null)}
                  className="text-sm text-green-700 hover:text-green-600 underline"
                >
                  Show all seasons
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm mb-4">No projects yet</p>
                <button
                  onClick={() => router.push('/projects/new')}
                  className="bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Create your first project
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium text-gray-900 truncate">{p.campaign_name}</h2>
                      {p.award_year && (
                        <span className="text-xs text-gray-400 shrink-0">{p.award_year}</span>
                      )}
                    </div>
                    {p.client_name && (
                      <p className="text-gray-500 text-sm mt-0.5">{p.client_name}</p>
                    )}
                    {p.target_shows?.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {p.target_shows.slice(0, 3).map((show) => (
                          <span
                            key={show}
                            className="text-xs bg-green-50 text-green-800 border border-green-200 px-2 py-0.5 rounded-full"
                          >
                            {show}
                          </span>
                        ))}
                        {p.target_shows.length > 3 && (
                          <span className="text-xs text-gray-400">+{p.target_shows.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                    p.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : p.status === 'final'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-3">
                  Created {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
