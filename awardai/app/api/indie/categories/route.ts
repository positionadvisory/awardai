// Deploy to: app/api/indie/categories/route.ts
//
// GET /api/indie/categories -- the launch category config for the picker.
//
// WHY THIS ROUTE EXISTS AT ALL. The T7b prompt says "Category config from T5 2e
// filtered to the 13", which would put a second copy of every criterion label
// and word limit into the frontend. This codebase already carries four
// disagreeing representations of "which shows do we cover" (union 59 names,
// intersection 11) and the whole entry_form design exists so a show's shape is
// DATA on show_profiles rather than code. A hardcoded picker would be the ninth
// representation, and the first one to drift would be the one on the page an
// entrant reads.
//
// So the picker reads the same rows the jury scores against. If the seed changes,
// the page changes, with no deploy and no chance of the two disagreeing.
//
// NULL WORD LIMITS ARE RETURNED AS NULL AND THE CATEGORY IS FLAGGED.
// lifestyle-b2c-pr box 1 has no limit recorded, because T4 never read it off the
// live form and T5 is explicit that guessing it is not allowed. `launch_ready`
// is false while any box limit is null, so the picker can hide that one category
// rather than render "null words" or quietly substitute 150.

import { NextResponse } from 'next/server'
import { indieAdmin, INDIE_SHOW_NAME } from '@/lib/indie-read-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SpecSection = {
  key: string
  label: string
  word_limit: number | null
  weight: number | null
  sort_order: number
  guidance: string
}

export async function GET() {
  try {
    const admin = indieAdmin()
    const { data, error } = await admin
      .from('show_profiles')
      .select('category_pattern, entry_form')
      .eq('show_name', INDIE_SHOW_NAME)
      .not('category_pattern', 'is', null)

    if (error) {
      console.error('[indie/categories] lookup error:', error)
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
    }

    const categories = (data ?? []).map(row => {
      const spec = (row.entry_form ?? {}) as { slug?: string; sections?: SpecSection[] }
      const all = Array.isArray(spec.sections) ? [...spec.sections] : []
      all.sort((a, b) => a.sort_order - b.sort_order)
      const scored = all.filter(s => s.weight !== null && s.weight !== undefined)
      const background = all.find(s => s.weight === null || s.weight === undefined) ?? null
      return {
        slug: spec.slug ?? null,
        display: row.category_pattern as string,
        // Weight is NOT here. No weight renders on any entrant-facing surface:
        // T5 settled that, which is also what disposes of the RE-BRAND 95%
        // problem without printing it or silently correcting it.
        boxes: scored.map(s => ({
          key: s.key,
          label: s.label,
          word_limit: s.word_limit,
          guidance: s.guidance,
        })),
        background: background
          ? { key: background.key, label: background.label, word_limit: background.word_limit }
          : null,
        launch_ready: scored.length === 4 && scored.every(s => typeof s.word_limit === 'number'),
      }
    })
    .filter(c => c.slug !== null)
    .sort((a, b) => a.display.localeCompare(b.display))

    return NextResponse.json({
      show: INDIE_SHOW_NAME,
      count: categories.length,
      launch_ready_count: categories.filter(c => c.launch_ready).length,
      categories,
    }, { status: 200 })

  } catch (err) {
    console.error('[indie/categories] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
