'use client'
import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* =========================================================================
   Hooks
   ========================================================================= */

function usePublicAuth() {
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session))
    return () => subscription.unsubscribe()
  }, [])
  return authed
}

// false by default (SSR-safe — avoids flash on desktop, minor flash on mobile)
function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return mobile
}

/* =========================================================================
   Shared atoms
   ========================================================================= */

const Eyebrow = ({ children, tone = 'dark' }: { children: React.ReactNode; tone?: 'dark' | 'light' }) => (
  <div className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: tone === 'light' ? 'var(--muted-dark)' : 'var(--muted)', fontWeight: 500 }}>
    <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', marginRight: 10, marginBottom: 2, verticalAlign: 'middle' }} />
    {children}
  </div>
)

const Container = ({ children, style, m }: { children: React.ReactNode; style?: React.CSSProperties; m?: boolean }) => (
  <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: m ? '0 20px' : '0 40px', ...style }}>
    {children}
  </div>
)

const PrimaryCTA = ({ children, tone = 'dark', small = false, onClick, m }: { children: React.ReactNode; tone?: string; small?: boolean; onClick?: () => void; m?: boolean }) => {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 14, padding: (m || small) ? '14px 22px' : '18px 28px', background: hov ? 'var(--gold-deep)' : 'var(--gold)', color: 'var(--ink)', border: 'none', borderRadius: 0, fontFamily: 'inherit', fontSize: m ? 14 : (small ? 13 : 15), fontWeight: 600, letterSpacing: '0.01em', cursor: 'pointer', transition: 'background 180ms ease', width: m ? '100%' : undefined, justifyContent: m ? 'center' : undefined }}>
      <span>{children}</span>
      <span style={{ display: 'inline-block', width: 18, height: 1, background: 'var(--ink)', transform: hov ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 180ms ease' }} />
    </button>
  )
}

const GhostCTA = ({ children, tone = 'dark', m }: { children: React.ReactNode; tone?: string; m?: boolean }) => (
  <button onClick={() => document.getElementById('built')?.scrollIntoView({ behavior: 'smooth' })}
    style={{ padding: m ? '14px 22px' : '16px 24px', background: 'transparent', color: tone === 'dark' ? 'var(--bone)' : 'var(--ink)', border: `1px solid ${tone === 'dark' ? 'rgba(245,238,224,0.3)' : 'var(--rule)'}`, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, borderRadius: 0, cursor: 'pointer', width: m ? '100%' : undefined }}>
    {children}
  </button>
)

const Logo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="1.4" />
    <rect x="6" y="6" width="12" height="12" fill="var(--gold)" />
    <path d="M9 12 L11 14 L15 10" stroke="var(--ink)" strokeWidth="1.4" fill="none" strokeLinecap="square" />
  </svg>
)

/* =========================================================================
   Nav
   ========================================================================= */

