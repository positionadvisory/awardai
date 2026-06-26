'use client'

import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// AgencyFactsValidator (AOY Phase 2, Session 73)
// Extract -> point-by-point VALIDATE -> propagate. The extract step (the
// extract-agency-facts edge function) is parse-only and writes nothing; the user
// must confirm EVERY figure before the validated record is persisted and
// propagated org-wide via /api/agency-facts. Wrong data = disqualification, so the
// "Confirm all & propagate" action is gated until every item is reviewed, and
// editing any field clears that item's confirmation (forcing a re-review).
//
// Props:
//   projectId   the current AOY project the facts are validated against.
//   getToken    returns the live Supabase session access token (NOT the anon key).
//   onPropagated optional callback with { version, propagated_count }.
// ─────────────────────────────────────────────────────────────────────────────

type Win = { client: string; value: number | null; currency: string | null; period: string | null }
type Retention = { client: string; tenure: string | null }
type Award = { show: string; category: string | null; result: string | null; year: number | null }
type AgencyFacts = {
  schema_version: number
  revenue: { amount: number | null; currency: string | null; period: string | null; yoy_pct: number | null }
  headcount: { total: number | null; as_of: string | null }
  ownership: { independent_pct: number | null; structure: string | null }
  new_business_wins: Win[]
  client_retention: Retention[]
  awards: Award[]
  notes: string | null
}

type Props = {
  projectId: number
  getToken: () => Promise<string | null>
  onPropagated?: (result: { version: number; propagated_count: number }) => void
}

