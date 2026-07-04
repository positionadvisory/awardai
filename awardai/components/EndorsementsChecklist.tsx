'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EndorsementsChecklist (AOY flow redesign, chunk 6, 2026-07-04)
// CEO/CFO sign-off readiness for an Agency of the Year entry. HYGIENE ONLY: it
// never lowers or feeds the jury score. The AOY seed already carries the
// endorsement gate as a weight:null row excluded from the scoring meter (S74,
// the entry_drafts page-budget filter `field_key !== 'endorsement'`) — this
// component is presentation of readiness, nothing more, and must never be
// wired into any scoring path.
//
// State is a plain boolean map (item_key -> boolean), persisted by the PARENT
// page to projects.endorsements_checklist (one small jsonb column). This
// component holds no Supabase client and makes no writes itself: the parent
// owns the write + the DM-16 returned-row check, matching the rest of the
// page's projects-table writes (saveBrief/saveShows/handleRenameProject).
//
// Items (Ben, chunk 6 scope, confirmed 2026-07-04): a fixed list, not
// user-editable. If this list ever needs to change, change it here — it is
// the single source of truth the parent page reads for the "done" check.
// ─────────────────────────────────────────────────────────────────────────────

export type EndorsementItemKey =
  | 'ceo_signoff'
  | 'cfo_signoff'
  | 'legal_compliance'
  | 'client_permissions'
  | 'figures_match'

export const ENDORSEMENT_ITEMS: { key: EndorsementItemKey; label: string; help: string }[] = [
  { key: 'ceo_signoff', label: 'CEO sign-off confirmed', help: 'Your CEO has reviewed and approved this entry for submission.' },
  { key: 'cfo_signoff', label: 'CFO sign-off confirmed', help: 'Your CFO has reviewed and approved any financial figures in this entry.' },
  { key: 'legal_compliance', label: 'Legal & compliance cleared', help: 'Nothing in this entry needs legal or compliance review, or that review is already done.' },
  { key: 'client_permissions', label: 'Client permissions secured', help: 'If this entry names a client, they have agreed to be named.' },
  { key: 'figures_match', label: 'Final figures match the validated agency facts', help: 'Numbers in the entry match what you confirmed in Verify Facts, not an earlier draft.' },
]

type Props = {
  checklist: Record<string, boolean>
  onToggle: (key: EndorsementItemKey) => void
  saving?: boolean
}

export default function EndorsementsChecklist({ checklist, onToggle, saving }: Props) {
  const checkedCount = ENDORSEMENT_ITEMS.filter(i => !!checklist[i.key]).length
  const allChecked = checkedCount === ENDORSEMENT_ITEMS.length

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 gap-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Endorsements</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          CEO/CFO sign-off readiness. This is a hygiene checklist only: checking or unchecking an item never changes your jury score. Confirm each item as it is cleared internally.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {ENDORSEMENT_ITEMS.map(item => {
          const checked = !!checklist[item.key]
          return (
            <label
              key={item.key}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                checked ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!!saving}
                onChange={() => onToggle(item.key)}
                className="mt-0.5 accent-green-700"
              />
              <div>
                <p className={`text-sm ${checked ? 'text-green-800 font-medium' : 'text-gray-900'}`}>{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.help}</p>
              </div>
            </label>
          )
        })}
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-500">
          {checkedCount} of {ENDORSEMENT_ITEMS.length} confirmed.
          {allChecked ? ' All sign-offs are ready for submission.' : ''}
        </p>
      </div>
    </div>
  )
}
