'use client'
// Deploy to: app/settings/billing/page.tsx
// Redirects to /settings/account, preserving any query params (e.g. ?upgraded=1)

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function BillingRedirectContent() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const qs = params.toString()
    router.replace(qs ? `/settings/account?${qs}` : '/settings/account')
  }, [router, params])

  return null
}

export default function BillingRedirect() {
  return (
    <Suspense fallback={null}>
      <BillingRedirectContent />
    </Suspense>
  )
}
