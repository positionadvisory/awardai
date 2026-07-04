'use client'

import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// PillarFactsValidator (AOY flow redesign, chunk 7, 2026-07-04)
// Sibling of AgencyFactsValidator (S73) for the People and Brand AOY pillars.
// A NEW component file (A-08: projects/[id]/page.tsx surfaces are never
// inline), deliberately NOT a modification of AgencyFactsValidator.tsx —
// that file stays byte-untouched so the working, shipped Agency path carries
// zero risk from this chunk.
//
// Reuses AgencyFactsValidator's mechanics (parse-only extract, point-by-point
// Item confirm-toggle, reviewed-set gate, editing-clears-confirmation) because
// those are pillar-agnostic. What differs is only: the field shape per pillar,
// the extract endpoint (extract-pillar-facts, pillar in the body), and the
// save endpoint (/api/pillar-facts, per-project only — NO propagation, unlike
// Agency's org-wide fan-out. See the write-pattern decision in
// aoy-pillar-facts-2026-07-04.sql).
//
// Props:
//   projectId   the current AOY project.
//   pillar      'people' | 'brand' — which facts shape to render.
//   getToken    returns the live Supabase session access token.
//   onSaved     optional callback, fired after a successful save.
// ─────────────────────────────────────────────────────────────────────────────

type PeopleFacts = {
  schema_version: number
  nominee: { full_name: string | null; current_title: string | null; years_in_industry: number | null; tenure_at_agency: string | null }
  career_highlights: { title: string; year: number | null; description: string | null }[]
  notable_campaigns: { name: string; brand: string | null; year: number | null; result: string | null }[]
  backing_agency: {
    name: string | null
    revenue: { amount: number | null; currency: string | null; period: string | null }
    headcount: { total: number | null; as_of: string | null }
  }
  notes: string | null
}

type BrandFacts = {
  schema_version: number
  brand: { name: string | null; category: string | null; market_position: string | null }
  performance_metrics: { metric: string; value: number | null; unit: string | null; period: string | null }[]
  notable_campaigns: { name: string; agency: string | null; year: number | null; result: string | null }[]
  endorsing_brand: { name: string | null; relationship: string | null; duration: string | null }
  notes: string | null
}

type Pillar = 'people' | 'brand'
type Facts = PeopleFacts | BrandFacts

type Props = {
  projectId: number
  pillar: Pillar
  getToken: () => Promise<string | null>
  onSaved?: () => void
}

const EMPTY_PEOPLE: PeopleFacts = {
  schema_version: 1,
  nominee: { full_name: null, current_title: null, years_in_industry: null, tenure_at_agency: null },
  career_highlights: [],
  notable_campaigns: [],
  backing_agency: { name: null, revenue: { amount: null, currency: null, period: null }, headcount: { total: null, as_of: null } },
  notes: null,
}

