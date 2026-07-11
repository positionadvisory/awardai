// components/ConfigEntryCanvas.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Entry Form v2 — the TRUTHFUL typed canvas (Chunk v2.2, 1 Jul 2026).
//
// Renders a show's real entry form from its seeded entry_form spec: labelled
// sub-parts, one-sentence fields, currency / percent budgets, a repeatable
// Objectives list, typed metric tables with a required per-row source, a
// Results-from-Objectives cross-reference, and an optional ROI ratio. This is
// what WPP Media Vietnam pastes into the real MMA SMARTIES kit.
//
// PIPELINE (spec §6): the jury still scores the four top-level SECTIONS. The
// typed sub-fields COMPOSE into one section text (composeSectionText, defined
// once in lib/entry-form.ts) written to entry_drafts.version_a / custom_text,
// the rows the jury reads today. So the calibrated jury is untouched: this
// component only writes the structured field_values + the composed custom_text.
//
// SOURCE OF TRUTH: the typed sub-fields. Editing a sub-field recomposes the
// section text on Save, so the jury scores what the entrant actually typed.
//
// DECISIONS (§10, confirmed 1 Jul):
//   - derived_list reconciles by STABLE per-item id (reconcileDerivedList): a
//     wording edit keeps the linked result, reorder follows, delete drops the
//     row (with a confirm if it held a written result), add appends an empty
//     required row. Never index or text.
//   - word limits are a SOFT warn + live count (red over limit, never blocks).
//
// Only v2 config directions render here; AOY / v1 / craft keep the flat box.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  composeSectionText,
  normalizeSection,
  reconcileDerivedList,
  orphanedDerivedResults,
  countWords,
  sectionWordCount,
  isScoredSection,
  type EntryFormSpec,
  type EntryFormSection,
  type EntryFormField,
  type EntryFieldValues,
  type EntryListItem,
  type EntryDerivedRow,
  type EntryTableRow,
} from '@/lib/entry-form'
import SectionChat, { type ChatTurn } from '@/components/SectionChat'

// Workbench-for-SMARTIES wave 1 (S151). A revision entry for the TYPED canvas.
// Unlike the AOY SectionRevision (free text only), this ALSO snapshots
// field_values, because field_values are this canvas's source of truth: Restore
// must bring back the typed inputs, not just the composed text (option iii,
// build plan 2026-07-11). Stored in the same untyped entry_drafts.revisions
// jsonb; a config row is never also an AOY row, so the two shapes never collide.
// This does NOT touch the AOY SectionRevision parity type (SectionWorkbench.tsx
// / edit-entry.ts) — it is a separate, config-only shape.
export type ConfigSectionRevision = {
  ts: string
  source: 'manual' | 'restore'
  text: string
  field_values: EntryFieldValues
}

// Minimal shape of an entry_drafts row this canvas needs (matches the page's
// EntryDraft). One row per spec section; field_key === section.key.
export interface ConfigCanvasRow {
  id: number
  field_key: string
  field_label: string
  section_weight?: number | null
  version_a: string | null
  custom_text: string | null
  field_values?: EntryFieldValues | null
  // Wave 1 (S151): chat thread + linear history for this section, per row.
  chat_history?: ChatTurn[] | null
  revisions?: ConfigSectionRevision[] | null
}

// Wave 1 (S151): the mapped per-section jury read (score + rationale), keyed by
// section key. Sourced client-side from the existing evaluation.output.sections
// (S98 config jury), so this is a remap, not new plumbing, and touches no scorer.
export type SectionJuryRead = { score: number | null; rationale: string | null }

interface ConfigEntryCanvasProps {
  spec: EntryFormSpec
  rows: ConfigCanvasRow[]
  scoringMode: 'weighted' | 'qualitative'
  /** Persist one section: writes field_values + the composed custom_text.
   * Returns an error string on failure, else void. */
  onSaveSection: (
    rowId: number,
    fieldValues: EntryFieldValues,
    composedText: string
  ) => Promise<string | void>
  // ── Wave 1 (S151) Workbench features. All optional: absent => the canvas
  // renders exactly as before (used by any config show without an evaluation
  // or before the page wires these). ──
  /** The direction id, for chat calls. */
  dirId?: number
  /** Per-section jury read, keyed by section.key. */
  juryBySection?: Record<string, SectionJuryRead>
  /** Discuss-only chat for one section (writes chat_history only). */
  onSendChat?: (rowId: number, message: string) => Promise<void>
  /** Row id whose chat call is currently in flight. */
  chatBusyRowId?: number | null
  /** Per-row chat error text. */
  chatErrors?: Record<number, string>
  /** Restore a revision. The parent does the DB write and returns the restored
   * field_values + composed text so this component re-seeds its own edit boxes
   * for that section (the row-signature re-seed alone would not, since
   * field_values presence is unchanged). Returns null on failure. */
  onRestoreRevision?: (
    rowId: number,
    revisionIndex: number
  ) => Promise<{ fieldValues: EntryFieldValues; composedText: string } | null>
}

