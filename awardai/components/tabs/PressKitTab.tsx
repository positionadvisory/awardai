'use client'
// components/tabs/PressKitTab.tsx — Press Kit tab, extracted from
// app/projects/[id]/page.tsx (R1, refactor-r1r2-tabs-2026-07-13).
//
// Render/structure-only move: the tab's local state, its press_kit_drafts
// mount fetch, the Phase 9 auto-restore effect, and all its handlers moved
// here verbatim. project / directions / entries / orgPressProfile / getToken
// / resolveFieldContent / getCurrentDraftFields stay lifted on the page and
// arrive as props (resolveFieldContent + getCurrentDraftFields are shared
// with the Entries tab, out of scope here). The pure HTML/PDF builders live
// in lib/press-kit.ts (moved there so they can run without a component
// closure); this file just calls them.
//
// Rendered unconditionally by the page (not gated on tab==='presskit') and
// hidden with CSS when another tab is active — same as before the
// extraction, where all this state lived on the page regardless of which
// tab was showing. Gating the mount would have meant losing the
// mount-time press_kit_drafts fetch (and any in-progress generated
// outputs) every time the user tabs away and back. `tab` is still passed
// in as a prop so the internal effect below can keep its original
// tab==='presskit' gate.
//
// press_kit_drafts write path (upsertPressKitDraft / selectPressKitVersion
// below) is moved completely UNMODIFIED — it writes via a direct
// supabase.from('press_kit_drafts') client call today, not a service-role
// API route. That's the code as found; this session does not change it.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  buildPressKitEmail as libBuildPressKitEmail,
  buildPressKitExtra as libBuildPressKitExtra,
  downloadPressKitPDF as libDownloadPressKitPDF,
  copyHtmlToClipboard,
} from '@/lib/press-kit'
import type {
  Tab, Project, Direction, EntryDraft, Collaborator, OrgPressProfile,
  PressKitExtra, PressKitDraftRow,
} from '@/app/projects/[id]/page'
import type { EngagementEventName, EngagementContext } from '@/lib/useEngagement'

interface PressKitTabProps {
  tab: Tab
  projectId: string | number
  project: Project | null
  directions: Direction[]
  entries: EntryDraft[]
  collaborators: Collaborator[]
  orgPressProfile: OrgPressProfile | null
  guidanceEnabled: boolean
  getToken: () => Promise<string | null>
  getCurrentDraftFields: (dirId: number) => EntryDraft[]
  resolveFieldContent: (d: EntryDraft) => string
  copyTextWithConfirm: (key: string, text: string, setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) => Promise<void>
  track: (event: EngagementEventName, context?: EngagementContext) => void
  onStartedChange: (started: boolean) => void
}

