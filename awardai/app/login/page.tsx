'use client'

import { useState, useRef, useEffect } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const AWARD_SHOWS = [
  { value: '', label: 'General (any show)' },
  { value: 'cannes-lions', label: 'Cannes Lions' },
  { value: 'dandad', label: 'D&AD' },
  { value: 'effies', label: 'Effies' },
  { value: 'clio', label: 'Clio Awards' },
  { value: 'one-show', label: 'The One Show' },
  { value: 'spikes-asia', label: 'Spikes Asia' },
  { value: 'eurobest', label: 'Eurobest' },
]

export default function Home() {
  const [campaignName, setCampaignName] = useState('')
  const [what, setWhat] = useState('')
  const [insight, setInsight] = useState('')
  const [results, setResults] = useState('')
  const [awardShow, setAwardShow] = useState('')
  const [awardCategory, setAwardCategory] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current && loading) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, loading])

  const handleGenerate = async () => {
    if (!what.trim()) return

    setLoading(true)
    setOutput('')

    const showLabel = AWARD_SHOWS.find(s => s.value === awardShow)?.label ?? 'a major award show'

    const userMessage = `Write a compelling award entry for the following campaign. Make it specific, punchy and tailored for ${showLabel}${awardCategory ? `, specifically the "${awardCategory}" category` : ''}.

Campaign name: ${campaignName || 'Untitled'}
What the campaign did: ${what}
${insight ? `Core insight: ${insight}` : ''}
${results ? `Results & impact: ${results}` : ''}
Award show: ${showLabel}
${awardCategory ? `Category: ${awardCategory}` : ''}

Structure the entry with: a compelling opening, the insight, the idea & execution, and results. Keep it under 500 words.`

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brief: what,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text()
        setOutput(`Error: ${res.status} — ${errText}`)
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (
              parsed.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta' &&
              parsed.delta?.text
            ) {
              fullText += parsed.delta.text
              setOutput(fullText)
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      setOutput('Something went wrong. Please check your connection and try again.')
    }

    setLoading(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-green-800 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">AwardAI</h1>
            <p className="text-xs text-gray-400">Powered by 684 award-winning campaigns</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left — Inputs */}
        <div className="space-y-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Campaign</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Campaign name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Share a Coke"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              What did the campaign do? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={what}
              onChange={e => setWhat(e.target.value)}
              rows={4}
              placeholder="Describe the campaign idea and execution in plain language. Don't worry about making it sound polished yet."
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Core insight <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={insight}
              onChange={e => setInsight(e.target.value)}
              rows={2}
              placeholder="What human truth or market tension did this tap into?"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Results &amp; impact <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={results}
              onChange={e => setResults(e.target.value)}
              rows={2}
              placeholder="Sales lift, reach, media value, cultural impact, awards won..."
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Award show</label>
              <select
                value={awardShow}
                onChange={e => setAwardShow(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors"
              >
                {AWARD_SHOWS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <input
                type="text"
                value={awardCategory}
                onChange={e => setAwardCategory(e.target.value)}
                placeholder="e.g. Brand Experience"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !what.trim()}
            className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Generating…' : 'Generate Entry'}
          </button>
        </div>

        {/* Right — Output */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Generated Entry</h2>
            {output && !loading && (
              <button
                onClick={handleCopy}
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-300 rounded-lg px-3 py-1.5"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>

          <div
            ref={outputRef}
            className="flex-1 min-h-96 bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed overflow-y-auto"
          >
            {output ? (
              <>
                {output}
                {loading && (
                  <span className="inline-block w-0.5 h-4 bg-gray-800 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </>
            ) : (
              <span className="text-gray-400 text-sm">
                {loading
                  ? 'Writing your entry…'
                  : 'Fill in your campaign details and click Generate Entry.'}
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
