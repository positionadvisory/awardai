'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

type Project = {
  id: number
  campaign_name: string
  client_name: string | null
  status: string
  target_shows: string[]
  created_at: string
}

export default function ProjectsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('id, campaign_name, client_name, status, target_shows, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data)
        setFetching(false)
      })
  }, [user])

  if (loading || fetching) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="font-semibold text-white">AwardAI</h1>
          <button
            onClick={() => router.push('/projects/new')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            New Project
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <h2 className="text-sm font-medium text-white mb-2">No projects yet</h2>
            <p className="text-gray-500 text-sm mb-6">Create your first project to get started.</p>
            <button
              onClick={() => router.push('/projects/new')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              New Project
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{p.campaign_name}</p>
                    {p.client_name && (
                      <p className="text-gray-400 text-sm mt-0.5">{p.client_name}</p>
                    )}
                    {p.target_shows?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.target_shows.slice(0, 3).map(show => (
                          <span key={show} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                            {show}
                          </span>
                        ))}
                        {p.target_shows.length > 3 && (
                          <span className="text-xs text-gray-600">+{p.target_shows.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                    p.status === 'active'
                      ? 'bg-green-900/50 text-green-400'
                      : p.status === 'final'
                      ? 'bg-indigo-900/50 text-indigo-400'
                      : 'bg-gray-800 text-gray-400'
                  }`}>
                    {p.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