// Stable id for a new list item (see the §10 decision). Short + collision-safe
// within one form.
function newItemId(): string {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

// Deep-ish clone of a section's values so local edits never mutate props.
function cloneValues(v: EntryFieldValues | null | undefined): EntryFieldValues {
  if (!v) return {}
  try {
    return JSON.parse(JSON.stringify(v)) as EntryFieldValues
  } catch {
    return { ...v }
  }
}

// Initialize a section's working values: existing field_values win; otherwise
// empty per type. Never auto-imports legacy flat prose (shown as a note instead).
function initSectionValues(section: EntryFormSection, row?: ConfigCanvasRow): EntryFieldValues {
  const base = cloneValues(row?.field_values)
  const norm = normalizeSection(section)
  norm.fields.forEach((f) => {
    if (base[f.key] !== undefined) return
    if (f.type === 'list') base[f.key] = [] as EntryListItem[]
    else if (f.type === 'table') base[f.key] = [] as EntryTableRow[]
    else if (f.type === 'derived_list') base[f.key] = [] as EntryDerivedRow[]
    else base[f.key] = ''
  })
  if (!base.sources) base.sources = {}
  return base
}

// Wave 1 (S151): score pill classes, mirrored from SectionWorkbench so the
// jury-read chip reads identically across AOY and the typed canvas.
function juryScoreClasses(score?: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-500 ring-gray-200'
  if (score >= 7) return 'bg-green-100 text-green-800 ring-green-200'
  if (score >= 5) return 'bg-amber-100 text-amber-800 ring-amber-200'
  return 'bg-red-100 text-red-700 ring-red-200'
}
const REVISION_SOURCE_ICON: Record<ConfigSectionRevision['source'], string> = {
  manual: '✍', restore: '↩',
}
function revShortTs(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export default function ConfigEntryCanvas({
  spec, rows, scoringMode, onSaveSection,
  dirId, juryBySection, onSendChat, chatBusyRowId, chatErrors, onRestoreRevision,
}: ConfigEntryCanvasProps) {
  const sections = useMemo(
    () => (spec.sections ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [spec]
  )

  const rowBySection = useMemo(() => {
    const m: Record<string, ConfigCanvasRow> = {}
    rows.forEach((r) => { m[r.field_key] = r })
    return m
  }, [rows])

  // One working values object per section key. Seeded once from the rows.
  const [draft, setDraft] = useState<Record<string, EntryFieldValues>>(() => {
    const init: Record<string, EntryFieldValues> = {}
    sections.forEach((s) => { init[s.key] = initSectionValues(s, rowBySection[s.key]) })
    return init
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<{ key: string; msg: string } | null>(null)
  // Wave 1 (S151): which sections have their History list expanded, and which
  // section is mid-restore.
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})
  const [restoringKey, setRestoringKey] = useState<string | null>(null)

  // Re-seed the working values when the underlying rows change identity — a new
  // draft generation (new row ids) or field_values arriving from a load. Without
  // this the lazy useState initializer runs only at mount, so a freshly generated
  // draft's field_values never populate the boxes (React keeps the same instance).
  // Signature includes whether each row has field_values, so a null->present
  // transition re-seeds too. A user's own save keeps the same ids + presence, so
  // it does NOT trigger a re-seed and never clobbers saved/typed work.
  const rowsSignature = rows.map((r) => `${r.id}:${r.field_values ? 1 : 0}`).join('|')
  const sigRef = useRef(rowsSignature)
  useEffect(() => {
    if (sigRef.current === rowsSignature) return
    sigRef.current = rowsSignature
    const next: Record<string, EntryFieldValues> = {}
    sections.forEach((s) => { next[s.key] = initSectionValues(s, rowBySection[s.key]) })
    setDraft(next)
    setSavedKey(null)
    setErrorKey(null)
  }, [rowsSignature, sections, rowBySection])

  const setSectionValues = (sectionKey: string, next: EntryFieldValues) => {
    setDraft((prev) => ({ ...prev, [sectionKey]: next }))
    setSavedKey(null)
  }

  const setFieldValue = (sectionKey: string, fieldKey: string, value: EntryFieldValues[string]) => {
    const cur = draft[sectionKey] ?? {}
    setSectionValues(sectionKey, { ...cur, [fieldKey]: value })
  }

  const setSource = (sectionKey: string, fieldKey: string, value: string) => {
    const cur = draft[sectionKey] ?? {}
    const sources = { ...(cur.sources ?? {}) }
    sources[fieldKey] = value
    setSectionValues(sectionKey, { ...cur, sources })
  }

  // Live objectives for a derived_list's source_ref, from current draft state
  // (so a Strategy edit reflects in Business Impact before either is saved).
  const liveObjectives = (ref?: { section_key: string; field_key: string }): EntryListItem[] => {
    if (!ref) return []
    const sv = draft[ref.section_key]
    const list = sv ? sv[ref.field_key] : undefined
    return Array.isArray(list) ? (list as EntryListItem[]) : []
  }

  const saveSection = async (section: EntryFormSection) => {
    const row = rowBySection[section.key]
    if (!row) {
      setErrorKey({ key: section.key, msg: 'No draft row for this section yet. Generate a draft first.' })
      return
    }
    const values = draft[section.key] ?? {}
    // Reconcile any derived_list against live objectives before composing/saving.
    const norm = normalizeSection(section)
    const reconciled: EntryFieldValues = { ...values }
    norm.fields.forEach((f) => {
      if (f.type === 'derived_list') {
        reconciled[f.key] = reconcileDerivedList(
          Array.isArray(values[f.key]) ? (values[f.key] as EntryDerivedRow[]) : [],
          liveObjectives(f.source_ref)
        )
      }
    })
    const composed = composeSectionText(section, reconciled)
    setSavingKey(section.key)
    setErrorKey(null)
    const err = await onSaveSection(row.id, reconciled, composed)
    setSavingKey(null)
    if (typeof err === 'string' && err) {
      setErrorKey({ key: section.key, msg: err })
    } else {
      setDraft((prev) => ({ ...prev, [section.key]: reconciled }))
      setSavedKey(section.key)
    }
  }

  // Wave 1 (S151): Restore a revision. The parent writes field_values +
  // custom_text back and appends a 'restore' revision; here we re-seed this
  // section's edit boxes from the returned field_values (the row-signature
  // re-seed would not fire, since field_values presence is unchanged).
  const restoreSection = async (section: EntryFormSection, revisionIndex: number) => {
    if (!onRestoreRevision) return
    const row = rowBySection[section.key]
    if (!row) return
    setRestoringKey(section.key)
    setErrorKey(null)
    const result = await onRestoreRevision(row.id, revisionIndex)
    setRestoringKey(null)
    if (result) {
      setDraft((prev) => ({ ...prev, [section.key]: cloneValues(result.fieldValues) }))
      setSavedKey(null)
    }
  }

  return (
    <div className="divide-y divide-gray-100">
      {sections.map((section) => {
        const norm = normalizeSection(section)
        const values = draft[section.key] ?? {}
        const row = rowBySection[section.key]
        const scored = isScoredSection(section)
        const ceiling = section.word_ceiling ?? null
        const usedWords = sectionWordCount(section, values)
        const overCeiling = !!(ceiling && usedWords > ceiling)
        const isSaving = savingKey === section.key
        const isSaved = savedKey === section.key
        const secErr = errorKey && errorKey.key === section.key ? errorKey.msg : null
        // Legacy note: a v2 section whose row predates the structured form.
        const legacyProse =
          row && !row.field_values && (row.custom_text?.trim() || row.version_a?.trim())
            ? (row.custom_text?.trim() || row.version_a?.trim() || '')
            : ''
        // Wave 1 (S151) per-section Workbench data.
        const jury = juryBySection?.[section.key]
        const revisions = (row?.revisions ?? []) as ConfigSectionRevision[]
        const thread = (row?.chat_history ?? []) as ChatTurn[]
        const historyIsOpen = historyOpen[section.key] ?? false
        const isRestoring = restoringKey === section.key

        return (
          <div key={section.key} className="px-5 py-5">
            {/* Section header */}
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{section.label}</p>
                {scoringMode === 'weighted' && typeof section.weight === 'number' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-medium tabular-nums">
                    {section.weight}% of score
                  </span>
                )}
                {!scored && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 font-medium">
                    required, not scored
                  </span>
                )}
              </div>
              {ceiling && (
                <span className={`text-xs tabular-nums ${overCeiling ? 'text-red-600' : 'text-gray-400'}`}>
                  {usedWords} / {ceiling}w total
                </span>
              )}
            </div>

            {(section.instructions || section.guidance) && (
              <p className="text-xs text-gray-400 leading-relaxed mb-4">{section.instructions || section.guidance}</p>
            )}

            {legacyProse && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-700 mb-1">This draft predates the structured form.</p>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{legacyProse}</p>
                <p className="text-xs text-amber-700 mt-1">Fill the fields below, or regenerate the draft to structure it.</p>
              </div>
            )}

            {/* Jury read (S151) — the section's current jury score + rationale,
                remapped from the existing config evaluation. Read-only; never a
                write surface. Hidden until an evaluation exists for the section. */}
            {jury && jury.score != null && (
              <div className="mb-4 rounded-lg border-l-2 border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Jury read</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${juryScoreClasses(jury.score)}`}>
                    {jury.score}/10
                  </span>
                </div>
                {jury.rationale && (
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{jury.rationale}</p>
                )}
              </div>
            )}

            {/* Typed fields */}
            <div className="space-y-4">
              {norm.fields.map((field) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  sectionKey={section.key}
                  values={values}
                  objectives={field.type === 'derived_list' ? liveObjectives(field.source_ref) : []}
                  onFieldChange={(v) => setFieldValue(section.key, field.key, v)}
                  onSourceChange={(v) => setSource(section.key, field.key, v)}
                  onRemoveObjective={(removedId) => {
                    // §10: confirm before dropping a result written against a
                    // to-be-removed objective (scan every derived_list that
                    // references THIS list field).
                    const remaining = (Array.isArray(values[field.key]) ? (values[field.key] as EntryListItem[]) : [])
                      .filter((it) => it.id !== removedId)
                    const dependents = sections.flatMap((s) =>
                      normalizeSection(s).fields
                        .filter((f) => f.type === 'derived_list' && f.source_ref?.section_key === section.key && f.source_ref?.field_key === field.key)
                        .map((f) => ({ sectionKey: s.key, fieldKey: f.key }))
                    )
                    const wouldOrphan = dependents.some((dep) => {
                      const rowsForDep = Array.isArray(draft[dep.sectionKey]?.[dep.fieldKey])
                        ? (draft[dep.sectionKey]![dep.fieldKey] as EntryDerivedRow[])
                        : []
                      return orphanedDerivedResults(rowsForDep, remaining).length > 0
                    })
                    if (wouldOrphan && typeof window !== 'undefined') {
                      const ok = window.confirm('A result has been written for this objective. Removing the objective will delete that result. Remove anyway?')
                      if (!ok) return
                    }
                    setFieldValue(section.key, field.key, remaining)
                  }}
                />
              ))}
            </div>

            {/* Section-level optional source (after the metric tables) */}
            {section.source?.enabled && (
              <div className="mt-3">
                <label className="block text-xs text-gray-400 mb-1">Source (if any)</label>
                <input
                  value={typeof values.section_source === 'string' ? values.section_source : ''}
                  onChange={(e) => setSectionValues(section.key, { ...values, section_source: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600"
                  placeholder="e.g. Nielsen, Kantar, internal analytics"
                />
              </div>
            )}

            {/* Save */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => saveSection(section)}
                disabled={isSaving || !row}
                className="bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded transition-colors"
              >
                {isSaving ? 'Saving…' : 'Save section'}
              </button>
              {isSaved && <span className="text-xs text-green-700">✓ Saved</span>}
              {!row && <span className="text-xs text-gray-400">Generate a draft to enable saving.</span>}
              {secErr && <span className="text-xs text-red-600">{secErr}</span>}
            </div>

            {/* Linear history (S151). Each Save snapshots field_values + composed
                text; Restore brings both back. Never deletes history: a restore
                appends its own entry, so the timeline shows what happened. */}
            {onRestoreRevision && revisions.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => ({ ...v, [section.key]: !historyIsOpen }))}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {historyIsOpen ? 'Hide history ↑' : `History (${revisions.length}) ↓`}
                </button>
                {historyIsOpen && (
                  <ul className="mt-1.5 grid grid-cols-1 gap-1.5">
                    {revisions.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="flex-shrink-0" aria-hidden>{REVISION_SOURCE_ICON[r.source] ?? '•'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-gray-600">{r.source}</span>
                          {revShortTs(r.ts) ? <span className="ml-1.5 text-gray-400">{revShortTs(r.ts)}</span> : null}
                        </span>
                        {i !== revisions.length - 1 && (
                          <button
                            type="button"
                            onClick={() => { void restoreSection(section, i) }}
                            disabled={isRestoring}
                            className="flex-shrink-0 text-green-700 hover:text-green-600 disabled:opacity-40 transition-colors"
                          >
                            {isRestoring ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Discuss chat (S151). Discuss only on the typed canvas: a juror
                conversation about this section. Apply/refine is deferred here
                (build plan) because a refine would desync from field_values. */}
            {onSendChat && dirId != null && row && (
              <div className="mt-3">
                <SectionChat
                  discussOnly
                  thread={thread}
                  onSend={(msg) => onSendChat(row.id, msg)}
                  busy={chatBusyRowId === row.id}
                  busyMode={chatBusyRowId === row.id ? 'discuss' : null}
                  error={chatErrors?.[row.id] ?? null}
                  placeholder="Ask a senior juror about this section…"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldEditor — one typed input per field type.
// ─────────────────────────────────────────────────────────────────────────────
interface FieldEditorProps {
  field: EntryFormField
  sectionKey: string
  values: EntryFieldValues
  objectives: EntryListItem[]
  onFieldChange: (value: EntryFieldValues[string]) => void
  onSourceChange: (value: string) => void
  onRemoveObjective: (id: string) => void
}

function FieldEditor({ field, values, objectives, onFieldChange, onSourceChange, onRemoveObjective }: FieldEditorProps) {
  const raw = values[field.key]
  const sources = values.sources ?? {}
  const label = (
    <div className="flex items-center gap-2 flex-wrap mb-1">
      <label className="text-xs font-medium text-gray-700">{field.label}</label>
      {field.required && <span className="text-xs text-gray-300">required</span>}
    </div>
  )
  const help = field.help ? <p className="text-xs text-gray-400 mb-1.5">{field.help}</p> : null

  const sourceInput = field.source?.enabled ? (
    <input
      value={typeof sources[field.key] === 'string' ? sources[field.key] : ''}
      onChange={(e) => onSourceChange(e.target.value)}
      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-green-600 mt-1.5"
      placeholder={field.source.required ? 'Source (required)' : 'Source (if any)'}
    />
  ) : null

  // ── long_text / short_text ──
  if (field.type === 'long_text' || field.type === 'short_text') {
    const val = typeof raw === 'string' ? raw : ''
    const wc = countWords(val)
    const over = !!(field.word_limit && wc > field.word_limit)
    const isSentence = field.type === 'short_text' && field.one_sentence
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          {label}
          {field.word_limit && (
            <span className={`text-xs tabular-nums ${over ? 'text-red-600' : 'text-gray-400'}`}>{wc} / {field.word_limit}w</span>
          )}
        </div>
        {help}
        {field.type === 'short_text' ? (
          <input
            value={val}
            onChange={(e) => onFieldChange(e.target.value)}
            className={`w-full bg-gray-50 border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 ${over ? 'border-red-300' : 'border-gray-300'}`}
            placeholder={isSentence ? 'One sentence.' : ''}
          />
        ) : (
          <textarea
            value={val}
            onChange={(e) => onFieldChange(e.target.value)}
            rows={Math.max(3, (val.match(/\n/g) || []).length + 3)}
            className={`w-full bg-gray-50 border rounded-lg px-3 py-2 text-sm text-gray-900 leading-relaxed resize-none focus:outline-none focus:border-green-600 ${over ? 'border-red-300' : 'border-gray-300'}`}
          />
        )}
        {sourceInput}
      </div>
    )
  }

  // ── currency / amount_or_percent / ratio ──
  if (field.type === 'currency' || field.type === 'amount_or_percent' || field.type === 'ratio') {
    const val = typeof raw === 'string' ? raw : ''
    const placeholder =
      field.type === 'currency' ? 'e.g. $4.2M'
      : field.type === 'amount_or_percent' ? 'e.g. 78% or $3.28M'
      : (field.example || 'e.g. 4:1')
    return (
      <div>
        {label}
        {help}
        <input
          value={val}
          onChange={(e) => onFieldChange(e.target.value)}
          className="w-full sm:w-64 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600"
          placeholder={placeholder}
        />
        {sourceInput}
      </div>
    )
  }

  // ── list (repeatable single-line) ──
  if (field.type === 'list') {
    const items = Array.isArray(raw) ? (raw as EntryListItem[]) : []
    const belowMin = !!(field.min_items && items.filter((i) => i.text.trim()).length < field.min_items)
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          {label}
          {belowMin && <span className="text-xs text-amber-600">at least {field.min_items} needed</span>}
        </div>
        {help}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0 tabular-nums">{idx + 1}.</span>
              <input
                value={item.text}
                onChange={(e) => {
                  const next = items.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it))
                  onFieldChange(next)
                }}
                className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600"
                placeholder={field.item_label || 'Item'}
              />
              <button
                onClick={() => onRemoveObjective(item.id)}
                className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 flex-shrink-0"
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          onClick={() => onFieldChange([...items, { id: newItemId(), text: '' }])}
          className="text-xs text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors mt-2"
        >+ Add {field.item_label || 'item'}</button>
        {sourceInput}
      </div>
    )
  }

  // ── derived_list (Results ← Objectives) ──
  if (field.type === 'derived_list') {
    const stored = Array.isArray(raw) ? (raw as EntryDerivedRow[]) : []
    const display = reconcileDerivedList(stored, objectives)
    return (
      <div>
        {label}
        {help}
        {display.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Add objectives in the Strategy section first — each one gets a result row here.</p>
        ) : (
          <div className="space-y-2.5">
            {display.map((rowItem) => (
              <div key={rowItem.ref} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-700">Objective:</span> {rowItem.objective || <span className="italic text-gray-400">(untitled)</span>}</p>
                <input
                  value={rowItem.result}
                  onChange={(e) => {
                    const next = display.map((r) => (r.ref === rowItem.ref ? { ...r, result: e.target.value } : r))
                    onFieldChange(next)
                  }}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600"
                  placeholder={field.result_label ? `${field.result_label} for this objective` : 'Result for this objective'}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── table (typed rows with a required source column) ──
  if (field.type === 'table') {
    const rowsT = Array.isArray(raw) ? (raw as EntryTableRow[]) : []
    const cols = field.columns ?? []
    const blankRow = (): EntryTableRow => {
      const r: EntryTableRow = {}
      cols.forEach((c) => { r[c.key] = '' })
      return r
    }
    return (
      <div>
        {label}
        {help}
        <div className="space-y-3">
          {rowsT.map((r, rIdx) => (
            <div key={rIdx} className="rounded-lg border border-gray-200 bg-white px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Row {rIdx + 1}</span>
                <button
                  onClick={() => onFieldChange(rowsT.filter((_, i) => i !== rIdx))}
                  className="text-xs text-gray-400 hover:text-red-600"
                  title="Remove row"
                >✕</button>
              </div>
              <div className="space-y-2">
                {cols.map((c) => (
                  <div key={c.key}>
                    <label className="block text-xs text-gray-500 mb-0.5">
                      {c.label}
                      {c.type === 'source' && <span className="text-amber-600"> (source, required)</span>}
                    </label>
                    <input
                      value={r[c.key] ?? ''}
                      onChange={(e) => {
                        const next = rowsT.map((rr, i) => (i === rIdx ? { ...rr, [c.key]: e.target.value } : rr))
                        onFieldChange(next)
                      }}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-green-600"
                      placeholder={c.example || ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => onFieldChange([...rowsT, blankRow()])}
          className="text-xs text-green-700 hover:text-green-600 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors mt-2"
        >+ Add row</button>
        {sourceInput}
      </div>
    )
  }

  return null
}
