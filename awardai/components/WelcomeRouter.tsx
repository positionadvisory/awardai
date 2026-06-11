'use client'
// ─────────────────────────────────────────────────────────────────────────────
// WelcomeRouter — Session 56 (Build 3 / C5, Brief-Onboarding-Engagement-v3 §8)
//
// Three-frame first-login flow that routes, not tours.
//   Frame 1 — credibility + the power-user one-click exit
//   Frame 2 — the workflow, mapped (echoed forever by the Progress Spine)
//   Frame 3 — intent routing (evaluate / new entry / scope the season)
//
// Deploys to: components/WelcomeRouter.tsx
//
// Rules this file enforces (do not weaken):
//   • Props-driven, zero data access of its own (A-08 discipline). All
//     persistence and event logging happens in the parent page.
//   • Esc / click-out = SOFT skip (parent decides re-offer-once semantics).
//     The explicit "Skip" link = done forever. "I'll explore on my own" =
//     done forever AND guidance_enabled=false. Three different exits,
//     three different callbacks — do not merge them.
//   • Invitee variant ('invitee') renders frames 1 and 2 only, then a
//     "Go to your projects" finish (v3 brief, resolved decision #3).
//   • Show counts are DERIVED, never hardcoded — the parent passes
//     showCountLabel (e.g. "30+"). Do not write a literal count in copy.
//   • No hover-dependent content; every control ≥ 44px tap target.
//   • Visual treatment: dark green / bone / gold — the guidance-layer
//     treatment (v2, retained). Deliberately distinct from product output
//     (Next Step card is green-50/green-700). C4 nudges reuse these values.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'

// Guidance-layer palette (C4 HelpNudge should import or mirror these)
const DEEP_GREEN = '#14532d'
const DEEP_GREEN_EDGE = '#1d6a3c'
const BONE = '#f5f2ea'
const BONE_MUTED = 'rgba(245, 242, 234, 0.72)'
const GOLD = '#c9a95c'

export type WelcomeRoute = 'evaluate' | 'new_entry' | 'scope_season'
export type WelcomeVariant = 'full' | 'invitee'

type Props = {
  open: boolean
  variant: WelcomeVariant
  showCountLabel: string                 // derived by the parent, e.g. "30+"
  onFrameViewed: (frame: number) => void // parent logs wizard_frame_viewed
  onSoftSkip: () => void                 // Esc or click-out
  onExplicitSkip: () => void             // "Skip" link — done forever
  onExploreAlone: () => void             // Frame 1 exit — done forever + guidance off
  onRoute: (route: WelcomeRoute) => void // Frame 3 selection
  onInviteeDone: () => void              // invitee variant finish
}

