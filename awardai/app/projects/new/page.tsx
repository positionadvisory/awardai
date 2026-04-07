'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

// Canonical list — base set always shown even before KB loads
const CANONICAL_SHOWS = [
  'Cannes Lions', 'D&AD', 'Clio Awards', 'One Show', 'Effies',
  'Spikes Asia', 'Dubai Lynx', 'London International Awards',
  'WARC Awards', 'AdFest', 'AWARD Awards', 'Webby Awards',
  'Creative Circle', 'Campaign Big Awards', 'Epica Awards',
  'New York Festivals', 'Eurobest', 'WARC Effectiveness Awards',
  'Shorty Awards', 'The Drum Awards', 'Festival of Media',
  'MMA Smarties', 'Anthem Awards', 'PR Week Awards', 'ADMA Awards',
  'Mumbrella Awards', 'B&T Awards', 'Campaign Asia Awards',
  'AdFest', 'Asian Marketing Effectiveness Awards',
  'Asia Pacific Effie Awards', 'Global Effie Awards',
  'Australian Effies', 'IAB Mixx Awards', 'Caples Awards',
  'Gerety Awards', 'Andy Awards', 'Communication Arts Awards',
  'Transform Awards', 'World PR Awards', 'PRCA Awards',
  'SABRE Awards', 'Holmes Report SABRE', 'PRovoke Awards',
  'Cannes Lions PR Lions', 'INMA Awards', 'WAN-IFRA Awards',
  'Social Media Marketing Awards', 'Content Marketing Awards',
  'Digital Communication Awards',
]

const currentYear = new Date().getFullYear()
// Show the last 3 years + next year as options
const YEAR_OPTIONS = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2]