const EMPTY: AgencyFacts = {
  schema_version: 1,
  revenue: { amount: null, currency: null, period: null, yoy_pct: null },
  headcount: { total: null, as_of: null },
  ownership: { independent_pct: null, structure: null },
  new_business_wins: [],
  client_retention: [],
  awards: [],
  notes: null,
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

// number|null binding helpers (inputs hold strings; empty -> null)
const numStr = (n: number | null): string => (n === null || n === undefined ? '' : String(n))
const parseNum = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function AgencyFactsValidator({ projectId, getToken, onPropagated }: Props) {
  const [facts, setFacts] = useState<AgencyFacts | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [extractText, setExtractText] = useState('')
  const [extractUrl, setExtractUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [propagating, setPropagating] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ version: number; propagated_count: number } | null>(null)

  // Keys that must be confirmed before propagation is allowed.
  const requiredKeys = (f: AgencyFacts): string[] => {
    const keys = ['revenue', 'headcount', 'ownership']
    f.new_business_wins.forEach((_, i) => keys.push(`win-${i}`))
    f.client_retention.forEach((_, i) => keys.push(`ret-${i}`))
    f.awards.forEach((_, i) => keys.push(`award-${i}`))
    return keys
  }
  const allReviewed = !!facts && requiredKeys(facts).every(k => reviewed.has(k))
  const reviewedCount = reviewed.size
  const totalCount = facts ? requiredKeys(facts).length : 0

  const toggleReviewed = (key: string) => {
    setReviewed(prev => {
      const next = new Set(Array.from(prev))
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    setDone(null)
  }
  // Editing a field invalidates that item's confirmation.
  const unreview = (key: string) => {
    setReviewed(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(Array.from(prev))
      next.delete(key)
      return next
    })
    setDone(null)
  }

  async function callExtract(payload: Record<string, unknown>) {
    setError(''); setDone(null); setExtracting(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-agency-facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Extraction failed.'); return }
      setFacts({ ...EMPTY, ...data.facts })
      setReviewed(new Set()) // nothing confirmed yet
    } catch {
      setError('Extraction failed. Try again or paste the figures as text.')
    } finally {
      setExtracting(false)
    }
  }

  function startBlank() {
    setError(''); setDone(null)
    setFacts(JSON.parse(JSON.stringify(EMPTY)))
    setReviewed(new Set())
  }

  async function propagate() {
    if (!facts || !allReviewed) return
    setError(''); setPropagating(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/agency-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId, facts }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not save the facts.'); return }
      const result = { version: data.version, propagated_count: data.propagated_count }
      setDone(result)
      onPropagated?.(result)
    } catch {
      setError('Could not save the facts. Try again.')
    } finally {
      setPropagating(false)
    }
  }

  // ── field mutators ──────────────────────────────────────────────────────────
  const setF = (mut: (f: AgencyFacts) => void) =>
    setFacts(prev => { if (!prev) return prev; const n: AgencyFacts = JSON.parse(JSON.stringify(prev)); mut(n); return n })

  const addWin = () => setF(f => { f.new_business_wins.push({ client: '', value: null, currency: null, period: null }) })
  const removeWin = (i: number) => { setF(f => { f.new_business_wins.splice(i, 1) }); setReviewed(new Set()) }
  const addRet = () => setF(f => { f.client_retention.push({ client: '', tenure: null }) })
  const removeRet = (i: number) => { setF(f => { f.client_retention.splice(i, 1) }); setReviewed(new Set()) }
  const addAward = () => setF(f => { f.awards.push({ show: '', category: null, result: null, year: null }) })
  const removeAward = (i: number) => { setF(f => { f.awards.splice(i, 1) }); setReviewed(new Set()) }

  const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors'
  const labelCls = 'text-xs text-gray-500 block mb-1'

  // ── Item wrapper with confirm toggle ─────────────────────────────────────────
  function Item({ k, title, children }: { k: string; title: string; children: React.ReactNode }) {
    const isReviewed = reviewed.has(k)
    return (
      <div className={`rounded-lg border p-3 ${isReviewed ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-700">{title}</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={isReviewed} onChange={() => toggleReviewed(k)} className="accent-green-700" />
            <span className={`text-xs ${isReviewed ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
              {isReviewed ? 'Confirmed' : 'Confirm'}
            </span>
          </label>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 gap-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Agency facts (Agency of the Year)</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Extract the agency's numbers, then confirm every figure. Nothing is saved or applied to your entries until you confirm each item: these are CFO-certified and a wrong number can disqualify an entry. Once confirmed, the validated facts apply to every Agency of the Year entry in your account.
        </p>
      </div>

      {/* ── Extract sources ── */}
      {!facts && (
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => callExtract({ project_id: projectId })}
            disabled={extracting}
            className="bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded transition-colors"
          >
            {extracting ? 'Extracting…' : 'Extract from this entry’s materials'}
          </button>

          <div>
            <label className={labelCls}>Or paste credentials / financials text</label>
            <textarea value={extractText} onChange={e => setExtractText(e.target.value)} rows={4} className={inputCls} placeholder="Paste revenue, wins, retention, headcount, ownership…" />
            <button
              onClick={() => callExtract({ credentials_text: extractText })}
              disabled={extracting || extractText.trim().length < 80}
              className="mt-2 border border-green-700 text-green-800 hover:bg-green-50 disabled:opacity-40 text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Extract from text
            </button>
          </div>

          <div>
            <label className={labelCls}>Or a public URL (e.g. an about / results page)</label>
            <input value={extractUrl} onChange={e => setExtractUrl(e.target.value)} className={inputCls} placeholder="https://…" />
            <button
              onClick={() => callExtract({ url: extractUrl })}
              disabled={extracting || !extractUrl.trim()}
              className="mt-2 border border-green-700 text-green-800 hover:bg-green-50 disabled:opacity-40 text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Extract from URL
            </button>
          </div>

          <button onClick={startBlank} className="text-xs text-gray-500 hover:text-gray-900 underline self-start">
            Or enter the facts manually
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-red-600 text-xs">{error}</p>
        </div>
      )}

      {/* ── Editable + point-by-point review ── */}
      {facts && (
        <div className="grid grid-cols-1 gap-3">
          <p className="text-xs text-gray-500">
            Review every figure against your source and correct anything wrong. Editing a field clears its confirmation. Leave a field blank if the number is not certain: better blank than wrong.
          </p>

          {/* Revenue */}
          <Item k="revenue" title="Revenue">
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Amount</label>
                <input className={inputCls} value={numStr(facts.revenue.amount)} onChange={e => { setF(f => { f.revenue.amount = parseNum(e.target.value) }); unreview('revenue') }} /></div>
              <div><label className={labelCls}>Currency</label>
                <input className={inputCls} value={facts.revenue.currency ?? ''} onChange={e => { setF(f => { f.revenue.currency = e.target.value || null }); unreview('revenue') }} /></div>
              <div><label className={labelCls}>Period</label>
                <input className={inputCls} value={facts.revenue.period ?? ''} onChange={e => { setF(f => { f.revenue.period = e.target.value || null }); unreview('revenue') }} /></div>
              <div><label className={labelCls}>YoY %</label>
                <input className={inputCls} value={numStr(facts.revenue.yoy_pct)} onChange={e => { setF(f => { f.revenue.yoy_pct = parseNum(e.target.value) }); unreview('revenue') }} /></div>
            </div>
          </Item>

          {/* Headcount */}
          <Item k="headcount" title="Headcount">
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Total staff</label>
                <input className={inputCls} value={numStr(facts.headcount.total)} onChange={e => { setF(f => { f.headcount.total = parseNum(e.target.value) }); unreview('headcount') }} /></div>
              <div><label className={labelCls}>As of</label>
                <input className={inputCls} value={facts.headcount.as_of ?? ''} onChange={e => { setF(f => { f.headcount.as_of = e.target.value || null }); unreview('headcount') }} /></div>
            </div>
          </Item>

          {/* Ownership */}
          <Item k="ownership" title="Ownership (for the market point system)">
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Independent %</label>
                <input className={inputCls} value={numStr(facts.ownership.independent_pct)} onChange={e => { setF(f => { f.ownership.independent_pct = parseNum(e.target.value) }); unreview('ownership') }} /></div>
              <div><label className={labelCls}>Structure</label>
                <input className={inputCls} value={facts.ownership.structure ?? ''} onChange={e => { setF(f => { f.ownership.structure = e.target.value || null }); unreview('ownership') }} /></div>
            </div>
          </Item>

          {/* New business wins */}
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Top new-business wins (up to 5)</p>
              <button onClick={addWin} disabled={facts.new_business_wins.length >= 5} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add win</button>
            </div>
            {facts.new_business_wins.map((w, i) => (
              <Item key={i} k={`win-${i}`} title={`Win ${i + 1}`}>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Client</label>
                    <input className={inputCls} value={w.client} onChange={e => { setF(f => { f.new_business_wins[i].client = e.target.value }); unreview(`win-${i}`) }} /></div>
                  <div><label className={labelCls}>Value</label>
                    <input className={inputCls} value={numStr(w.value)} onChange={e => { setF(f => { f.new_business_wins[i].value = parseNum(e.target.value) }); unreview(`win-${i}`) }} /></div>
                  <div><label className={labelCls}>Currency</label>
                    <input className={inputCls} value={w.currency ?? ''} onChange={e => { setF(f => { f.new_business_wins[i].currency = e.target.value || null }); unreview(`win-${i}`) }} /></div>
                  <div><label className={labelCls}>Period</label>
                    <input className={inputCls} value={w.period ?? ''} onChange={e => { setF(f => { f.new_business_wins[i].period = e.target.value || null }); unreview(`win-${i}`) }} /></div>
                </div>
                <button onClick={() => removeWin(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
              </Item>
            ))}
          </div>

          {/* Client retention */}
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Client retention (up to 10)</p>
              <button onClick={addRet} disabled={facts.client_retention.length >= 10} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add client</button>
            </div>
            {facts.client_retention.map((c, i) => (
              <Item key={i} k={`ret-${i}`} title={`Client ${i + 1}`}>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Client</label>
                    <input className={inputCls} value={c.client} onChange={e => { setF(f => { f.client_retention[i].client = e.target.value }); unreview(`ret-${i}`) }} /></div>
                  <div><label className={labelCls}>Tenure</label>
                    <input className={inputCls} value={c.tenure ?? ''} onChange={e => { setF(f => { f.client_retention[i].tenure = e.target.value || null }); unreview(`ret-${i}`) }} /></div>
                </div>
                <button onClick={() => removeRet(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
              </Item>
            ))}
          </div>

          {/* Awards */}
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Awards</p>
              <button onClick={addAward} className="text-xs text-green-700 hover:text-green-800">+ Add award</button>
            </div>
            {facts.awards.map((a, i) => (
              <Item key={i} k={`award-${i}`} title={`Award ${i + 1}`}>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Show</label>
                    <input className={inputCls} value={a.show} onChange={e => { setF(f => { f.awards[i].show = e.target.value }); unreview(`award-${i}`) }} /></div>
                  <div><label className={labelCls}>Category</label>
                    <input className={inputCls} value={a.category ?? ''} onChange={e => { setF(f => { f.awards[i].category = e.target.value || null }); unreview(`award-${i}`) }} /></div>
                  <div><label className={labelCls}>Result</label>
                    <input className={inputCls} value={a.result ?? ''} onChange={e => { setF(f => { f.awards[i].result = e.target.value || null }); unreview(`award-${i}`) }} /></div>
                  <div><label className={labelCls}>Year</label>
                    <input className={inputCls} value={numStr(a.year)} onChange={e => { setF(f => { f.awards[i].year = parseNum(e.target.value) }); unreview(`award-${i}`) }} /></div>
                </div>
                <button onClick={() => removeAward(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
              </Item>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea className={inputCls} rows={2} value={facts.notes ?? ''} onChange={e => setF(f => { f.notes = e.target.value || null })} />
          </div>

          {/* Propagate */}
          <div className="border-t border-gray-100 pt-3 grid grid-cols-1 gap-2">
            <p className="text-xs text-gray-500">
              {reviewedCount} of {totalCount} items confirmed.{!allReviewed ? ' Confirm every item to apply.' : ' Ready to apply.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={propagate}
                disabled={!allReviewed || propagating}
                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors"
              >
                {propagating ? 'Applying…' : 'Confirm all & apply to my Agency of the Year entries'}
              </button>
              <button onClick={() => { setFacts(null); setReviewed(new Set()); setError(''); setDone(null) }} className="text-sm text-gray-500 hover:text-gray-900">
                Start over
              </button>
            </div>
            {done && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <p className="text-green-700 text-xs">
                  Validated facts (v{done.version}) applied to {done.propagated_count} Agency of the Year {done.propagated_count === 1 ? 'entry' : 'entries'}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
