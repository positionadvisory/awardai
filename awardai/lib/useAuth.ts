'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setLoading(false)
      if (!session) {
        router.replace('/login')
      } else {
        setUser(session.user)
      }
    })

    // Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return
        if (!session) {
          setUser(null)
          setLoading(false)
          router.replace('/login')
        } else {
          setUser(session.user)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { user, loading }
}
