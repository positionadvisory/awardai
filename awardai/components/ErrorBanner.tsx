'use client'
// components/ErrorBanner.tsx — extracted from app/projects/[id]/page.tsx
// (refactor-r1r2-tabs-2026-07-13 build fix). Next.js App Router page.tsx
// files may only export `default` + the sanctioned page-export allowlist;
// this was a runtime value export ("ErrorBanner is not a valid Page export
// field") so it moves here verbatim, no behavior change.
//
// Renders a friendly message with a small diagnostic code. Expects error
// strings in "message [CODE]" format from formatError(). Falls back
// gracefully for plain strings.

import { parseErrorString } from '@/lib/errorMessages'

export function ErrorBanner({ error }: { error: string }) {
  const { message, code } = parseErrorString(error)
  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p className="text-red-600 text-sm">{message}</p>
      {code && (
        <p className="text-red-300 text-xs font-mono mt-1 select-all">{code}</p>
      )}
    </div>
  )
}
