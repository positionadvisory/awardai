'use client'
// components/ShowCombobox.tsx — extracted from app/projects/[id]/page.tsx (S158)
// A typeahead show selector shared by the main workflow and the /start route.
import { useState, useRef, useEffect } from 'react'

export default function ShowCombobox({ value, onChange, options, placeholder }:
  { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const q = value.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options
  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-stretch gap-1">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-600 transition-colors"
        />
        <button
          type="button"
          aria-label="Toggle show list"
          onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 px-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
        >
          <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {filtered.map(o => (
            <li key={o}>
              <button
                type="button"
                onClick={() => { onChange(o); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-green-50 transition-colors ${o === value ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'}`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