export default function WelcomeRouter({
  open,
  variant,
  showCountLabel,
  onFrameViewed,
  onSoftSkip,
  onExplicitSkip,
  onExploreAlone,
  onRoute,
  onInviteeDone,
}: Props) {
  const [frame, setFrame] = useState(1)
  const viewedFrames = useRef<Set<number>>(new Set())

  // Reset to frame 1 each time the wizard opens
  useEffect(() => {
    if (open) {
      setFrame(1)
      viewedFrames.current = new Set()
    }
  }, [open])

  // Log each frame view once per open
  useEffect(() => {
    if (!open) return
    if (viewedFrames.current.has(frame)) return
    viewedFrames.current.add(frame)
    onFrameViewed(frame)
  }, [open, frame, onFrameViewed])

  // Escape = soft skip
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSoftSkip() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onSoftSkip])

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const lastFrame = variant === 'invitee' ? 2 : 3

  // ── Shared bits ────────────────────────────────────────────────────────────

  const primaryButtonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    minHeight: 48,
    background: GOLD,
    color: '#1f2937',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '12px 20px',
  }

  const quietButtonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    minHeight: 44,
    background: 'none',
    color: BONE_MUTED,
    border: `1px solid ${DEEP_GREEN_EDGE}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '10px 20px',
  }

  const routeButtonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    minHeight: 64,
    textAlign: 'left',
    background: 'rgba(245, 242, 234, 0.06)',
    border: `1px solid ${DEEP_GREEN_EDGE}`,
    borderRadius: 10,
    cursor: 'pointer',
    padding: '14px 18px',
  }

  const dots = (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: lastFrame }, (_, i) => i + 1).map(n => (
        <span
          key={n}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: n === frame ? GOLD : 'rgba(245, 242, 234, 0.25)',
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  )

  // Workflow map (Frame 2) — the visual the Progress Spine echoes forever
  const workflowSteps = ['Brief', 'Directions', 'Draft', 'Evaluate / Coach', 'Press Kit', 'Video Script']

  return (
    <div
      onClick={onSoftSkip}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Shortlist"
        style={{
          background: DEEP_GREEN,
          color: BONE,
          borderRadius: 14,
          maxWidth: 560,
          width: '100%',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          padding: '36px 32px 24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── Frame 1 — credibility + exit ───────────────────────────────── */}
        {frame === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: BONE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: DEEP_GREEN }}>S</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.01em' }}>Shortlist</span>
            </div>
            <h2 className="sl-serif" style={{ margin: '0 0 12px', fontSize: '1.7rem', lineHeight: 1.25, fontWeight: 400, color: BONE }}>
              Built by someone who ran an award show.
            </h2>
            <p style={{ margin: '0 0 28px', fontSize: 15, lineHeight: 1.55, color: BONE_MUTED }}>
              Shortlist tells you where your work can win before you spend a word.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setFrame(2)} style={primaryButtonStyle}>
                Show me how it works
              </button>
              <button onClick={onExploreAlone} style={quietButtonStyle}>
                I&apos;ll explore on my own
              </button>
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'rgba(245, 242, 234, 0.45)', textAlign: 'center' }}>
              Exploring on your own turns guidance off everywhere. You can turn it back on in Settings.
            </p>
          </div>
        )}

        {/* ── Frame 2 — the workflow, mapped ─────────────────────────────── */}
        {frame === 2 && (
          <div>
            <h2 className="sl-serif" style={{ margin: '0 0 8px', fontSize: '1.45rem', lineHeight: 1.3, fontWeight: 400, color: BONE }}>
              One workflow, start to ceremony.
            </h2>
            <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.55, color: BONE_MUTED }}>
              Most people start at Evaluate. The wins start at <span style={{ color: GOLD, fontWeight: 600 }}>Directions</span>.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {workflowSteps.map((step, i) => (
                <span key={step} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: step === 'Directions' ? 700 : 500,
                      color: step === 'Directions' ? '#1f2937' : BONE,
                      background: step === 'Directions' ? GOLD : 'rgba(245, 242, 234, 0.08)',
                      border: step === 'Directions' ? `1px solid ${GOLD}` : `1px solid ${DEEP_GREEN_EDGE}`,
                      borderRadius: 99,
                      padding: '6px 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step}
                  </span>
                  {i < workflowSteps.length - 1 && (
                    <span style={{ color: 'rgba(245, 242, 234, 0.4)', fontSize: 13 }}>→</span>
                  )}
                </span>
              ))}
            </div>
            <p style={{ margin: '0 0 26px', fontSize: 13, lineHeight: 1.55, color: BONE_MUTED }}>
              Directions maps which of the {showCountLabel} covered shows are worth entering and where the strongest
              angle is. Everything after that, drafts, evaluations, press kit, script, builds on it.
            </p>
            {variant === 'invitee' ? (
              <button onClick={onInviteeDone} style={primaryButtonStyle}>
                Go to your projects
              </button>
            ) : (
              <button onClick={() => setFrame(3)} style={primaryButtonStyle}>
                Next
              </button>
            )}
          </div>
        )}

        {/* ── Frame 3 — route, don't tour (full variant only) ────────────── */}
        {frame === 3 && variant === 'full' && (
          <div>
            <h2 className="sl-serif" style={{ margin: '0 0 22px', fontSize: '1.45rem', lineHeight: 1.3, fontWeight: 400, color: BONE }}>
              What brings you in?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => onRoute('evaluate')} style={routeButtonStyle}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Evaluate an entry I already have
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Upload the entry and get a jury-standard score in minutes.
                </span>
              </button>
              <button onClick={() => onRoute('new_entry')} style={routeButtonStyle}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Start a new entry
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Begin from the campaign brief. Shortlist maps the angles before you write.
                </span>
              </button>
              <button onClick={() => onRoute('scope_season')} style={routeButtonStyle}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Scope the season
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Deadlines, fees, and budget modelling across {showCountLabel} shows.
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Footer: dots + explicit skip ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 }}>
          {dots}
          <button
            onClick={onExplicitSkip}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(245, 242, 234, 0.45)',
              fontSize: 13,
              cursor: 'pointer',
              padding: '12px 8px',
              minHeight: 44,
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