const Nav = ({ onCTA, m }: { onCTA: () => void; m: boolean }) => (
  <nav style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--green-deep)', color: 'var(--bone)', borderBottom: '1px solid rgba(245,238,224,0.08)' }}>
    <Container m={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: m ? 56 : 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo size={20} />
        <span className="sl-serif" style={{ fontSize: m ? 18 : 22, lineHeight: 1 }}>Shortlist</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: m ? 12 : 36, fontSize: 13 }}>
        {!m && <>
          <a href="#how" style={{ textDecoration: 'none', opacity: 0.85, color: 'inherit' }}>How it works</a>
          <a href="#built" style={{ textDecoration: 'none', opacity: 0.85, color: 'inherit' }}>What&apos;s built</a>
          <a href="#pricing" style={{ textDecoration: 'none', opacity: 0.85, color: 'inherit' }}>Pricing</a>
          <a href="#founder" style={{ textDecoration: 'none', opacity: 0.85, color: 'inherit' }}>Founder</a>
          <a href="/faq" style={{ textDecoration: 'none', opacity: 0.85, color: 'inherit' }}>FAQ</a>
        </>}
        <button onClick={onCTA} className="sl-mono" style={{ fontSize: m ? 10 : 11, letterSpacing: '0.16em', textTransform: 'uppercase', padding: m ? '6px 10px' : '8px 14px', border: '1px solid rgba(245,238,224,0.25)', background: 'transparent', color: 'var(--bone)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {m ? 'Start free' : 'Sign in'}
        </button>
      </div>
    </Container>
  </nav>
)

/* =========================================================================
   Hero
   ========================================================================= */

const Hero = ({ onCTA, m }: { onCTA: () => void; m: boolean }) => (
  <section style={{ background: 'var(--green-deep)', color: 'var(--bone)', paddingTop: m ? 56 : 96, paddingBottom: m ? 64 : 120, position: 'relative', overflow: 'hidden' }}>
    {!m && <div className="sl-mono" style={{ position: 'absolute', top: 24, right: 40, fontSize: 11, letterSpacing: '0.18em', color: 'var(--muted-dark)', textTransform: 'uppercase' }}>Edition 01 / Asia / 2026</div>}
    <Container m={m}>
      <Eyebrow tone="light">Awards intelligence, built by someone who ran one</Eyebrow>
      <h1 className="sl-serif" style={{ margin: '24px 0 0', fontSize: m ? 'clamp(44px, 12vw, 72px)' : 'clamp(48px, 7vw, 104px)', lineHeight: 1.0, letterSpacing: '-0.02em', maxWidth: 1100, fontWeight: 400 }}>
        Your final edit,<br />brought forward<br />
        <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>as fast as possible.</span>
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 32 : 64, marginTop: m ? 40 : 80, alignItems: 'end' }}>
        <p style={{ fontSize: m ? 17 : 19, lineHeight: 1.55, color: 'var(--muted-dark)', margin: 0 }}>
          Shortlist is an awards intelligence system for agencies. It puts the lead strategist and the CEO in the editor-in-chief seat from step one. Entry directions, first drafts, jury evaluation, coach feedback: ready before the real expertise is applied, not instead of it.
        </p>
        <div>
          <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', alignItems: m ? 'stretch' : 'center', gap: m ? 10 : 16 }}>
            <PrimaryCTA onClick={onCTA} m={m}>Start free trial</PrimaryCTA>
            <GhostCTA tone="dark" m={m}>See what&apos;s built</GhostCTA>
          </div>
          <div className="sl-mono" style={{ marginTop: 16, fontSize: 12, color: 'var(--muted-dark)', letterSpacing: '0.04em' }}>
            30+ shows. Unlimited entries. The judgment stays yours.
          </div>
        </div>
      </div>
      {!m && (
        <div style={{ marginTop: 96, borderTop: '1px solid rgba(245,238,224,0.18)', paddingTop: 24 }}>
          <div className="sl-mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-dark)' }}>
            <div><span style={{ color: 'var(--gold)' }}>01 /</span> Entry directions</div>
            <div><span style={{ color: 'var(--gold)' }}>02 /</span> Jury-mode evaluation</div>
            <div><span style={{ color: 'var(--gold)' }}>03 /</span> Press kit generation</div>
            <div><span style={{ color: 'var(--gold)' }}>04 /</span> Video script scoring</div>
          </div>
        </div>
      )}
      {m && (
        <div style={{ marginTop: 40, borderTop: '1px solid rgba(245,238,224,0.18)', paddingTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['01', 'Entry directions'], ['02', 'Jury evaluation'], ['03', 'Press kit'], ['04', 'Video script']].map(([n, l]) => (
            <div key={n} className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-dark)' }}>
              <span style={{ color: 'var(--gold)' }}>{n} /</span> {l}
            </div>
          ))}
        </div>
      )}
    </Container>
  </section>
)

/* =========================================================================
   Founder
   ========================================================================= */

