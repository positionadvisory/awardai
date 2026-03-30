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
  created_at: string
  target_shows: string[]
}

export default function ProjectsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!user) return

    supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()
      .then(({ data: profile }) => {
        if (!profile?.org_id) { setFetching(false); return }
        return supabase
          .from('projects')
          .select('id, campaign_name, client_name, status, created_at, target_shows')
          .eq('org_id', profile.org_id)
          .order('created_at', { ascending: false })
      })
      .then((result) => {
        if (result && !result.error && result.data) setProjects(result.data)
        setFetching(false)
      })
  }, [user])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <span className="font-semibold text-gray-900">AwardAI</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
            <p className="text-gray-400 text-sm mt-1">Manage your award entry projects</p>
          </div>
          <button
            onClick={() => router.push('/projects/new')}
            className="bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Project
          </button>
        </div>

        {fetching ? (
          <div className="text-gray-400 text-sm">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-16 text-center">
            <p className="text-gray-400 text-sm mb-4">No projects yet</p>
            <button
              onClick={() => router.push('/projects/new')}
              className="bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-5 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-medium text-gray-900">{p.campaign_name}</h2>
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
                  Created {new Date(p.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
