'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

const AWARD_SHOWS = [
  'Cannes Lions', 'D&AD', 'Clio Awards', 'One Show', 'Effies',
  'Spikes Asia', 'Dubai Lynx', 'London International Awards',
  'WARC Awards', 'AdFest', 'AWARD Awards', 'Webby Awards',
  'Creative Circle', 'Campaign Big Awards', 'Epica Awards',
  'New York Festivals', 'Eurobest',
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

  const toggleShow = (show: string) => {
    setForm(f => ({
      ...f,
      target_shows: f.target_shows.includes(show)
        ? f.target_shows.filter(s => s !== show)
        : [...f.target_shows, show],
    }))
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
            <div className="flex flex-wrap gap-2">
              {AWARD_SHOWS.map(show => (
                <button
                  key={show}
                  type="button"
                  onClick={() => toggleShow(show)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.target_shows.includes(show)
                      ? 'bg-green-800 border-green-700 text-white'
                      : 'bg-white border-gray-300 text-gray-500 hover:border-green-600 hover:text-green-700'
                  }`}
                >
                  {show}
                </button>
              ))}
            </div>
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
    </div>
  )
}