const Founder = ({ m }: { m: boolean }) => (
  <section id="founder" style={{ background: 'var(--paper)', color: 'var(--ink)', padding: m ? '72px 0 80px' : '120px 0 140px', borderTop: '1px solid var(--rule)' }}>
    <Container m={m}>
      <Eyebrow>Who built this</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(0, 1fr) 420px', gap: m ? 48 : 80, marginTop: 32, alignItems: 'start' }}>
        {/* On mobile: photo first, then text */}
        {m && (
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ben.jpg" alt="Ben Condit, founder of Shortlist" style={{ width: '100%', height: 280, objectFit: 'cover', objectPosition: 'center 20%', display: 'block', filter: 'saturate(0.9)' }} />
            <figcaption className="sl-mono" style={{ marginTop: 10, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Ben Condit</span><span>Shanghai · 2026</span>
            </figcaption>
          </figure>
        )}
        <div>
          <h2 className="sl-serif" style={{ margin: 0, fontSize: m ? 'clamp(28px, 8vw, 44px)' : 'clamp(36px, 4.4vw, 64px)', lineHeight: 1.05, letterSpacing: '-0.01em', maxWidth: 720, fontWeight: 400 }}>
            Built by someone who&apos;s been on both sides of the problem.
          </h2>
          <div style={{ marginTop: m ? 32 : 48, fontSize: m ? 16 : 17, lineHeight: 1.65, maxWidth: 640, color: 'oklch(0.28 0.02 155)' }}>
            <p style={{ margin: '0 0 20px' }}>Spent 25 years building things in Asia. Co-founded a digital agency in Hong Kong in 2003, led regional digital for adidas across 13 markets, then joined Mindshare China in 2012.</p>
            <p style={{ margin: '0 0 20px' }}>As Chief Strategy Officer, built the agency&apos;s awards program from nothing into the most recognized in Asia. More than 1,000 entries over a decade. 300 wins by 2020. The process worked. The cost, in time, in team bandwidth, in late-night feedback sessions, was real.</p>
            <p style={{ margin: '0 0 20px' }}>To be clear about that cost: a strategy team that ideally would have been doing brilliant client work spent a significant portion of their lives finding angles, drafting scripts, writing entries, and waiting on one person&apos;s edits. That person was me. This is an attempt to optimize that.</p>
            <p style={{ margin: '0 0 20px' }}>As CEO of Mindshare China from 2021, oversaw 500+ additional wins and three consecutive top-10 global rankings in the WARC Media 100. The agency was named Greater China Media Agency of the Year, China Digital Agency of the Year, and in 2023, Global Media Agency of the Year Silver at Campaign Global.</p>
          </div>
          <div style={{ margin: m ? '36px 0' : '56px 0', padding: '0 0 0 24px', borderLeft: '2px solid var(--gold)', maxWidth: 580 }}>
            <p className="sl-serif" style={{ margin: 0, fontSize: m ? 24 : 32, lineHeight: 1.25, fontStyle: 'italic', letterSpacing: '-0.01em', color: 'var(--ink)' }}>
              Silver. Second best in the world.<br />Still think about that one.
            </p>
          </div>
          <div style={{ fontSize: m ? 16 : 17, lineHeight: 1.65, maxWidth: 640, color: 'oklch(0.28 0.02 155)' }}>
            <p style={{ margin: 0 }}>After 13 years in the multinational machine, am now walking my son to preschool, investing in sports and entertainment ventures across Asia, and, between drop-off and pickup, building Shortlist.</p>
          </div>
          <div style={{ marginTop: m ? 36 : 56, paddingTop: 24, borderTop: '1px solid var(--rule)', display: 'flex', flexDirection: m ? 'column' : 'row', justifyContent: m ? undefined : 'space-between', alignItems: m ? 'flex-start' : 'baseline', gap: m ? 8 : 0, maxWidth: 640 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Ben Condit</div>
              <div className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 4 }}>Founder, Shortlist · Shanghai</div>
            </div>
            <a href="mailto:ben@positionadvisory.com" className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 4 }}>ben@positionadvisory.com</a>
          </div>
        </div>
        {/* Desktop: photo in right column */}
        {!m && (
          <div>
            <div style={{ position: 'sticky', top: 96 }}>
              <figure style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ben.jpg" alt="Ben Condit, founder of Shortlist" style={{ width: '100%', height: 520, objectFit: 'cover', objectPosition: 'center 20%', display: 'block', filter: 'saturate(0.9)' }} />
                <figcaption className="sl-mono" style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Ben Condit</span><span>Shanghai · 2026</span>
                </figcaption>
              </figure>
              <div style={{ marginTop: 36, borderTop: '1px solid var(--rule)' }}>
                {[['1,500+', 'Career entries overseen'], ['25', "Years in 4A's and independents"], ['3x', 'Top-10 WARC Media 100 rankings'], ['1', "Silver that won't quite leave him alone"]].map(([k, v], i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, padding: '18px 0', borderBottom: '1px solid var(--rule)', alignItems: 'baseline' }}>
                    <div className="sl-serif" style={{ fontSize: 32, lineHeight: 1, letterSpacing: '-0.01em' }}>{k}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Mobile: compact stats below text */}
        {m && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--rule)' }}>
            {[['1,500+', 'Career entries'], ['25', 'Years in the industry'], ['3x', 'WARC Media 100'], ['1', 'Silver unforgotten']].map(([k, v], i) => (
              <div key={i} style={{ padding: '16px 0', borderBottom: '1px solid var(--rule)', borderRight: i % 2 === 0 ? '1px solid var(--rule)' : 'none', paddingRight: i % 2 === 0 ? 16 : 0, paddingLeft: i % 2 === 1 ? 16 : 0 }}>
                <div className="sl-serif" style={{ fontSize: 28, lineHeight: 1, letterSpacing: '-0.01em' }}>{k}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  </section>
)

/* =========================================================================
   Problem
   ========================================================================= */

const Problem = ({ m }: { m: boolean }) => (
  <section style={{ background: 'var(--ink)', color: 'var(--bone)', padding: m ? '72px 0' : '120px 0' }}>
    <Container m={m}>
      <Eyebrow tone="light">The known problem</Eyebrow>
      <h2 className="sl-serif" style={{ margin: '24px 0 0', fontSize: m ? 'clamp(32px, 9vw, 52px)' : 'clamp(36px, 4.6vw, 68px)', lineHeight: 1.05, letterSpacing: '-0.015em', maxWidth: 1000, fontWeight: 400 }}>
        Running a serious program<br />
        <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>costs the wrong people.</span>
      </h2>
      <div style={{ marginTop: m ? 48 : 80, display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, 1fr)', borderTop: '1px solid var(--rule-dark)', borderBottom: '1px solid var(--rule-dark)' }}>
        {[['$30K+', 'Average agency spend per awards season'], ['>60%', 'Of entries that never make shortlist'], ['0', 'Dedicated awards writers at most agencies']].map(([k, v], i) => (
          <div key={i} style={{ padding: m ? '32px 0' : '48px 32px', borderRight: (!m && i < 2) ? '1px solid var(--rule-dark)' : 'none', borderBottom: (m && i < 2) ? '1px solid var(--rule-dark)' : 'none', position: 'relative' }}>
            {!m && <div className="sl-mono" style={{ position: 'absolute', top: 16, left: 32, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted-dark)' }}>{String(i + 1).padStart(2, '0')} / 03</div>}
            <div className="sl-serif" style={{ fontSize: m ? 'clamp(56px, 14vw, 80px)' : 'clamp(64px, 7vw, 112px)', lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--bone)', marginTop: m ? 0 : 24 }}>{k}</div>
            <div style={{ marginTop: 16, fontSize: 14, color: 'var(--muted-dark)', maxWidth: 280, lineHeight: 1.5 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: m ? 48 : 96, display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 40 : 64 }}>
        <div>
          <div className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 16 }}>The general problem</div>
          <p style={{ margin: 0, fontSize: m ? 16 : 18, lineHeight: 1.6, color: 'var(--bone)' }}>The fully-loaded cost of a single serious entry, fees plus the senior time it actually takes, runs $6,000 to $12,000. Multiply that across a competitive season and the awards budget is a real line item. Most of that cost lands on the two or three people in the agency who can least afford to give it.</p>
          <p style={{ margin: '16px 0 0', fontSize: m ? 16 : 18, lineHeight: 1.6, color: 'var(--muted-dark)' }}>The category selection is guesswork. The writing is rushed. When the results come in, nobody really knows what went wrong.</p>
        </div>
        <div>
          <div className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 16 }}>The Asia problem</div>
          <p style={{ margin: 0, fontSize: m ? 16 : 18, lineHeight: 1.6, color: 'var(--bone)' }}>For agencies in Asia, the problem compounds. English is unlikely to be the team&apos;s first language. Jury members, often Western, skim entries in seconds. A brilliant campaign dies in translation before a judge has read past the first paragraph.</p>
          <p style={{ margin: '16px 0 0', fontSize: m ? 16 : 18, lineHeight: 1.6, color: 'var(--muted-dark)' }}>This was true at every agency worked with and competed against. It&apos;s still true now.</p>
        </div>
      </div>
    </Container>
  </section>
)

/* =========================================================================
   How it works (mobile: simplified, no viz frames)
   ========================================================================= */

const VizFrame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 24px 48px -28px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--rule)', background: 'var(--bone-2)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {['oklch(0.78 0.01 90)', 'oklch(0.78 0.01 90)', 'var(--gold)'].map((bg, i) => <span key={i} style={{ width: 8, height: 8, background: bg }} />)}
      </div>
      <span className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
    </div>
    <div style={{ padding: 22 }}>{children}</div>
  </div>
)

const DRow = ({ show, cat, score, roi, angle, top }: { show: string; cat: string; score: number; roi: string; angle: string; top?: boolean }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) 60px 56px 56px', gap: 12, padding: '14px 0', borderTop: top ? '1px solid var(--rule)' : 'none', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{show}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{cat} · <em>{angle}</em></div></div>
    <div><div style={{ height: 4, background: 'var(--rule)' }}><div style={{ height: 4, width: `${score}%`, background: score > 70 ? 'var(--gold)' : 'oklch(0.55 0.04 155)' }} /></div><div className="sl-mono" style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.1em', color: 'var(--muted)' }}>{score}% win</div></div>
    <div className="sl-mono" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>ROI</div>
    <div className="sl-serif" style={{ fontSize: 22, lineHeight: 1, textAlign: 'right' }}>{roi}</div>
  </div>
)

const DirectionsViz = () => (
  <VizFrame label="Entry directions / generated">
    <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Project: Heritage rebrand · 11 directions surfaced</div>
    <DRow top show="Cannes Lions" cat="Brand Experience" score={78} roi="3.4x" angle="cultural reset, not a launch" />
    <DRow show="Effie APAC" cat="Sustained Success" score={71} roi="2.9x" angle="five-year compound effect" />
    <DRow show="Spikes Asia" cat="Strategy" score={64} roi="2.1x" angle="reframing the category" />
    <DRow show="D&AD" cat="Writing for Design" score={42} roi="0.9x" angle="craft-led, weaker fit" />
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, alignItems: 'center' }}>
      <div className="sl-mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Recommended: 3 entries · $11,400</div>
      <div style={{ fontSize: 11, color: 'var(--gold-deep)', fontWeight: 600 }}>Generate briefs →</div>
    </div>
  </VizFrame>
)

const JuryViz = () => {
  const dims: [string, number, number][] = [['Insight', 82, 64], ['Strategy', 74, 70], ['Idea', 88, 78], ['Craft', 61, 80], ['Results', 55, 88], ['Storytelling', 49, 72]]
  return (
    <VizFrame label="Jury mode / six dimensions">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <div><div className="sl-serif" style={{ fontSize: 36, lineHeight: 1, letterSpacing: '-0.01em' }}>67<span style={{ color: 'var(--muted)', fontSize: 18 }}>/100</span></div><div className="sl-mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 6 }}>Jury score · current draft</div></div>
        <div style={{ display: 'flex', gap: 6 }}><span className="sl-mono" style={{ fontSize: 10, padding: '4px 8px', border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--bone)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Jury</span><span className="sl-mono" style={{ fontSize: 10, padding: '4px 8px', border: '1px solid var(--rule)', color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Coach</span></div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {dims.map(([name, cur, target]) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--ink)' }}>{name}</div>
            <div style={{ position: 'relative', height: 6, background: 'var(--rule)' }}><div style={{ position: 'absolute', left: `${target}%`, top: -3, width: 1, height: 12, background: 'var(--ink)' }} /><div style={{ height: 6, width: `${cur}%`, background: cur < 60 ? 'oklch(0.7 0.13 50)' : 'var(--gold)' }} /></div>
            <div className="sl-mono" style={{ fontSize: 11, textAlign: 'right', color: cur < 60 ? 'oklch(0.55 0.13 50)' : 'var(--ink)' }}>{cur}<span style={{ color: 'var(--muted)' }}>/{target}</span></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, padding: 12, background: 'var(--bone-2)', borderLeft: '2px solid var(--gold)' }}>
        <div className="sl-mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Top fix</div>
        <div style={{ fontSize: 13 }}>Results section reads as outputs. Reframe as outcome on the brand&apos;s commercial trajectory.</div>
      </div>
    </VizFrame>
  )
}

const PressKitViz = () => (
  <VizFrame label="Press kit / agency voice">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[['LinkedIn', 'Long-form post', '412 words'], ['X', 'Thread, 7 posts', '1,180 chars'], ['Instagram', 'Caption + 3 cards', 'Ready'], ['Press release', 'Wire-ready PDF', '1.2 MB'], ['Email (HTML)', 'Outlook-safe', 'Tested'], ['Press PDF', 'Single page', 'Print-ready']].map(([k, v, badge], i) => (
        <div key={i} style={{ padding: '12px', background: 'var(--bone-2)', borderLeft: '2px solid var(--gold)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 13, fontWeight: 600 }}>{k}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{v}</div></div>
          <div className="sl-mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>{badge}</div>
        </div>
      ))}
    </div>
  </VizFrame>
)

const VideoViz = () => (
  <VizFrame label="Video script / scored">
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', gap: 10, alignItems: 'stretch' }}>
      {[['00:00', 'OPEN ON the data, not the brand.', 84], ['00:08', 'Cut to interview. The problem in their words.', 78], ['00:34', 'Outcome moment. Hold on the silence after.', 91], ['00:48', 'End card. The number that mattered.', 68]].map(([t, line, score], i) => (
        <Fragment key={i}>
          <div className="sl-mono" style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 0', borderTop: '1px solid var(--rule)' }}>{t}</div>
          <div style={{ fontSize: 13, padding: '10px 0', borderTop: '1px solid var(--rule)' }}>{line}</div>
          <div style={{ padding: '10px 0', borderTop: '1px solid var(--rule)', textAlign: 'right' }}>
            <div className="sl-mono" style={{ fontSize: 9, color: 'var(--muted)' }}>BEAT</div>
            <div className="sl-serif" style={{ fontSize: 18, lineHeight: 1, color: (score as number) > 80 ? 'var(--gold-deep)' : 'var(--ink)' }}>{score}</div>
          </div>
        </Fragment>
      ))}
    </div>
  </VizFrame>
)

const HowItWorks = ({ m }: { m: boolean }) => {
  const cards = [
    { n: '01', label: 'Entry directions', problem: "You don't know where to enter until you've already paid.", body: "Upload your brief and materials. Shortlist reads everything and generates entry directions per show and category, each with a win likelihood score, strategic angle, and ROI index. Know where you have a real shot before spending a dollar.", visual: <DirectionsViz /> },
    { n: '02', label: 'Jury-mode evaluation', problem: "You can't see your own blind spots.", body: "Two evaluation modes: Jury mode scores your entry across six dimensions, the way a judge would. Coach mode shows your untapped potential and a prioritized fix list. Both run on the same entry. Weaknesses caught before submission, not after.", visual: <JuryViz /> },
    { n: '03', label: 'Press kit generation', problem: 'The scramble after a shortlist is its own emergency.', body: "The moment your entry is ready, Shortlist generates the full press kit: LinkedIn, X, Instagram, press release, PDF, and Outlook-safe HTML email, all in your agency voice. No brief. No back and forth. Done.", visual: <PressKitViz /> },
    { n: '04', label: 'Video script', problem: 'Most director briefings happen before anyone knows what the jury needs to see.', body: "Generate and score your awards video script in the same workspace. Category-specific guidance. Win likelihood scored. Arrive at the director briefing knowing exactly what needs to be on screen.", visual: <VideoViz /> },
  ]
  return (
    <section id="how" style={{ background: 'var(--bone)', padding: m ? '72px 0 80px' : '120px 0 140px' }}>
      <Container m={m}>
        <Eyebrow>The editor-in-chief seat, from step one</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 20 : 80, marginTop: 24, alignItems: 'end' }}>
          <h2 className="sl-serif" style={{ margin: 0, fontSize: m ? 'clamp(30px, 8vw, 44px)' : 'clamp(36px, 4.4vw, 64px)', lineHeight: 1.05, letterSpacing: '-0.01em', maxWidth: 600, fontWeight: 400 }}>
            The process that gets you there{' '}<span style={{ fontStyle: 'italic', color: 'var(--gold-deep)' }}>doesn&apos;t have to cost the beach.</span>
          </h2>
          {!m && <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 460 }}>Every campaign that deserves a proper entry gets one. Not a rushed submission on deadline night. Not a direction chosen because it was the first one remembered.</p>}
        </div>
        <div style={{ marginTop: m ? 40 : 80, display: 'grid', gridTemplateColumns: '1fr', borderTop: '1px solid var(--rule)' }}>
          {cards.map((c, i) => (
            <div key={c.n} style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : (i % 2 === 1 ? 'minmax(0, 1fr) minmax(0, 1.05fr)' : 'minmax(0, 1.05fr) minmax(0, 1fr)'), gap: m ? 24 : 64, padding: m ? '40px 0' : '64px 0', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
              <div style={{ order: (!m && i % 2 === 1) ? 2 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  <span className="sl-mono" style={{ fontSize: 12, letterSpacing: '0.18em', color: 'var(--muted)' }}>{c.n}</span>
                  <span className="sl-mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>{c.label}</span>
                </div>
                <h3 className="sl-serif" style={{ margin: '16px 0 0', fontSize: m ? 'clamp(22px, 6vw, 32px)' : 'clamp(28px, 3.2vw, 44px)', lineHeight: 1.1, letterSpacing: '-0.01em', maxWidth: 520, fontWeight: 400 }}>{c.problem}</h3>
                <p style={{ marginTop: 16, fontSize: m ? 15 : 17, lineHeight: 1.6, color: 'oklch(0.32 0.02 155)', maxWidth: 520 }}>{c.body}</p>
              </div>
              <div style={{ order: (!m && i % 2 === 1) ? 1 : 2 }}>{c.visual}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

/* =========================================================================
   Privacy
   ========================================================================= */

const Privacy = ({ m }: { m: boolean }) => (
  <section style={{ background: 'var(--green-deep)', color: 'var(--bone)', padding: m ? '72px 0' : '120px 0' }}>
    <Container m={m}>
      <Eyebrow tone="light">Data privacy</Eyebrow>
      <h2 className="sl-serif" style={{ margin: '24px 0 0', fontSize: m ? 'clamp(32px, 9vw, 56px)' : 'clamp(36px, 5vw, 76px)', lineHeight: 1.05, letterSpacing: '-0.015em', fontWeight: 400, maxWidth: 900 }}>
        Your work stays <span style={{ fontStyle: 'italic', color: 'var(--gold)' }}>your work.</span>
      </h2>
      <ol style={{ listStyle: 'none', padding: 0, margin: m ? '40px 0 0' : '72px 0 0', display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, 1fr)', gap: m ? 0 : '0 64px', borderTop: '1px solid var(--rule-dark)' }}>
        {['Every project, draft, and evaluation is locked to your account. No other agency sees it.', "Shortlist runs on Anthropic's Claude API. Under their terms, content submitted via the API is never used to train their models. Your sandbox is your sandbox.", 'Award intelligence is built from two decades of professional experience and verified public records, not from your submissions.', 'All data is encrypted in transit and at rest.'].map((line, i) => (
          <li key={i} style={{ padding: m ? '24px 0' : '32px 0', borderBottom: '1px solid var(--rule-dark)', display: 'grid', gridTemplateColumns: '48px 1fr', gap: 16, alignItems: 'start' }}>
            <div className="sl-serif" style={{ fontSize: m ? 28 : 36, lineHeight: 1, color: 'var(--gold)' }}>{String(i + 1).padStart(2, '0')}</div>
            <p style={{ margin: 0, fontSize: m ? 15 : 17, lineHeight: 1.55, color: 'var(--bone)' }}>{line}</p>
          </li>
        ))}
      </ol>
      {!m && <p className="sl-serif" style={{ margin: '48px 0 0', fontSize: 22, lineHeight: 1.4, fontStyle: 'italic', color: 'var(--muted-dark)', maxWidth: 720 }}>Unlike most platforms that touch your content, this one was designed by someone who spent 13 years protecting client work inside a multinational. The paranoia is professional.</p>}
    </Container>
  </section>
)

/* =========================================================================
   Built
   ========================================================================= */

const WHATS_BUILT = ['Entry directions with win likelihood scores per show and category', 'ROI Index: return on entry investment per show and direction', 'AI co-writing across all entry fields, in your agency voice', 'Show-specific jury intelligence for 30+ international shows', 'Jury mode: scored like a judge, catches weaknesses before submission', 'Coach mode: untapped potential score and prioritized fix list', 'Press kit generation: LinkedIn, X, Instagram, press release, PDF', 'Score comparison and delta tracking across draft iterations', 'Agency profile uploaded once, applied to every output', 'Budget planner: model entry spend across your target calendar', 'Quick Evaluate: upload a finished entry, get a scored jury read in minutes','Video script generation, review, and category-specific guidance', 'Multi-season historical context in all direction generation', 'Deadline calendar with urgency alerts across all shows', 'Outcome tracking: shortlisted, finalist, medals']

const Built = ({ m }: { m: boolean }) => (
  <section id="built" style={{ background: 'var(--bone)', padding: m ? '72px 0' : '120px 0' }}>
    <Container m={m}>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 20 : 80, alignItems: 'end' }}>
        <div>
          <Eyebrow>What&apos;s built</Eyebrow>
          <h2 className="sl-serif" style={{ margin: '24px 0 0', fontSize: m ? 'clamp(28px, 8vw, 44px)' : 'clamp(36px, 4.4vw, 64px)', lineHeight: 1.05, letterSpacing: '-0.01em', fontWeight: 400 }}>
            It&apos;s live.{' '}<span style={{ fontStyle: 'italic', color: 'var(--gold-deep)' }}>You can use it today.</span>
          </h2>
        </div>
        {!m && <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 460 }}>Here&apos;s exactly what&apos;s built. No &quot;coming soon&quot; footnotes. No dashboard mockups standing in for features.</p>}
      </div>
      <ul style={{ marginTop: m ? 32 : 64, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', columnGap: 56, rowGap: 0, borderTop: '1px solid var(--rule)' }}>
        {WHATS_BUILT.map((line, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 24px', gap: 12, padding: '16px 0', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
            <span className="sl-mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: m ? 14 : 15, lineHeight: 1.4 }}>{line}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, background: 'var(--gold)' }}>
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5 L4 8 L9 2" stroke="var(--ink)" strokeWidth="1.6" fill="none" strokeLinecap="square" strokeLinejoin="miter" /></svg>
            </span>
          </li>
        ))}
      </ul>
    </Container>
  </section>
)

/* =========================================================================
   Pricing
   ========================================================================= */

const PLAN_FEATURES = ['Show-specific jury intelligence: judging philosophy, scoring emphasis, common entry mistakes', 'Entry directions with win likelihood scores', 'AI first drafts across every entry field', 'Jury mode + Coach mode evaluation', 'Video script generation and scoring', 'Press kit generation (LinkedIn, X, Instagram, PDF)', 'Agency profile applied to every output', 'ROI Index and budget planner', 'Outcome tracking across seasons', '30+ shows covered, including the major PR and comms programs', 'Up to 5 active projects, unlimited entries within each', 'One user seat']

const Pricing = ({ onCTA, m }: { onCTA: () => void; m: boolean }) => (
  <section id="pricing" style={{ background: 'var(--ink)', color: 'var(--bone)', padding: m ? '72px 0' : '120px 0' }}>
    <Container m={m}>
      <Eyebrow tone="light">Pricing</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: m ? 20 : 80, alignItems: 'end', marginTop: 24 }}>
        <h2 className="sl-serif" style={{ margin: 0, fontSize: m ? 'clamp(28px, 8vw, 44px)' : 'clamp(36px, 4.4vw, 64px)', lineHeight: 1.05, letterSpacing: '-0.01em', fontWeight: 400 }}>
          Built for organizations{' '}<span style={{ fontStyle: 'italic', color: 'var(--gold)' }}>serious about winning.</span>
        </h2>
      </div>
      <div style={{ marginTop: m ? 32 : 80, maxWidth: m ? '100%' : 480 }}>
        <div style={{ border: '1px solid var(--rule-dark)', background: 'oklch(0.21 0.045 158)', padding: m ? '28px 24px' : '40px 36px', position: 'relative' }}>
          <div className="sl-mono" style={{ position: 'absolute', top: -1, left: -1, background: 'var(--gold)', color: 'var(--ink)', padding: '5px 10px', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Agency</div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="sl-serif" style={{ fontSize: m ? 72 : 88, lineHeight: 0.95, letterSpacing: '-0.02em' }}>$299</span>
            <span className="sl-mono" style={{ fontSize: 11, color: 'var(--muted-dark)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>/ month</span>
          </div>
          <p style={{ margin: '16px 0 24px', fontSize: 15, lineHeight: 1.55, color: 'var(--muted-dark)' }}>For agencies running a full international season. Up to 5 projects, unlimited usage within each. One price, everything included.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {PLAN_FEATURES.map((f, j) => (
              <li key={j} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10, fontSize: 13, color: 'var(--bone)' }}>
                <span style={{ width: 8, height: 8, background: 'var(--gold)', marginTop: 4 }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 32 }}>
            <PrimaryCTA onClick={onCTA} m={m}>Start free trial</PrimaryCTA>
          </div>
        </div>
      </div>
      <div style={{ marginTop: m ? 24 : 32 }}>
        <p className="sl-mono" style={{ margin: 0, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-dark)' }}>7-day free trial · Card required · Cancel anytime</p>
      </div>
    </Container>
  </section>
)

/* =========================================================================
   Footer
   ========================================================================= */

const Footer = ({ onCTA, m }: { onCTA: () => void; m: boolean }) => (
  <section style={{ background: 'var(--green-deep)', color: 'var(--bone)', padding: m ? '72px 0 48px' : '120px 0 64px', overflow: 'hidden' }}>
    <Container m={m}>
      <Eyebrow tone="light">Final word</Eyebrow>
      <h2 className="sl-serif" style={{ margin: '28px 0 0', fontSize: m ? 'clamp(40px, 11vw, 72px)' : 'clamp(48px, 7vw, 112px)', lineHeight: 0.98, letterSpacing: '-0.02em', fontWeight: 400, maxWidth: 1100 }}>
        Your next entry deadline<br />
        <span style={{ fontStyle: 'italic', color: 'var(--gold)' }}>is closer than you think.</span>
      </h2>
      <div style={{ marginTop: m ? 40 : 56, display: 'flex', flexDirection: m ? 'column' : 'row', alignItems: m ? 'stretch' : 'center', gap: m ? 16 : 18 }}>
        <PrimaryCTA onClick={onCTA} m={m}>Start free trial · gotshortlisted.com</PrimaryCTA>
        <a href="mailto:ben@positionadvisory.com" className="sl-mono" style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-dark)', textDecoration: 'underline', textUnderlineOffset: 4, textAlign: m ? 'center' : undefined }}>
          Questions? ben@positionadvisory.com
        </a>
      </div>
      <div style={{ marginTop: m ? 56 : 120, paddingTop: 24, borderTop: '1px solid rgba(245,238,224,0.18)', display: 'flex', justifyContent: m ? 'center' : 'space-between', alignItems: 'center', gap: 24, fontSize: 11, flexDirection: m ? 'column' : 'row' }}>
        {!m && <span className="sl-mono" style={{ letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-dark)' }}>Shortlist · Asia</span>}
        <Logo size={20} />
        <span className="sl-mono" style={{ letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-dark)', textAlign: m ? 'center' : 'right' }}>
          gotshortlisted.com · Edition 01
          {' · '}
          <a href="/terms" style={{ color: 'var(--muted-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Terms</a>
          {' · '}
          <a href="/privacy" style={{ color: 'var(--muted-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</a>
        </span>
      </div>
    </Container>
  </section>
)

/* =========================================================================
   Page
   ========================================================================= */

export default function Page() {
  const router = useRouter()
  const authed = usePublicAuth()
  const m = useIsMobile()

  const handleCTA    = () => router.push(authed ? '/projects' : '/signup')
  const handleSignIn = () => router.push(authed ? '/projects' : '/login')

  return (
    <div style={{ fontFamily: '"Geist", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif', background: 'var(--bone)', color: 'var(--ink)', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' as const, lineHeight: 1.45 }}>
      <Nav onCTA={handleSignIn} m={m} />
      <Hero onCTA={handleCTA} m={m} />
      <Founder m={m} />
      <Problem m={m} />
      <HowItWorks m={m} />
      {/* <Testimonials /> — uncomment when real quotes confirmed */}
      <Privacy m={m} />
      <Built m={m} />
      <Pricing onCTA={handleCTA} m={m} />
      <Footer onCTA={handleCTA} m={m} />
    </div>
  )
}