export default function PressKitTab({
  tab, projectId, project, directions, entries, collaborators, orgPressProfile,
  guidanceEnabled, getToken, getCurrentDraftFields, resolveFieldContent, copyTextWithConfirm, track,
  onStartedChange,
}: PressKitTabProps) {
  const router = useRouter()

  // Thin wrappers over the lib pure builders — keeps every call site below
  // (generatePressKits, downloadPressKitPDF's render call, etc.) an exact,
  // unmodified match for the pre-extraction code, which called these with
  // just a dirId.
  const buildPressKitEmail = (dirId: number): string =>
    libBuildPressKitEmail(dirId, directions, project, collaborators, orgPressProfile, getCurrentDraftFields, resolveFieldContent)
  const buildPressKitExtra = (dirId: number): PressKitExtra =>
    libBuildPressKitExtra(dirId, directions, project, orgPressProfile, getCurrentDraftFields, resolveFieldContent)
  const downloadPressKitPDF = (dirId: number): Promise<void> =>
    libDownloadPressKitPDF(dirId, directions, project, collaborators, orgPressProfile, getCurrentDraftFields, resolveFieldContent)

  // Press Kit
  const [selectedPressKitDirs, setSelectedPressKitDirs] = useState<Set<number>>(new Set())
  const [pressKitOutputs, setPressKitOutputs] = useState<Record<number, string>>({}) // dirId → email HTML
  const [pressKitExtras, setPressKitExtras] = useState<Record<number, PressKitExtra>>({}) // dirId → extra sections
  const [pressKitAiCopy, setPressKitAiCopy] = useState<Record<string, string>>({}) // key: `${dirId}-${field}` or `${dirId}-pressHook-${target}`
  const [pressKitDrafts, setPressKitDrafts] = useState<Record<string, PressKitDraftRow>>({}) // key: `${dirId}-${field_key}`
  const [pressKitAiLoading, setPressKitAiLoading] = useState<Record<string, boolean>>({})
  const [pressTargets, setPressTargets] = useState<Record<number, string[]>>({}) // dirId → selected press targets
  const [pressHookCopied, setPressHookCopied] = useState<Record<string, boolean>>({})
  const [pressKitCopied, setPressKitCopied] = useState<Record<number, boolean>>({})
  const [pressKitCopiedExtra, setPressKitCopiedExtra] = useState<Record<string, boolean>>({}) // key: `${dirId}-${field}`
  const [pressKitGenerating, setPressKitGenerating] = useState(false)

  // Fetch saved press kit drafts for this project on mount (moved verbatim
  // out of the page's shared mount-time fetch effect; unrelated to the
  // fetches that stayed there — same query, same non-critical error
  // handling, just its own effect now that pressKitDrafts lives here).
  useEffect(() => {
    let cancelled = false
    // Fetch saved press kit drafts for this project (non-critical)
    supabase
      .from('press_kit_drafts')
      .select('id, project_id, direction_id, field_key, field_label, version_a, version_b, version_c, selected, custom_text, press_target, model_used, updated_at')
      .eq('project_id', projectId)
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) {
          const map: Record<string, PressKitDraftRow> = {}
          for (const row of data) {
            map[`${row.direction_id}-${row.field_key}`] = row as PressKitDraftRow
          }
          setPressKitDrafts(map)
        }
      })
    return () => { cancelled = true }
  }, [projectId])

  // Auto-restore saved press kit drafts into pressKitAiCopy when there are saved drafts.
  // Runs whenever pressKitDrafts loads or tab changes to 'presskit'.
  useEffect(() => {
    if (tab !== 'presskit') return
    if (Object.keys(pressKitDrafts).length === 0) return
    setPressKitAiCopy(prev => {
      const next = { ...prev }
      for (const [storeKey, draft] of Object.entries(pressKitDrafts)) {
        // Only restore if not already showing something (don't clobber a new generation)
        if (next[storeKey]) continue
        const selected = draft.selected === 'b' ? draft.version_b
                       : draft.selected === 'c' ? draft.version_c
                       : draft.version_a
        if (selected) next[storeKey] = selected
      }
      return next
    })
    // Also restore selected press targets from saved press hook drafts
    setPressTargets(prev => {
      const next = { ...prev }
      for (const [, draft] of Object.entries(pressKitDrafts)) {
        if (draft.field_key.startsWith('pressHook-') && draft.press_target) {
          const dirId = draft.direction_id
          const current = next[dirId] ?? []
          if (!current.includes(draft.press_target)) {
            next[dirId] = [...current, draft.press_target]
          }
        }
      }
      return next
    })
  }, [tab, pressKitDrafts])

  // Report "has the user started a press kit" up to the page, which feeds
  // the shared progress spine (spinePressKitStarted used to be computed
  // directly from pressKitDrafts/pressKitOutputs on the page; both moved
  // here, so the page can no longer read them itself).
  useEffect(() => {
    onStartedChange(Object.keys(pressKitDrafts).length > 0 || Object.keys(pressKitOutputs).length > 0)
  }, [pressKitDrafts, pressKitOutputs, onStartedChange])

  // Copy plain text extra section to clipboard
  const copyPressKitExtra = async (dirId: number, field: keyof PressKitExtra) => {
    const text = pressKitExtras[dirId]?.[field]
    if (!text) return
    const key = `${dirId}-${field}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setPressKitCopiedExtra(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setPressKitCopiedExtra(prev => ({ ...prev, [key]: false })), 2500)
  }

  // Generate AI-drafted copy for one direction + field (social + quick summary)
  const generateAiPressCopy = async (dirId: number, field: 'linkedinPost' | 'xPost' | 'instagramCaption' | 'quickSummary') => {
    const formatMap: Record<string, string> = {
      linkedinPost: 'linkedin',
      xPost: 'x',
      instagramCaption: 'instagram',
      quickSummary: 'quicksummary',
    }
    const labelMap: Record<string, string> = {
      linkedinPost: 'LinkedIn Post',
      xPost: 'X / Twitter Post',
      instagramCaption: 'Instagram Caption',
      quickSummary: 'Quick Summary',
    }
    const key = `${dirId}-${field}`
    setPressKitAiLoading(prev => ({ ...prev, [key]: true }))
    try {
      // Session 47 audit fix S1: generate-press-copy now requires user auth —
      // send the session access token, not the anon key.
      const accessToken = await getToken()
      if (!accessToken) { window.location.href = '/login'; return }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-press-copy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ direction_id: dirId, format: formatMap[field], project_id: projectId }),
        }
      )
      const data = await res.json()
      if (data.copy) {
        setPressKitAiCopy(prev => ({ ...prev, [key]: data.copy }))
        // Persist to DB with version shifting
        await upsertPressKitDraft(dirId, field, labelMap[field], data.copy)
      }
    } catch (err) {
      console.error('AI press copy failed:', err)
    } finally {
      setPressKitAiLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  // Generate AI press hooks for all selected press targets for a direction
  const generateAiPressHooks = async (dirId: number) => {
    const targets = pressTargets[dirId] ?? []
    if (targets.length === 0) return
    await Promise.all(targets.map(async (target) => {
      const key = `${dirId}-pressHook-${target}`
      const fieldKey = `pressHook-${target}`
      setPressKitAiLoading(prev => ({ ...prev, [key]: true }))
      try {
        // Session 47 audit fix S1: generate-press-copy now requires user auth.
        const accessToken = await getToken()
        if (!accessToken) { window.location.href = '/login'; return }
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-press-copy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({ direction_id: dirId, format: 'presshook', press_target: target, project_id: projectId }),
          }
        )
        const data = await res.json()
        if (data.copy) {
          setPressKitAiCopy(prev => ({ ...prev, [key]: data.copy }))
          // Persist to DB with version shifting
          await upsertPressKitDraft(dirId, fieldKey, `Press Hook (${target})`, data.copy, target)
        }
      } catch (err) {
        console.error('AI press hook failed:', err)
      } finally {
        setPressKitAiLoading(prev => ({ ...prev, [key]: false }))
      }
    }))
  }

  // Upsert an AI-generated copy string into press_kit_drafts.
  // Shifts version_a → version_b → version_c on each new generation.
  const upsertPressKitDraft = async (
    dirId: number,
    fieldKey: string,
    fieldLabel: string,
    newText: string,
    pressTarget?: string,
  ) => {
    const storeKey = `${dirId}-${fieldKey}`
    const existing = pressKitDrafts[storeKey]

    // Compute new version columns by shifting
    let version_a = newText
    let version_b: string | null = null
    let version_c: string | null = null
    if (existing) {
      version_b = existing.version_a ?? null
      version_c = existing.version_b ?? null
      // existing version_c is dropped
    }

    const upsertData = {
      project_id: project?.id ?? null,
      direction_id: dirId,
      field_key: fieldKey,
      field_label: fieldLabel,
      version_a,
      version_b,
      version_c,
      selected: 'a' as const,
      press_target: pressTarget ?? null,
      model_used: 'claude-haiku-4-5-20251001',
    }

    const { data, error } = await supabase
      .from('press_kit_drafts')
      .upsert(upsertData, { onConflict: 'direction_id,field_key' })
      .select('id, project_id, direction_id, field_key, field_label, version_a, version_b, version_c, selected, custom_text, press_target, model_used, updated_at')
      .single()

    if (!error && data) {
      setPressKitDrafts(prev => ({ ...prev, [storeKey]: data as PressKitDraftRow }))
    }
  }

  // Select a specific saved version for a draft field and update pressKitAiCopy to display it.
  const selectPressKitVersion = async (dirId: number, fieldKey: string, version: 'a' | 'b' | 'c') => {
    const storeKey = `${dirId}-${fieldKey}`
    const draft = pressKitDrafts[storeKey]
    if (!draft) return

    const text = version === 'a' ? draft.version_a
                : version === 'b' ? draft.version_b
                : draft.version_c
    if (!text) return

    // Optimistic UI update
    setPressKitDrafts(prev => ({ ...prev, [storeKey]: { ...draft, selected: version } }))
    setPressKitAiCopy(prev => ({ ...prev, [storeKey]: text }))

    // Persist selection to DB
    await supabase
      .from('press_kit_drafts')
      .update({ selected: version })
      .eq('direction_id', dirId)
      .eq('field_key', fieldKey)
  }
  // Generate press kits for all selected directions
  const generatePressKits = () => {
    setPressKitGenerating(true)
    const outputs: Record<number, string> = {}
    const extras: Record<number, PressKitExtra> = {}
    for (const dirId of Array.from(selectedPressKitDirs)) {
      const html = buildPressKitEmail(dirId)
      if (html) outputs[dirId] = html
      extras[dirId] = buildPressKitExtra(dirId)
    }
    setPressKitOutputs(prev => ({ ...prev, ...outputs }))
    setPressKitExtras(prev => ({ ...prev, ...extras }))
    setPressKitGenerating(false)
    if (Object.keys(outputs).length > 0) {
      track('presskit_generated', { project_id: Number(projectId), direction_count: Object.keys(outputs).length })
    }
  }

  // Copy formatted HTML to clipboard so it pastes as rich text in Outlook.
  // Clipboard/DOM mechanics moved to lib/press-kit.ts (copyHtmlToClipboard);
  // this wrapper keeps the pressKitCopied confirmation-flag behavior exactly
  // as it was (same timeout, same silent-fail-does-nothing-visible outcome).
  const copyPressKitToClipboard = async (dirId: number) => {
    const html = pressKitOutputs[dirId]
    if (!html) return
    const ok = await copyHtmlToClipboard(html)
    if (ok) {
      setPressKitCopied(prev => ({ ...prev, [dirId]: true }))
      setTimeout(() => setPressKitCopied(prev => ({ ...prev, [dirId]: false })), 2500)
    }
  }

  return (
          <div className="max-w-2xl">

            {/* Nudge: no press contact configured */}
            {!orgPressProfile?.pr_contact_name && !orgPressProfile?.pr_contact_email && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                <span className="text-amber-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm text-amber-800 font-medium">Press contact not configured</p>
                  <p className="text-xs text-amber-700 mt-0.5">Add your press contact details and agency profile on the <button onClick={() => window.open('/projects', '_self')} className="underline">Projects page</button> to include them in generated press kits.</p>
                </div>
              </div>
            )}

            {/* Logo display / nudge */}
            {orgPressProfile && (
              <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white border border-gray-200 rounded-xl">
                {orgPressProfile.logo_url ? (
                  <>
                    <img
                      src={supabase.storage.from('org-logos').getPublicUrl(orgPressProfile.logo_url).data.publicUrl}
                      alt="Logo"
                      className="h-8 max-w-[100px] object-contain"
                    />
                    <p className="text-xs text-gray-400">Logo will appear in PDF press kits. <button onClick={() => router.push('/projects')} className="text-green-700 hover:text-green-600 underline">Manage on Profile page.</button></p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No logo uploaded. <button onClick={() => router.push('/projects')} className="text-green-700 hover:text-green-600 underline">Add a logo on the Profile page</button> to include it in PDF press kits.</p>
                )}
              </div>
            )}

            {/* Header + Select All */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Select Directions to Export</h2>
                <p className="text-xs text-gray-400 mt-0.5">One press kit per direction. Directions without an entry draft are unavailable.</p>
              </div>
              {directions.length > 0 && (
                <div className="flex gap-3 flex-shrink-0 ml-4">
                  <button
                    onClick={() => {
                      const eligibleIds = directions.filter(d => getCurrentDraftFields(d.id).length > 0).map(d => d.id)
                      setSelectedPressKitDirs(new Set(eligibleIds))
                    }}
                    className="text-xs text-green-700 hover:text-green-600 transition-colors"
                  >Select all</button>
                  <button
                    onClick={() => setSelectedPressKitDirs(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >Clear</button>
                </div>
              )}
            </div>

            {/* Direction list */}
            {directions.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                {/* Session 54 — guidance-flavored empty state (v3 brief §10) */}
                {guidanceEnabled && (
                  <p className="text-gray-700 text-sm mb-2">
                    One click after the entry. The press materials are often what travels farthest.
                  </p>
                )}
                <p className="text-sm text-gray-400">
                  No directions yet. Generate directions first, then create entry drafts before producing press kits.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {directions.map(d => {
                  const hasFields = getCurrentDraftFields(d.id).length > 0
                  const isSelected = selectedPressKitDirs.has(d.id)
                  const isGenerated = !!pressKitOutputs[d.id]
                  return (
                    <div
                      key={d.id}
                      className={`bg-white border rounded-xl px-4 py-3 transition-colors ${
                        isSelected ? 'border-green-400 bg-green-50/30' : 'border-gray-200'
                      } ${!hasFields ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!hasFields}
                          onChange={e => {
                            setSelectedPressKitDirs(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(d.id)
                              else next.delete(d.id)
                              return next
                            })
                          }}
                          className="w-4 h-4 accent-green-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {d.best_show && d.best_category ? `${d.best_show} — ${d.best_category}` : d.name}
                          </p>
                          {d.hook && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate italic">{d.hook}</p>
                          )}
                          {!hasFields && (
                            <p className="text-xs text-amber-600 mt-0.5">No entry draft — generate one first</p>
                          )}
                          {hasFields && (
                            <p className="text-xs text-gray-400 mt-0.5">{getCurrentDraftFields(d.id).length} fields ready</p>
                          )}
                        </div>
                        {isGenerated && (
                          <span className="text-xs text-green-700 font-medium flex-shrink-0">✓ Ready</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Generate button */}
            {directions.length > 0 && (
              <button
                onClick={generatePressKits}
                disabled={selectedPressKitDirs.size === 0 || pressKitGenerating}
                className="w-full bg-green-800 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded transition-colors mb-8"
              >
                {pressKitGenerating
                  ? 'Generating…'
                  : selectedPressKitDirs.size === 0
                  ? 'Select at least one direction'
                  : `Generate ${selectedPressKitDirs.size} Press Kit${selectedPressKitDirs.size > 1 ? 's' : ''}`}
              </button>
            )}

            {/* Generated outputs */}
            {Object.keys(pressKitOutputs).length > 0 && (
              <div className="space-y-6">
                <h2 className="text-sm font-semibold text-gray-800">Generated Press Kits</h2>
                {directions
                  .filter(d => pressKitOutputs[d.id])
                  .map(d => {
                    const extra = pressKitExtras[d.id]
                    const dirLabel = d.best_show && d.best_category ? `${d.best_show} — ${d.best_category}` : d.name

                    // Press target options for press hook AI generation
                    const PRESS_TARGET_OPTIONS = ['Local', 'Regional', 'Global', 'Trade / Industry', 'Consumer', 'Broadcast']
                    const dirPressTargets = pressTargets[d.id] ?? []
                    const anyPressHookLoading = PRESS_TARGET_OPTIONS.some(t => pressKitAiLoading[`${d.id}-pressHook-${t}`])

                    // Helper to render a plain-text copyable section (with optional AI generation)
                    const aiFields = new Set<keyof PressKitExtra>(['quickSummary', 'linkedinPost', 'xPost', 'instagramCaption'])
                    const ExtraSection = ({ label, field, value, hint }: { label: string; field: keyof PressKitExtra; value: string; hint?: string }) => {
                      const key = `${d.id}-${field}`
                      const copied = pressKitCopiedExtra[key]
                      const aiText = pressKitAiCopy[key]
                      const aiLoading = pressKitAiLoading[key]
                      const displayText = aiText || value
                      const canAI = aiFields.has(field)
                      const draft = pressKitDrafts[key]
                      const hasVersionB = !!(draft?.version_b)
                      const hasVersionC = !!(draft?.version_c)
                      const selectedVersion = draft?.selected ?? 'a'
                      return (
                        <div className="border-t border-gray-100 px-4 py-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div>
                              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</p>
                              {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {canAI && (
                                <button
                                  onClick={() => generateAiPressCopy(d.id, field as 'linkedinPost' | 'xPost' | 'instagramCaption' | 'quickSummary')}
                                  disabled={aiLoading}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                    aiLoading ? 'bg-gray-100 text-gray-400' : 'bg-green-50 hover:bg-green-100 text-green-800 border border-green-200'
                                  }`}
                                >
                                  {aiLoading ? '…' : aiText ? '✦ Regenerate' : '✦ AI Draft'}
                                </button>
                              )}
                              <button
                                onClick={() => copyPressKitExtra(d.id, field)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                  copied ? 'bg-green-100 text-green-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                              >
                                {copied ? '✓ Copied!' : '📋 Copy'}
                              </button>
                            </div>
                          </div>
                          {/* Version pills — shown when more than one AI generation exists */}
                          {draft && (hasVersionB || hasVersionC) && (
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-xs text-gray-400 mr-0.5">Version:</span>
                              {(['a', 'b', 'c'] as const).filter(v => v === 'a' || (v === 'b' && hasVersionB) || (v === 'c' && hasVersionC)).map(v => (
                                <button
                                  key={v}
                                  onClick={() => selectPressKitVersion(d.id, field, v)}
                                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                    selectedVersion === v
                                      ? 'bg-green-700 text-white border-green-700'
                                      : 'bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-700'
                                  }`}
                                >
                                  {v === 'a' ? 'Latest' : v === 'b' ? 'Previous' : 'Older'}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${aiText ? 'text-gray-800' : 'text-gray-500'}`}>{displayText}</p>
                          {aiText && <p className="text-xs text-green-700 mt-1.5 font-medium">✦ AI draft — edit before posting</p>}
                        </div>
                      )
                    }

                    return (
                      <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

                        {/* Card header */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{dirLabel}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{d.name}</p>
                          </div>
                        </div>

                        {/* ── Outlook Email ── */}
                        <div className="border-t border-gray-100 px-4 py-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Outlook Email</p>
                              <p className="text-xs text-gray-400 mt-0.5">Formatted press email — paste directly into Outlook</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => downloadPressKitPDF(d.id)}
                                className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                ⬇ PDF
                              </button>
                              <button
                                onClick={() => copyPressKitToClipboard(d.id)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                  pressKitCopied[d.id]
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-green-800 hover:bg-green-700 text-white'
                                }`}
                              >
                                {pressKitCopied[d.id] ? '✓ Copied!' : '📋 Copy for Outlook'}
                              </button>
                            </div>
                          </div>
                          <div
                            className="text-xs text-gray-600 leading-relaxed overflow-hidden bg-gray-50 rounded-lg px-3 py-2"
                            style={{ maxHeight: '100px', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' }}
                            dangerouslySetInnerHTML={{ __html: pressKitOutputs[d.id] }}
                          />
                        </div>

                        {/* ── Extra sections ── */}
                        {extra && (
                          <>
                            {extra.quickSummary && (
                              <ExtraSection
                                label="Quick Summary"
                                field="quickSummary"
                                value={extra.quickSummary}
                                hint="2–3 sentences for email intros or press release openers"
                              />
                            )}
                            {/* ── Press Hook — multi-target AI ── */}
                            {extra.pressHook && (
                              <div className="border-t border-gray-100 px-4 py-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div>
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Press Hook</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Select target press types, then generate a tailored hook for each</p>
                                  </div>
                                  <button
                                    onClick={() => generateAiPressHooks(d.id)}
                                    disabled={dirPressTargets.length === 0 || anyPressHookLoading}
                                    className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                                      dirPressTargets.length === 0 || anyPressHookLoading
                                        ? 'bg-gray-50 text-gray-300 border-gray-200'
                                        : 'bg-green-50 hover:bg-green-100 text-green-800 border-green-200'
                                    }`}
                                  >
                                    {anyPressHookLoading ? '…' : '✦ AI Draft'}
                                  </button>
                                </div>

                                {/* Press target checkboxes */}
                                <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
                                  {PRESS_TARGET_OPTIONS.map(target => (
                                    <label key={target} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={dirPressTargets.includes(target)}
                                        onChange={e => {
                                          setPressTargets(prev => {
                                            const current = prev[d.id] ?? []
                                            return {
                                              ...prev,
                                              [d.id]: e.target.checked
                                                ? [...current, target]
                                                : current.filter(t => t !== target),
                                            }
                                          })
                                        }}
                                        className="rounded accent-green-700"
                                      />
                                      <span className="text-gray-600">{target}</span>
                                    </label>
                                  ))}
                                </div>

                                {/* Template hook (shown when no AI copies exist) */}
                                {!dirPressTargets.some(t => pressKitAiCopy[`${d.id}-pressHook-${t}`]) && (
                                  <p className="text-xs text-gray-400 leading-relaxed italic">{extra.pressHook}</p>
                                )}

                                {/* AI hooks — one per selected target */}
                                {dirPressTargets.length > 0 && (
                                  <div className="space-y-2 mt-2">
                                    {dirPressTargets.map(target => {
                                      const hookKey = `${d.id}-pressHook-${target}`
                                      const fieldKey = `pressHook-${target}`
                                      const aiHook = pressKitAiCopy[hookKey]
                                      const hookLoading = pressKitAiLoading[hookKey]
                                      const hookCopied = pressHookCopied[hookKey]
                                      const hookDraft = pressKitDrafts[`${d.id}-${fieldKey}`]
                                      const hookHasB = !!(hookDraft?.version_b)
                                      const hookHasC = !!(hookDraft?.version_c)
                                      const hookSelected = hookDraft?.selected ?? 'a'
                                      if (!aiHook && !hookLoading) return null
                                      return (
                                        <div key={target} className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                                          <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <p className="text-xs font-semibold text-green-800">{target} Press</p>
                                            {aiHook && (
                                              <button
                                                onClick={() => copyTextWithConfirm(hookKey, aiHook, setPressHookCopied)}
                                                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                                                  hookCopied ? 'bg-green-200 text-green-900' : 'bg-white hover:bg-green-100 text-green-800 border border-green-200'
                                                }`}
                                              >
                                                {hookCopied ? '✓ Copied!' : '📋 Copy'}
                                              </button>
                                            )}
                                          </div>
                                          {/* Version pills for press hooks */}
                                          {hookDraft && (hookHasB || hookHasC) && (
                                            <div className="flex items-center gap-1.5 mb-2">
                                              <span className="text-xs text-green-700 opacity-70 mr-0.5">Version:</span>
                                              {(['a', 'b', 'c'] as const).filter(v => v === 'a' || (v === 'b' && hookHasB) || (v === 'c' && hookHasC)).map(v => (
                                                <button
                                                  key={v}
                                                  onClick={() => selectPressKitVersion(d.id, fieldKey, v)}
                                                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                                    hookSelected === v
                                                      ? 'bg-green-700 text-white border-green-700'
                                                      : 'bg-white text-green-700 border-green-200 hover:bg-green-100'
                                                  }`}
                                                >
                                                  {v === 'a' ? 'Latest' : v === 'b' ? 'Previous' : 'Older'}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          {hookLoading
                                            ? <p className="text-xs text-gray-400 italic">Generating…</p>
                                            : <p className="text-xs text-gray-800 leading-relaxed">{aiHook}</p>
                                          }
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {extra.linkedinPost && (
                              <ExtraSection
                                label="LinkedIn Post"
                                field="linkedinPost"
                                value={extra.linkedinPost}
                                hint="Professional announcement — edit before posting"
                              />
                            )}
                            {extra.xPost && (
                              <ExtraSection
                                label="X / Twitter Post"
                                field="xPost"
                                value={extra.xPost}
                                hint={`${extra.xPost.length} / 280 characters`}
                              />
                            )}
                            {extra.instagramCaption && (
                              <ExtraSection
                                label="Instagram Caption"
                                field="instagramCaption"
                                value={extra.instagramCaption}
                                hint="Edit hashtags and emoji to suit your brand voice"
                              />
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Usage note */}
            <div className="mt-8 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-700">How to use Copy for Outlook:</strong> Click the button, then open a new email in Outlook and paste (Cmd/Ctrl+V). The formatted content will paste with styling intact. The grey placeholder sections show you where to add your personal introduction and sign-off before sending. All other sections copy as plain text.
              </p>
            </div>

          </div>
  )
}