export default function NewProjectPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    campaign_name: '',
    client_name: '',
    brief: '',
    target_shows: [] as string[],
    award_year: currentYear,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [kbShows, setKbShows] = useState<string[]>(CANONICAL_SHOWS)
  const [dropdownValue, setDropdownValue] = useState('')
  // Custom show + request flow
  const [customShowInput, setCustomShowInput] = useState('')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showRequestName, setShowRequestName] = useState('')
  const [showRequestUrl, setShowRequestUrl] = useState('')
  const [showRequestMarket, setShowRequestMarket] = useState('')
  const [showRequestKitUrl, setShowRequestKitUrl] = useState('')
  const [showRequestSubmitting, setShowRequestSubmitting] = useState(false)
  const [showRequestDone, setShowRequestDone] = useState(false)
  const [showRequestNoKit, setShowRequestNoKit] = useState(false)

  // Fetch KB shows on mount and merge with canonical list
  useEffect(() => {
    supabase
      .from('campaigns')
      .select('show_raw')
      .not('show_raw', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const baseNames = data
          .map(row => (row.show_raw as string).replace(/\s+\d{4}$/, '').trim())
          .filter(Boolean)
        const unique = Array.from(new Set([...CANONICAL_SHOWS, ...baseNames])).sort()
        setKbShows(unique)
      })
  }, [])

  const handleDropdownAdd = (val: string) => {
    if (!val) return
    if (val === '__request__') {
      setCustomShowInput('')
      setShowRequestModal(true)
      setDropdownValue('')
      return
    }
    setForm(f => ({
      ...f,
      target_shows: f.target_shows.includes(val) ? f.target_shows : [...f.target_shows, val],
    }))
    setDropdownValue('')
  }

  const handleCustomShowAdd = (val: string) => {
    if (!val.trim()) return
    const isKnown = kbShows.some(s => s.toLowerCase() === val.trim().toLowerCase())
    if (isKnown) {
      const canonical = kbShows.find(s => s.toLowerCase() === val.trim().toLowerCase()) ?? val.trim()
      setForm(f => ({
        ...f,
        target_shows: f.target_shows.includes(canonical) ? f.target_shows : [...f.target_shows, canonical],
      }))
      setCustomShowInput('')
    } else {
      setShowRequestName(val.trim())
      setShowRequestUrl('')
      setShowRequestMarket('')
      setShowRequestKitUrl('')
      setShowRequestDone(false)
      setShowRequestNoKit(false)
      setCustomShowInput('')
      setShowRequestModal(true)
    }
  }

  const submitShowRequest = async () => {
    if (!showRequestName.trim()) return
    setShowRequestSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token ?? ''
      if (!accessToken) return
      const res = await fetch('/api/shows/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          show_name:     showRequestName.trim(),
          show_url:      showRequestUrl.trim() || null,
          market:        showRequestMarket.trim() || null,
          entry_kit_url: showRequestKitUrl.trim() || null,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setForm(f => ({
          ...f,
          target_shows: f.target_shows.includes(showRequestName.trim())
            ? f.target_shows
            : [...f.target_shows, showRequestName.trim()],
        }))
        setCustomShowInput('')
        setShowRequestDone(true)
        setShowRequestNoKit(!showRequestKitUrl.trim())
      }
    } catch (e) {
      console.error('Show request error:', e)
    } finally {
      setShowRequestSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.campaign_name.trim()) {
      setError('Project name is required.')
      return
    }
    setSaving(true)
    setError('')

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user?.id)
      .single()

    if (!profile?.org_id) {
      setError('Could not find your organisation. Please contact support.')
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({
        campaign_name: form.campaign_name.trim(),
        client_name: form.client_name.trim() || null,
        combined_text: form.brief.trim() || null,
        target_shows: form.target_shows,
        award_year: form.award_year,
        org_id: profile.org_id,
        user_id: user?.id,
        status: 'draft',
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    router.push(`/projects/${data.id}`)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-gray-500 hover:text-gray-900 transition-colors text-sm"
        >
          ← Projects
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-medium text-gray-900">New Project</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900 mb-8">Create Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.campaign_name}
              onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))}
              placeholder="e.g. Nothing But Sheer Joy"
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
            />
          </div>

          {/* Client name + Award year — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client name
              </label>
              <input
                type="text"
                value={form.client_name}
                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="e.g. BMW"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Award season
                <span className="text-gray-400 font-normal ml-1 text-xs">— which year are you entering?</span>
              </label>
              <select
                value={form.award_year}
                onChange={e => setForm(f => ({ ...f, award_year: parseInt(e.target.value) }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Brief */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campaign brief
            </label>
            <textarea
              value={form.brief}
              onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
              rows={7}
              placeholder="Describe the campaign — what it was, what it achieved, who it was for, and any standout results. You can upload supporting files after creating the project."
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none"
            />
          </div>

          {/* Target shows */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Target award shows
              <span className="text-gray-400 font-normal ml-2">— select all that apply</span>
            </label>

            {/* Dropdown selector */}
            <select
              value={dropdownValue}
              onChange={e => handleDropdownAdd(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-green-600 transition-colors mb-3"
            >
              <option value="">Add an award show…</option>
              {kbShows
                .filter(s => !form.target_shows.includes(s))
                .map(show => (
                  <option key={show} value={show}>{show}</option>
                ))
              }
              <option value="__request__">✦ Request a show not in the list…</option>
            </select>

            {/* Selected shows as removable chips */}
            {form.target_shows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.target_shows.map(show => (
                  <button
                    key={show}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, target_shows: f.target_shows.filter(s => s !== show) }))}
                    className="text-xs px-3 py-1.5 rounded-full border bg-green-800 border-green-700 text-white flex items-center gap-1.5 hover:bg-green-700 transition-colors"
                  >
                    {show} <span className="opacity-70">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="text-gray-500 hover:text-gray-900 text-sm px-4 py-2.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>

      {/* Show Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Request a new show</h2>
              {!showRequestDone ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    <span className="font-medium text-gray-800">{showRequestName}</span> isn't in our system yet. Give us a few details and we'll add it shortly.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Show website</label>
                      <input type="url" value={showRequestUrl} onChange={e => setShowRequestUrl(e.target.value)} placeholder="https://example.com"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Primary market</label>
                      <input type="text" value={showRequestMarket} onChange={e => setShowRequestMarket(e.target.value)} placeholder="e.g. Global, APAC, Australia…"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Entry kit URL <span className="text-gray-400 font-normal">(optional but helpful)</span></label>
                      <input type="url" value={showRequestKitUrl} onChange={e => setShowRequestKitUrl(e.target.value)} placeholder="https://example.com/entry-kit"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button onClick={submitShowRequest} disabled={showRequestSubmitting}
                      className="flex-1 bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                      {showRequestSubmitting ? 'Sending…' : 'Send request'}
                    </button>
                    <button onClick={() => { setShowRequestModal(false); setCustomShowInput('') }} disabled={showRequestSubmitting}
                      className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40 transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="py-4 text-center">
                    <div className="text-3xl mb-3">✓</div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Request sent for <span className="text-green-800">{showRequestName}</span></p>
                    <p className="text-sm text-gray-500 mb-1">We'll add it to the system shortly.</p>
                    {showRequestNoKit && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        No entry kit provided — we'll track one down, but it may take a little longer.
                      </p>
                    )}
                  </div>
                  <button onClick={() => setShowRequestModal(false)}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
