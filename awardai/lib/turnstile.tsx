'use client'
// Deploy to: lib/turnstile.tsx
//
// Cloudflare Turnstile for Supabase Auth CAPTCHA (23 Oct 2026).
// WHY: bot signups through the real /signup form (Tor exits, dotted Gmail
// addresses, random-string names) were creating auth users + orgs and making
// Supabase send confirmation mail to strangers from our domain.
//
// HOW IT WORKS
// - One invisible widget per page (execution: 'execute', appearance:
//   'interaction-only'): it shows nothing unless Cloudflare wants a human
//   check, then shows a small box inside the slot.
// - getToken() runs a fresh challenge and resolves with a single-use token,
//   which the caller passes to supabase-js as `captchaToken`.
// - Supabase protects /signup, /token (password grant), /otp, /recover and
//   /resend when CAPTCHA is ON. /verify (typing the 6-digit code) is NOT
//   protected, so verifyOtp never needs a token.
//
// DUAL-PATH (same idea as the S101 signup page):
// - No NEXT_PUBLIC_TURNSTILE_SITE_KEY: no script, no widget, getToken()
//   resolves undefined. Correct while Supabase CAPTCHA is OFF.
// - Key set but the challenge fails (script blocked by a corporate proxy,
//   timeout): getToken() resolves undefined and the auth call goes out without
//   a token. If Supabase CAPTCHA is OFF it succeeds; if ON, Supabase rejects
//   it and captchaErrorMessage() turns that into readable copy. The server
//   decides, never the widget.
//
// DEPLOY ORDER (load-bearing): ship this with the site key in Vercel, verify
// a real login + signup on production, THEN switch CAPTCHA on in Supabase.
// Switching it on first locks every user out of sign-in.

import { useCallback, useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      execute: (idOrEl: string | HTMLElement) => void
      reset: (id: string) => void
      remove: (id: string) => void
    }
  }
}

export const TURNSTILE_SITE_KEY: string = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TOKEN_TIMEOUT_MS = 45_000

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => (window.turnstile ? resolve() : reject(new Error('turnstile missing after load')))
    s.onerror = () => {
      scriptPromise = null // allow a retry on the next attempt
      reject(new Error('turnstile script failed to load'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Pending = { resolve: (t: string | undefined) => void; timer: ReturnType<typeof setTimeout> }

export function useTurnstile() {
  const slotRef = useRef<HTMLDivElement | null>(null)
  const widgetId = useRef<string | null>(null)
  const pending = useRef<Pending | null>(null)

  const settle = (token: string | undefined) => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    p.resolve(token)
  }

  const ensureWidget = useCallback(async (): Promise<string | null> => {
    if (!TURNSTILE_SITE_KEY) return null
    if (widgetId.current) return widgetId.current
    await loadTurnstileScript()
    if (!window.turnstile || !slotRef.current) return null
    if (widgetId.current) return widgetId.current
    widgetId.current = window.turnstile.render(slotRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token: string) => settle(token),
      'error-callback': () => { settle(undefined); return true },
      'expired-callback': () => settle(undefined),
      'timeout-callback': () => settle(undefined),
    })
    return widgetId.current
  }, [])

  // Warm the script + widget on mount so the first submit is fast.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    ensureWidget().catch(() => { /* getToken retries and degrades */ })
    return () => {
      settle(undefined)
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch { /* already gone */ }
      }
      widgetId.current = null
    }
  }, [ensureWidget])

  // A fresh single-use token, or undefined (no key, or the challenge failed).
  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!TURNSTILE_SITE_KEY) return undefined
    let id: string | null = null
    try { id = await ensureWidget() } catch { return undefined }
    if (!id || !window.turnstile) return undefined
    settle(undefined) // drop any earlier, unanswered request
    return new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => settle(undefined), TOKEN_TIMEOUT_MS)
      pending.current = { resolve, timer }
      try {
        window.turnstile!.reset(id!) // tokens are single-use: always start clean
        window.turnstile!.execute(id!)
      } catch {
        settle(undefined)
      }
    })
  }, [ensureWidget])

  return { slotRef, getToken }
}

// Where the widget lives. Must stay mounted for the life of the page (put it
// outside any per-step or per-mode branch), or the widget loses its element.
export function TurnstileSlot({ slotRef }: { slotRef: React.MutableRefObject<HTMLDivElement | null> }) {
  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={slotRef} style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }} />
}

// Supabase's CAPTCHA rejection is "captcha protection: request disallowed (...)".
// Show the user something they can act on instead.
export function captchaErrorMessage(message: string): string {
  if (/captcha/i.test(message)) {
    return 'We could not confirm this request came from a person. Refresh the page and try again. If it keeps happening, your network may be blocking our security check: try another network or browser.'
  }
  return message
}
