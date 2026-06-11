'use client'
// ─────────────────────────────────────────────────────────────────────────────
// WelcomeRouter — Session 56 (Build 3 / C5) + Session 57 UX polish
//
// Three-frame first-login flow that routes, not tours.
//   Frame 1 — credibility + the power-user one-click exit
//   Frame 2 — the workflow, mapped (echoed forever by the Progress Spine).
//             Session 57: every stage pill is clickable and swaps the
//             snapshot copy below (Directions stays the default).
//   Frame 3 — intent routing (evaluate / new entry / scope the season).
//             Session 57: route selection fades the modal out (250ms)
//             before the parent navigates — no hard jump.
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
//   • No hover-dependent CONTENT (hover is feedback only — everything is
//     reachable by tap/click); every control keeps a ≥ 44px-tall hit area
//     (pills and dots use transparent padding to preserve the visual size).
//   • Session 57: nav dots are clickable (free movement between viewed-able
//     frames). Frame-view logging stays once per open via viewedFrames.
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

// Small hover-feedback wrapper. All styles inline (Tailwind hover: classes are
// unavailable in this inline-styled component). Hover styles are FEEDBACK ONLY
// — never content. Focus mirrors hover for keyboard users.
function HoverButton({
  baseStyle,
  hoverStyle,
  onClick,
  ariaLabel,
  children,
}: {
  baseStyle: React.CSSProperties
  hoverStyle: React.CSSProperties
  onClick: () => void
  ariaLabel?: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        transition: 'transform 150ms ease, background 150ms ease, border-color 150ms ease, filter 150ms ease, box-shadow 150ms ease, color 150ms ease',
        ...baseStyle,
        ...(hovered ? hoverStyle : {}),
      }}
    >
      {children}
    </button>
  )
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
  const [selectedStep, setSelectedStep] = useState('Directions')
  const [closing, setClosing] = useState(false)
  const [entered, setEntered] = useState(false)
  const viewedFrames = useRef<Set<number>>(new Set())
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset each time the wizard opens; fade in on the next tick
  useEffect(() => {
    if (open) {
      setFrame(1)
      setSelectedStep('Directions')
      setClosing(false)
      setEntered(false)
      viewedFrames.current = new Set()
      const t = setTimeout(() => setEntered(true), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  // Clear any pending close timer on unmount
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  // Log each frame view once per open
  useEffect(() => {
    if (!open) return
    if (viewedFrames.current.has(frame)) return
    viewedFrames.current.add(frame)
    onFrameViewed(frame)
  }, [open, frame, onFrameViewed])

  // Escape = soft skip (ignored mid-close)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !closing) onSoftSkip() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closing, onSoftSkip])

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const lastFrame = variant === 'invitee' ? 2 : 3

  // Fade the modal out, THEN hand off to the parent. Guards double-fires.
  const closeThen = (fn: () => void) => {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(fn, 250)
  }

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
  const primaryButtonHover: React.CSSProperties = {
    filter: 'brightness(1.07)',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
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
  const quietButtonHover: React.CSSProperties = {
    background: 'rgba(245, 242, 234, 0.08)',
    color: BONE,
    borderColor: 'rgba(245, 242, 234, 0.4)',
    transform: 'translateY(-1px)',
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
  const routeButtonHover: React.CSSProperties = {
    background: 'rgba(245, 242, 234, 0.12)',
    borderColor: 'rgba(201, 169, 92, 0.65)',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
  }

  // Clickable nav dots — 44px-tall hit areas, dot rendered inside
  const dots = (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {Array.from({ length: lastFrame }, (_, i) => i + 1).map(n => (
        <DotButton key={n} n={n} active={n === frame} onClick={() => { if (!closing) setFrame(n) }} />
      ))}
    </div>
  )

  // Frame 2 — workflow stages + one-line snapshots (Session 57: clickable;
  // Press Kit moved LAST to match the spine — script before announcement)
  const workflowSteps = ['Brief', 'Directions', 'Draft', 'Evaluate / Coach', 'Video Script', 'Press Kit']
  const stepSnapshots: Record<string, string> = {
    'Brief': `The Brief holds the campaign story and what you want the entry to achieve. Everything Shortlist generates draws on it, so a sharper brief means sharper output at every step after.`,
    'Directions': `Directions maps which of the ${showCountLabel} covered shows are worth entering and where the strongest angle is. Everything after that, drafts, evaluations, press kit, script, builds on it.`,
    'Draft': `Draft turns a chosen direction into three written versions of the entry, built to the word limits and conventions of the show and category you targeted.`,
    'Evaluate / Coach': `Evaluate scores the entry the way a jury would. Coach flips the lens and shows the potential the entry is leaving on the table. Run both before you submit.`,
    'Press Kit': `Press Kit turns a finished entry into ready-to-send press copy, social posts, and a PDF, with your agency details and logo built in.`,
    'Video Script': `Video Script drafts the case-study film script from the same campaign material, matched to the show you are entering.`,
  }

  return (
    <div
      onClick={() => { if (!closing) onSoftSkip() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        opacity: closing ? 0 : entered ? 1 : 0,
        transition: 'opacity 250ms ease',
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
          transform: closing ? 'scale(0.98)' : 'scale(1)',
          transition: 'transform 250ms ease',
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
              <HoverButton baseStyle={primaryButtonStyle} hoverStyle={primaryButtonHover} onClick={() => setFrame(2)}>
                Show me how it works
              </HoverButton>
              <HoverButton baseStyle={quietButtonStyle} hoverStyle={quietButtonHover} onClick={onExploreAlone}>
                I&apos;ll explore on my own
              </HoverButton>
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
              Click any stage to see what it does.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {workflowSteps.map((step, i) => (
                <span key={step} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <StepPill
                    label={step}
                    selected={step === selectedStep}
                    onClick={() => setSelectedStep(step)}
                  />
                  {i < workflowSteps.length - 1 && (
                    <span style={{ color: 'rgba(245, 242, 234, 0.4)', fontSize: 13 }}>→</span>
                  )}
                </span>
              ))}
            </div>
            <p style={{ margin: '0 0 26px', fontSize: 13, lineHeight: 1.55, color: BONE_MUTED, minHeight: 60 }}>
              {stepSnapshots[selectedStep]}
            </p>
            {variant === 'invitee' ? (
              <HoverButton baseStyle={primaryButtonStyle} hoverStyle={primaryButtonHover} onClick={() => closeThen(onInviteeDone)}>
                Go to your projects
              </HoverButton>
            ) : (
              <HoverButton baseStyle={primaryButtonStyle} hoverStyle={primaryButtonHover} onClick={() => setFrame(3)}>
                Next
              </HoverButton>
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
              <HoverButton baseStyle={routeButtonStyle} hoverStyle={routeButtonHover} onClick={() => closeThen(() => onRoute('evaluate'))}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Evaluate an entry I already have
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Upload the entry and get a jury-standard score in minutes.
                </span>
              </HoverButton>
              <HoverButton baseStyle={routeButtonStyle} hoverStyle={routeButtonHover} onClick={() => closeThen(() => onRoute('new_entry'))}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Start a new entry
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Begin from the campaign brief. Shortlist maps the angles before you write.
                </span>
              </HoverButton>
              <HoverButton baseStyle={routeButtonStyle} hoverStyle={routeButtonHover} onClick={() => closeThen(() => onRoute('scope_season'))}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: BONE }}>
                  Scope the season
                </span>
                <span style={{ display: 'block', fontSize: 13, color: BONE_MUTED, marginTop: 3 }}>
                  Deadlines, fees, and budget modelling across {showCountLabel} shows.
                </span>
              </HoverButton>
            </div>
          </div>
        )}

        {/* ── Footer: dots + explicit skip ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 }}>
          {dots}
          <HoverButton
            baseStyle={{
              background: 'none',
              border: 'none',
              color: 'rgba(245, 242, 234, 0.45)',
              fontSize: 13,
              cursor: 'pointer',
              padding: '12px 8px',
              minHeight: 44,
            }}
            hoverStyle={{ color: BONE }}
            onClick={onExplicitSkip}
          >
            Skip
          </HoverButton>
        </div>
      </div>
    </div>
  )
}

// ── Clickable nav dot — transparent 28×44 hit area, 7px dot inside ──────────
function DotButton({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      aria-label={`Go to step ${n}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        width: 28,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: active ? GOLD : hovered ? 'rgba(245, 242, 234, 0.55)' : 'rgba(245, 242, 234, 0.25)',
          display: 'inline-block',
          transform: hovered && !active ? 'scale(1.45)' : 'scale(1)',
          transition: 'background 150ms ease, transform 150ms ease',
        }}
      />
    </button>
  )
}

// ── Clickable workflow stage pill — transparent 44px-tall hit area ──────────
function StepPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '6px 0',
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: selected ? 700 : 500,
          color: selected ? '#1f2937' : BONE,
          background: selected ? GOLD : hovered ? 'rgba(245, 242, 234, 0.16)' : 'rgba(245, 242, 234, 0.08)',
          border: selected ? `1px solid ${GOLD}` : hovered ? '1px solid rgba(201, 169, 92, 0.6)' : `1px solid ${DEEP_GREEN_EDGE}`,
          borderRadius: 99,
          padding: '6px 12px',
          whiteSpace: 'nowrap',
          transform: hovered && !selected ? 'translateY(-1px)' : 'none',
          transition: 'background 150ms ease, border-color 150ms ease, transform 150ms ease',
        }}
      >
        {label}
      </span>
    </button>
  )
}