const EMPTY_BRAND: BrandFacts = {
  schema_version: 1,
  brand: { name: null, category: null, market_position: null },
  performance_metrics: [],
  notable_campaigns: [],
  endorsing_brand: { name: null, relationship: null, duration: null },
  notes: null,
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

const numStr = (n: number | null): string => (n === null || n === undefined ? '' : String(n))
const parseNum = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function PillarFactsValidator({ projectId, pillar, getToken, onSaved }: Props) {
  const empty = pillar === 'people' ? EMPTY_PEOPLE : EMPTY_BRAND
  const [facts, setFacts] = useState<Facts | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [extractText, setExtractText] = useState('')
  const [extractUrl, setExtractUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Required keys mirror AgencyFactsValidator's requiredKeys pattern: the
  // fixed top-level blocks plus one key per list row.
  const requiredKeys = (f: Facts): string[] => {
    if (pillar === 'people') {
      const pf = f as PeopleFacts
      const keys = ['nominee', 'backing_agency']
      pf.career_highlights.forEach((_, i) => keys.push(`highlight-${i}`))
      pf.notable_campaigns.forEach((_, i) => keys.push(`campaign-${i}`))
      return keys
    }
    const bf = f as BrandFacts
    const keys = ['brand', 'endorsing_brand']
    bf.performance_metrics.forEach((_, i) => keys.push(`metric-${i}`))
    bf.notable_campaigns.forEach((_, i) => keys.push(`campaign-${i}`))
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
    setDone(false)
  }
  const unreview = (key: string) => {
    setReviewed(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(Array.from(prev))
      next.delete(key)
      return next
    })
    setDone(false)
  }

  async function callExtract(payload: Record<string, unknown>) {
    setError(''); setDone(false); setExtracting(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-pillar-facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, pillar }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Extraction failed.'); return }
      setFacts({ ...empty, ...data.facts } as Facts)
      setReviewed(new Set())
    } catch {
      setError('Extraction failed. Try again or paste the details as text.')
    } finally {
      setExtracting(false)
    }
  }

  function startBlank() {
    setError(''); setDone(false)
    setFacts(JSON.parse(JSON.stringify(empty)))
    setReviewed(new Set())
  }

  async function save() {
    if (!facts || !allReviewed) return
    setError(''); setSaving(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/pillar-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId, pillar, facts }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not save the facts.'); return }
      setDone(true)
      onSaved?.()
    } catch {
      setError('Could not save the facts. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const setF = (mut: (f: Facts) => void) =>
    setFacts(prev => { if (!prev) return prev; const n: Facts = JSON.parse(JSON.stringify(prev)); mut(n); return n })

  const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors'
  const labelCls = 'text-xs text-gray-500 block mb-1'

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

  const pillarLabel = pillar === 'people' ? 'People' : 'Brand'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 gap-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{pillarLabel} facts (Agency of the Year)</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {pillar === 'people'
            ? 'Extract the nominee and backing agency details, then confirm every figure. Nothing is saved until you confirm each item: a wrong detail can disqualify an entry.'
            : 'Extract the brand performance and endorsing-brand details, then confirm every figure. Nothing is saved until you confirm each item: a wrong detail can disqualify an entry.'}
          {' '}These facts apply to this entry only, not shared across your account.
        </p>
      </div>

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
            <label className={labelCls}>Or paste bio / performance text</label>
            <textarea value={extractText} onChange={e => setExtractText(e.target.value)} rows={4} className={inputCls} placeholder={pillar === 'people' ? 'Paste nominee bio, career highlights, backing agency details…' : 'Paste brand performance, campaigns, endorsement details…'} />
            <button
              onClick={() => callExtract({ credentials_text: extractText })}
              disabled={extracting || extractText.trim().length < 80}
              className="mt-2 border border-green-700 text-green-800 hover:bg-green-50 disabled:opacity-40 text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Extract from text
            </button>
          </div>

          <div>
            <label className={labelCls}>Or a public URL (e.g. a bio / results page)</label>
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

      {facts && pillar === 'people' && (() => {
        const pf = facts as PeopleFacts
        const addHighlight = () => setF(f => { (f as PeopleFacts).career_highlights.push({ title: '', year: null, description: null }) })
        const removeHighlight = (i: number) => { setF(f => { (f as PeopleFacts).career_highlights.splice(i, 1) }); setReviewed(new Set()) }
        const addCampaign = () => setF(f => { (f as PeopleFacts).notable_campaigns.push({ name: '', brand: null, year: null, result: null }) })
        const removeCampaign = (i: number) => { setF(f => { (f as PeopleFacts).notable_campaigns.splice(i, 1) }); setReviewed(new Set()) }

        return (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-xs text-gray-500">Review every detail against your source and correct anything wrong. Editing a field clears its confirmation. Leave a field blank if not certain: better blank than wrong.</p>

            <Item k="nominee" title="Nominee">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Full name</label>
                  <input className={inputCls} value={pf.nominee.full_name ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).nominee.full_name = e.target.value || null }); unreview('nominee') }} /></div>
                <div><label className={labelCls}>Current title</label>
                  <input className={inputCls} value={pf.nominee.current_title ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).nominee.current_title = e.target.value || null }); unreview('nominee') }} /></div>
                <div><label className={labelCls}>Years in industry</label>
                  <input className={inputCls} value={numStr(pf.nominee.years_in_industry)} onChange={e => { setF(f => { (f as PeopleFacts).nominee.years_in_industry = parseNum(e.target.value) }); unreview('nominee') }} /></div>
                <div><label className={labelCls}>Tenure at agency</label>
                  <input className={inputCls} value={pf.nominee.tenure_at_agency ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).nominee.tenure_at_agency = e.target.value || null }); unreview('nominee') }} /></div>
              </div>
            </Item>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">Career highlights (up to 5)</p>
                <button onClick={addHighlight} disabled={pf.career_highlights.length >= 5} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add highlight</button>
              </div>
              {pf.career_highlights.map((h, i) => (
                <Item key={i} k={`highlight-${i}`} title={`Highlight ${i + 1}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>Title</label>
                      <input className={inputCls} value={h.title} onChange={e => { setF(f => { (f as PeopleFacts).career_highlights[i].title = e.target.value }); unreview(`highlight-${i}`) }} /></div>
                    <div><label className={labelCls}>Year</label>
                      <input className={inputCls} value={numStr(h.year)} onChange={e => { setF(f => { (f as PeopleFacts).career_highlights[i].year = parseNum(e.target.value) }); unreview(`highlight-${i}`) }} /></div>
                    <div className="col-span-2"><label className={labelCls}>Description</label>
                      <input className={inputCls} value={h.description ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).career_highlights[i].description = e.target.value || null }); unreview(`highlight-${i}`) }} /></div>
                  </div>
                  <button onClick={() => removeHighlight(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
                </Item>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">Notable campaigns (up to 5)</p>
                <button onClick={addCampaign} disabled={pf.notable_campaigns.length >= 5} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add campaign</button>
              </div>
              {pf.notable_campaigns.map((c, i) => (
                <Item key={i} k={`campaign-${i}`} title={`Campaign ${i + 1}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>Name</label>
                      <input className={inputCls} value={c.name} onChange={e => { setF(f => { (f as PeopleFacts).notable_campaigns[i].name = e.target.value }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Brand</label>
                      <input className={inputCls} value={c.brand ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).notable_campaigns[i].brand = e.target.value || null }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Year</label>
                      <input className={inputCls} value={numStr(c.year)} onChange={e => { setF(f => { (f as PeopleFacts).notable_campaigns[i].year = parseNum(e.target.value) }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Result</label>
                      <input className={inputCls} value={c.result ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).notable_campaigns[i].result = e.target.value || null }); unreview(`campaign-${i}`) }} /></div>
                  </div>
                  <button onClick={() => removeCampaign(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
                </Item>
              ))}
            </div>

            <Item k="backing_agency" title="Backing agency">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className={labelCls}>Agency name</label>
                  <input className={inputCls} value={pf.backing_agency.name ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).backing_agency.name = e.target.value || null }); unreview('backing_agency') }} /></div>
                <div><label className={labelCls}>Revenue</label>
                  <input className={inputCls} value={numStr(pf.backing_agency.revenue.amount)} onChange={e => { setF(f => { (f as PeopleFacts).backing_agency.revenue.amount = parseNum(e.target.value) }); unreview('backing_agency') }} /></div>
                <div><label className={labelCls}>Currency</label>
                  <input className={inputCls} value={pf.backing_agency.revenue.currency ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).backing_agency.revenue.currency = e.target.value || null }); unreview('backing_agency') }} /></div>
                <div><label className={labelCls}>Headcount</label>
                  <input className={inputCls} value={numStr(pf.backing_agency.headcount.total)} onChange={e => { setF(f => { (f as PeopleFacts).backing_agency.headcount.total = parseNum(e.target.value) }); unreview('backing_agency') }} /></div>
                <div><label className={labelCls}>As of</label>
                  <input className={inputCls} value={pf.backing_agency.headcount.as_of ?? ''} onChange={e => { setF(f => { (f as PeopleFacts).backing_agency.headcount.as_of = e.target.value || null }); unreview('backing_agency') }} /></div>
              </div>
            </Item>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea className={inputCls} rows={2} value={pf.notes ?? ''} onChange={e => setF(f => { (f as PeopleFacts).notes = e.target.value || null })} />
            </div>
          </div>
        )
      })()}

      {facts && pillar === 'brand' && (() => {
        const bf = facts as BrandFacts
        const addMetric = () => setF(f => { (f as BrandFacts).performance_metrics.push({ metric: '', value: null, unit: null, period: null }) })
        const removeMetric = (i: number) => { setF(f => { (f as BrandFacts).performance_metrics.splice(i, 1) }); setReviewed(new Set()) }
        const addCampaign = () => setF(f => { (f as BrandFacts).notable_campaigns.push({ name: '', agency: null, year: null, result: null }) })
        const removeCampaign = (i: number) => { setF(f => { (f as BrandFacts).notable_campaigns.splice(i, 1) }); setReviewed(new Set()) }

        return (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-xs text-gray-500">Review every detail against your source and correct anything wrong. Editing a field clears its confirmation. Leave a field blank if not certain: better blank than wrong.</p>

            <Item k="brand" title="Brand">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Brand name</label>
                  <input className={inputCls} value={bf.brand.name ?? ''} onChange={e => { setF(f => { (f as BrandFacts).brand.name = e.target.value || null }); unreview('brand') }} /></div>
                <div><label className={labelCls}>Category</label>
                  <input className={inputCls} value={bf.brand.category ?? ''} onChange={e => { setF(f => { (f as BrandFacts).brand.category = e.target.value || null }); unreview('brand') }} /></div>
                <div className="col-span-2"><label className={labelCls}>Market position</label>
                  <input className={inputCls} value={bf.brand.market_position ?? ''} onChange={e => { setF(f => { (f as BrandFacts).brand.market_position = e.target.value || null }); unreview('brand') }} /></div>
              </div>
            </Item>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">Performance metrics (up to 5)</p>
                <button onClick={addMetric} disabled={bf.performance_metrics.length >= 5} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add metric</button>
              </div>
              {bf.performance_metrics.map((m, i) => (
                <Item key={i} k={`metric-${i}`} title={`Metric ${i + 1}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2"><label className={labelCls}>Metric</label>
                      <input className={inputCls} value={m.metric} onChange={e => { setF(f => { (f as BrandFacts).performance_metrics[i].metric = e.target.value }); unreview(`metric-${i}`) }} /></div>
                    <div><label className={labelCls}>Value</label>
                      <input className={inputCls} value={numStr(m.value)} onChange={e => { setF(f => { (f as BrandFacts).performance_metrics[i].value = parseNum(e.target.value) }); unreview(`metric-${i}`) }} /></div>
                    <div><label className={labelCls}>Unit</label>
                      <input className={inputCls} value={m.unit ?? ''} onChange={e => { setF(f => { (f as BrandFacts).performance_metrics[i].unit = e.target.value || null }); unreview(`metric-${i}`) }} /></div>
                    <div><label className={labelCls}>Period</label>
                      <input className={inputCls} value={m.period ?? ''} onChange={e => { setF(f => { (f as BrandFacts).performance_metrics[i].period = e.target.value || null }); unreview(`metric-${i}`) }} /></div>
                  </div>
                  <button onClick={() => removeMetric(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
                </Item>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">Notable campaigns (up to 5)</p>
                <button onClick={addCampaign} disabled={bf.notable_campaigns.length >= 5} className="text-xs text-green-700 hover:text-green-800 disabled:opacity-40">+ Add campaign</button>
              </div>
              {bf.notable_campaigns.map((c, i) => (
                <Item key={i} k={`campaign-${i}`} title={`Campaign ${i + 1}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>Name</label>
                      <input className={inputCls} value={c.name} onChange={e => { setF(f => { (f as BrandFacts).notable_campaigns[i].name = e.target.value }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Agency</label>
                      <input className={inputCls} value={c.agency ?? ''} onChange={e => { setF(f => { (f as BrandFacts).notable_campaigns[i].agency = e.target.value || null }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Year</label>
                      <input className={inputCls} value={numStr(c.year)} onChange={e => { setF(f => { (f as BrandFacts).notable_campaigns[i].year = parseNum(e.target.value) }); unreview(`campaign-${i}`) }} /></div>
                    <div><label className={labelCls}>Result</label>
                      <input className={inputCls} value={c.result ?? ''} onChange={e => { setF(f => { (f as BrandFacts).notable_campaigns[i].result = e.target.value || null }); unreview(`campaign-${i}`) }} /></div>
                  </div>
                  <button onClick={() => removeCampaign(i)} className="mt-2 text-xs text-gray-400 hover:text-red-600">Remove</button>
                </Item>
              ))}
            </div>

            <Item k="endorsing_brand" title="Endorsing brand">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className={labelCls}>Endorsing brand name</label>
                  <input className={inputCls} value={bf.endorsing_brand.name ?? ''} onChange={e => { setF(f => { (f as BrandFacts).endorsing_brand.name = e.target.value || null }); unreview('endorsing_brand') }} /></div>
                <div><label className={labelCls}>Relationship</label>
                  <input className={inputCls} value={bf.endorsing_brand.relationship ?? ''} onChange={e => { setF(f => { (f as BrandFacts).endorsing_brand.relationship = e.target.value || null }); unreview('endorsing_brand') }} /></div>
                <div><label className={labelCls}>Duration</label>
                  <input className={inputCls} value={bf.endorsing_brand.duration ?? ''} onChange={e => { setF(f => { (f as BrandFacts).endorsing_brand.duration = e.target.value || null }); unreview('endorsing_brand') }} /></div>
              </div>
            </Item>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea className={inputCls} rows={2} value={bf.notes ?? ''} onChange={e => setF(f => { (f as BrandFacts).notes = e.target.value || null })} />
            </div>
          </div>
        )
      })()}

      {facts && (
        <div className="border-t border-gray-100 pt-3 grid grid-cols-1 gap-2">
          <p className="text-xs text-gray-500">
            {reviewedCount} of {totalCount} items confirmed.{!allReviewed ? ' Confirm every item to save.' : ' Ready to save.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!allReviewed || saving}
              className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded transition-colors"
            >
              {saving ? 'Saving…' : `Confirm all & save ${pillarLabel.toLowerCase()} facts`}
            </button>
            <button onClick={() => { setFacts(null); setReviewed(new Set()); setError(''); setDone(false) }} className="text-sm text-gray-500 hover:text-gray-900">
              Start over
            </button>
          </div>
          {done && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <p className="text-green-700 text-xs">Validated {pillarLabel.toLowerCase()} facts saved to this entry.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
