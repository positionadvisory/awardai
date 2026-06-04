'use client'
// Deploy to: app/settings/billing/page.tsx
// Redirects to /settings/account (consolidated account + billing page)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BillingRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/settings/account') }, [router])
  return null
}
