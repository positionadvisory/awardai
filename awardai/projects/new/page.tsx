'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

const AWARD_SHOWS = [
  'Cannes Lions', 'D&AD', 'Clio Awards', 'One Show', 'Effies',
  'Spikes Asia', 'Dubai Lynx', 'London International Awards',
  'WARC Awards', 'Creative Circle', 'Campaign Big Awards',
  'Epica Awards', 'New York Festivals', 'Eurobest',
]

export default function NewProjectPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    campaign_name: '',
    client_name: '',
    brief: '',
    target_shows: [] as string[],
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          ← Projects
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-medium">New Project</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-8">Create Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Project name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.campaign_name}
              onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))}
              placeholder="e.g. Nothing But Sheer Joy"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Client name
            </label>
            <input
              type="text"
              value={form.client_name}
              onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
              placeholder="e.g. BMW"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Campaign brief
            </label>
            <textarea
              value={form.brief}
              onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
              rows={7}
              placeholder="Describe the campaign — what it was, what it achieved, who it was for, and any standout results. You can upload supporting files after creating the project."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Target award shows
              <span className="text-gray-500 font-normal ml-2">— select all that apply</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {AWARD_SHOWS.map(show => (
                <button
                  key={show}
                  type="button"
                  onClick={() => toggleShow(show)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.target_shows.includes(show)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {show}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="text-gray-400 hover:text-white text-sm px-4 py-2.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
