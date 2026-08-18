// ─────────────────────────────────────────────────────────────────────────────
// angleBridge — Arc v2 B3 (angle → direction bridge, 19 Aug 2026)
//
// "Build a draft from this angle": writes ONE direction row from a chosen
// angle, stamps angles.direction_id (the single client-writable column on
// angles), and hands the caller a direction id to route into the EXISTING
// per-entry-type draft flow on projects/[id] (?draftDirection=<id>). Design of
// record: Arc-V2-Design-2026-08-19.md §1 (the bridge) + the 18 Aug decision
// resolutions.
//
// Deliberate choices, in order of load-bearing-ness:
// • The direction insert reuses the workspace page's user-created /
//   accepted-single insert shape (addAoyDirection / acceptStrategyRecommendation:
//   client insert, .select().single(), error checked) — this direction IS a
//   user-picked single (probes §3d: the 74-of-74 drafted class), created at the
//   moment the user chose the angle.
// • best_category = the angle batch's category VERBATIM. It is picker-canonical
//   BY CONSTRUCTION: the angles surface takes its category from the AOY picker
//   (canonical stems), from existing directions' best_category (canonical for
//   AOY since generate-directions v32 canonicalizes to rubric keys), or from
//   categoriesForShow()'s documented list. Rephrasing it here would break the
//   exact-key rubric lookup that drafting and scoring share (parity contract).
// • model_used is deliberately NOT set (NULL), matching every user-created
//   direction insert on the workspace page. The model provenance lives on the
//   angles row itself, which carries direction_id back to this direction. This
//   is NOT the upload-stub class (that class = a stub entry_drafts child
//   written in the same transaction; the bridge writes no entry_drafts row).
// • No show+category duplicate check, unlike addAoyDirection: two angles in
//   the same category becoming two directions is the feature, not a duplicate.
//   Idempotency is per-angle via angles.direction_id (checked before insert,
//   re-checked on a failed stamp).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { isAoyShow, aoyResolveStored } from '@/lib/aoy-taxonomy'
import type { AngleRow } from './AngleCard'

export type BridgeAngleResult =
  | { ok: true; directionId: number }
  | { ok: false; message: string }

// First sentence of the premise seeds the direction's hook. ASCII character
// class only: no /u flag, no \p{...} (downlevel build constraint, S138).
function firstSentence(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  const m = t.match(/^[^.!?]*[.!?]/)
  return (m ? m[0] : t).trim().slice(0, 280) || null
}

// best_show comes from the project's target show. Single target show: use it.
// Multi-show project: the drafter routes by isAoyShow(best_show), so an
// AOY-canonical category must ride the AOY target show and a non-AOY category
// must not — otherwise the draft path and the category's rubric disagree.
export function resolveBridgeShow(targetShows: Array<string | null | undefined>, category: string): string | null {
  const shows: string[] = []
  targetShows.forEach(s => { const t = (s ?? '').trim(); if (t) shows.push(t) })
  if (shows.length === 0) return null
  if (shows.length === 1) return shows[0]
  const categoryIsAoy = !!aoyResolveStored(category)
  const aoyShow = shows.find(s => isAoyShow(s))
  const nonAoyShow = shows.find(s => !isAoyShow(s))
  if (categoryIsAoy && aoyShow) return aoyShow
  if (!categoryIsAoy && nonAoyShow) return nonAoyShow
  return shows[0]
}

export async function bridgeAngleToDirection(opts: {
  angle: AngleRow
  projectId: number
  targetShow: string
  userId: string
  sortOrder: number
}): Promise<BridgeAngleResult> {
  const { angle, projectId, targetShow, userId, sortOrder } = opts

  // Already bridged: never create a second direction for the same angle.
  if (typeof angle.direction_id === 'number' && angle.direction_id > 0) {
    return { ok: true, directionId: angle.direction_id }
  }

  // Same org resolution the workspace page's canonical direction inserts use.
  const { data: orgIdData, error: orgErr } = await supabase.rpc('get_my_org_id')
  if (orgErr || !orgIdData) {
    return { ok: false, message: 'Could not resolve your organization. Refresh the page and try again.' }
  }

  const anchors = Array.isArray(angle.evidence_anchors) ? angle.evidence_anchors : []
  const gaps = Array.isArray(angle.gaps) ? angle.gaps : []

  // Field mapping (design §1): angle = the premise; hook = the premise's first
  // sentence; strengths = the evidence anchors with their source documents
  // (provenance stays legible); risks = the gap notes (gaps → risks is the
  // design's mapping — what the story is missing is exactly its risk).
  const { data: newDir, error: dirErr } = await supabase
    .from('directions')
    .insert({
      project_id: projectId,
      org_id: orgIdData,
      created_by: userId,
      name: (angle.name ?? '').trim() || `${targetShow}: ${angle.category}`,
      best_show: targetShow,
      best_category: angle.category,
      angle: (angle.premise ?? '').trim() || null,
      hook: firstSentence(angle.premise),
      strengths: anchors.length > 0 ? anchors.map(a => `${a.evidence} (${a.document})`).join(' ') : null,
      risks: gaps.length > 0 ? `Named by the angle as missing: ${gaps.join(' • ')}` : null,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (dirErr || !newDir) {
    return { ok: false, message: dirErr?.message || 'Failed to create the direction.' }
  }
  const directionId = (newDir as { id: number }).id

  // Stamp angles.direction_id. RLS silent-no-op class (DM-16): an RLS-blocked
  // update returns no error and zero rows, so the returned row count IS the
  // success check. The .is('direction_id', null) filter makes a concurrent
  // bridge lose cleanly instead of double-stamping.
  const { data: stamped, error: stampErr } = await supabase
    .from('angles')
    .update({ direction_id: directionId })
    .eq('id', angle.id)
    .is('direction_id', null)
    .select('id')
  if (stampErr || !stamped || stamped.length === 0) {
    // The direction we just created has no angle pointing at it: remove it so a
    // failed bridge leaves nothing behind (Quick Eval's cleanup pattern).
    await supabase.from('directions').delete().eq('id', directionId)
    const { data: fresh } = await supabase
      .from('angles')
      .select('direction_id')
      .eq('id', angle.id)
      .single()
    const existing = (fresh as { direction_id?: number | null } | null)?.direction_id
    if (typeof existing === 'number' && existing > 0) {
      // Someone (or a second click) bridged this angle first: reuse theirs.
      return { ok: true, directionId: existing }
    }
    return { ok: false, message: stampErr?.message || 'Could not link this angle to the new direction, so nothing was created. Try again.' }
  }

  return { ok: true, directionId }
}
