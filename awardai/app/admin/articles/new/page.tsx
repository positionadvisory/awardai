'use client'
// app/admin/articles/new/page.tsx
// Admin article posting form — gated to ben@positionadvisory.com
// Uses supabase auth check + ADMIN_SECRET env var for API auth

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'ben@positionadvisory.com'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

export default function AdminArticlesNewPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [content, setContent] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [publishNow, setPublishNow] = useState(true)

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null)
  const [preview, setPreview] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email
      if (email === ADMIN_EMAIL) {
        setAuthorized(true)
      } else {
        router.replace('/login')
      }
      setChecking(false)
    })
  }, [router])

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(title))
    }
  }, [title, slugManual])

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [content])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.NEXT_PUBLIC_ADMIN_SECRET, // set in .env.local — NEXT_PUBLIC_ so it's available on client
          slug,
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          content: content.trim(),
          cover_image_url: coverUrl.trim() || undefined,
          published: publishNow,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setResult({ success: false, error: data.error || 'Failed to save article' })
      } else {
        setResult({ success: true, url: data.url })
        // Don't reset form so user can tweak and re-save
      }
    } catch (err) {
      setResult({ success: false, error: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  function insertMarkdown(before: string, after = '') {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end)
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end)
    setContent(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + selected.length)
    }, 0)
  }

  if (checking) {
    return (
      <div style={{ background: '#0b1120', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#475569', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>Checking access…</p>
      </div>
    )
  }

  if (!authorized) return null

  const s = { fontFamily: 'Inter, system-ui, sans-serif' }
  const readMins = estimateReadingTime(content)

  return (
    <div style={{ background: '#0b1120', minHeight: '100vh', color: '#f1f5f9', ...s }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '1rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '11px' }}>S</span>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}>Shortlist</span>
          </Link>
          <span style={{ color: '#334155' }}>›</span>
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>New article</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              onClick={() => setPreview(!preview)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                color: '#94a3b8', padding: '0.4rem 0.875rem', borderRadius: '7px',
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
            <Link href="/articles" style={{ color: '#475569', fontSize: '13px', textDecoration: 'none' }}>View articles</Link>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} style={{ flex: '1 1 580px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Title */}
            <div>
              <label style={{ color: '#64748b', fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                Title <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="The entry nobody reads twice"
                required
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.75rem 1rem', color: '#f1f5f9', fontSize: '1.125rem',
                  fontWeight: 600, fontFamily: 'inherit', outline: 'none',
                  letterSpacing: '-0.01em',
                }}
              />
            </div>

            {/* Subtitle */}
            <div>
              <label style={{ color: '#64748b', fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                Subtitle / deck line <span style={{ color: '#475569' }}>(optional)</span>
              </label>
              <input
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="A short line shown in the article list and on social previews"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.75rem 1rem', color: '#f1f5f9', fontSize: '14px',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            {/* Slug */}
            <div>
              <label style={{ color: '#64748b', fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                URL slug
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                <span style={{ color: '#475569', fontSize: '13px', padding: '0.75rem 0.875rem', borderRight: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>
                  /articles/
                </span>
                <input
                  value={slug}
                  onChange={e => { setSlug(e.target.value); setSlugManual(true) }}
                  style={{
                    flex: 1, background: 'none', border: 'none', padding: '0.75rem 1rem',
                    color: '#22c55e', fontSize: '13px', fontFamily: 'monospace', outline: 'none',
                  }}
                />
              </div>
              {!slugManual && title && (
                <p style={{ color: '#334155', fontSize: '11px', marginTop: '0.375rem' }}>Auto-generated from title. Click to edit.</p>
              )}
            </div>

            {/* Content toolbar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ color: '#64748b', fontSize: '12px', fontWeight: 500 }}>
                  Content (Markdown) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <span style={{ color: '#334155', fontSize: '11px' }}>
                  ~{readMins} min read · {content.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              </div>

              {/* Markdown shortcuts */}
              <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'H2', action: () => insertMarkdown('\n## ', '\n') },
                  { label: 'H3', action: () => insertMarkdown('\n### ', '\n') },
                  { label: 'B', action: () => insertMarkdown('**', '**'), bold: true },
                  { label: 'I', action: () => insertMarkdown('*', '*'), italic: true },
                  { label: '¶', action: () => insertMarkdown('\n\n', '') },
                ].map(btn => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={btn.action}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#94a3b8', padding: '0.25rem 0.625rem', borderRadius: '6px',
                      fontSize: '12px', fontWeight: btn.bold ? 700 : btn.italic ? 400 : 500,
                      fontStyle: btn.italic ? 'italic' : 'normal',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={`Write your article here in Markdown.\n\nUse ## for section headings, **bold** for emphasis.\n\nParagraphs are separated by a blank line.`}
                required
                style={{
                  width: '100%', minHeight: '400px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                  padding: '1rem', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.75',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  outline: 'none', resize: 'vertical',
                }}
              />
            </div>

            {/* Cover image URL */}
            <div>
              <label style={{ color: '#64748b', fontSize: '12px', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                Cover image URL <span style={{ color: '#475569' }}>(optional — paste a public image URL)</span>
              </label>
              <input
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
                placeholder="https://…"
                type="url"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.75rem 1rem', color: '#f1f5f9', fontSize: '13px',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            {/* Publish toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setPublishNow(!publishNow)}
                style={{
                  width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                  background: publishNow ? '#16a34a' : '#1e293b',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: '2px', left: publishNow ? '20px' : '2px',
                  width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s',
                }} />
              </button>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                {publishNow ? 'Publish immediately (live on save)' : 'Save as draft (not yet public)'}
              </span>
            </div>

            {/* Result banner */}
            {result && (
              <div style={{
                padding: '1rem 1.25rem', borderRadius: '10px',
                background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.success ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
                {result.success ? (
                  <div>
                    <p style={{ color: '#22c55e', fontSize: '14px', fontWeight: 500, margin: '0 0 0.375rem' }}>
                      Article saved successfully.
                    </p>
                    {result.url && (
                      <a href={result.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#22c55e', fontSize: '13px', textDecoration: 'underline', textDecorationColor: 'rgba(34,197,94,0.4)' }}>
                        {result.url} →
                      </a>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#f87171', fontSize: '14px', margin: 0 }}>
                    Error: {result.error}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              style={{
                background: submitting ? '#166534' : '#16a34a',
                color: 'white', padding: '0.875rem 2rem', borderRadius: '10px',
                fontSize: '15px', fontWeight: 600, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: (!title.trim() || !content.trim()) ? 0.5 : 1,
                transition: 'background 0.15s',
              }}
            >
              {submitting ? 'Saving…' : publishNow ? 'Publish article' : 'Save draft'}
            </button>
          </form>

          {/* ── Sidebar ── */}
          <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Tips */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px', padding: '1.25rem',
            }}>
              <p style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.875rem' }}>Tips</p>
              <ul style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.7, margin: 0, paddingLeft: '1.125rem' }}>
                <li style={{ marginBottom: '0.5rem' }}>Start with the most important sentence</li>
                <li style={{ marginBottom: '0.5rem' }}>Use ## headings to break up long sections</li>
                <li style={{ marginBottom: '0.5rem' }}>Subtitle appears in article list + social previews</li>
                <li style={{ marginBottom: '0.5rem' }}>Cover image: 1200×630px works best for OG</li>
                <li>Save as draft first, preview at /articles/[slug] (you'll need to toggle published=true temporarily)</li>
              </ul>
            </div>

            {/* Checklist */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px', padding: '1.25rem',
            }}>
              <p style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.875rem' }}>Before publishing</p>
              {[
                { label: 'Title written', done: title.trim().length > 0 },
                { label: 'Subtitle/deck written', done: subtitle.trim().length > 0 },
                { label: 'Slug looks clean', done: slug.length > 3 },
                { label: 'Content written', done: content.trim().length > 200 },
                { label: '3+ min read', done: readMins >= 3 },
                { label: 'Cover image added', done: coverUrl.trim().length > 0 },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: item.done ? '#22c55e' : '#334155', fontSize: '14px', flexShrink: 0 }}>
                    {item.done ? '✓' : '○'}
                  </span>
                  <span style={{ color: item.done ? '#94a3b8' : '#475569', fontSize: '13px' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
