// lib/segment-entry-generic-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// ONE shared client-side helper for calling the segment-entry-generic edge
// function, used by BOTH /start (first-run upload) and the project-page Quick
// Eval. Upload-Segmentation-BUILD-PLAN-2026-07-22.md §3 P2 calls this out
// explicitly per the S162 lesson: /start and the project page each grew their
// own local copy of the AOY/config/SMARTIES routing logic, and the two
// silently drifted (one force-nulled configMode for SMARTIES, the other
// didn't), which is exactly how a real upload broke. A single shared function,
// imported by both files, makes that drift structurally impossible here.
//
// SCOPE: call this ONLY for the creative-track "else" branch — a show with no
// AOY / config (weighted|qualitative) / SMARTIES routing, i.e. the show has no
// structured entry_form (build plan §2, Route A). Call it AFTER the caller has
// already inserted the generation-1 blob entry_drafts row ('entry' field_key):
// on {segmented:true} the edge fn has already deleted that blob row and
// replaced it with sectioned rows server-side (same generation), so the
// caller only needs to know whether to refresh its local view of the entry
// from the DB. On {segmented:false}, any non-2xx response, or any thrown
// error (network, timeout, parse), the blob row is left completely untouched
// — the edge fn never deletes without a prior successful insert (P1 fix, 22
// Jul 2026) — so the existing blob-render path is always safe as a fallback.
//
// NEVER THROWS. This must never block the eval (build plan §2): a segmentation
// failure of any kind is swallowed here and reported as {segmented: false}.
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentEntryGenericResult = { segmented: boolean }

export async function trySegmentEntryGeneric(params: {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  projectId: number
  directionId: number
  materialPath: string
}): Promise<SegmentEntryGenericResult> {
  const { supabaseUrl, anonKey, accessToken, projectId, directionId, materialPath } = params
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/segment-entry-generic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ project_id: projectId, direction_id: directionId, material_path: materialPath }),
    })
    if (!res.ok) return { segmented: false }
    const data = await res.json().catch(() => null) as { segmented?: boolean } | null
    return { segmented: data?.segmented === true }
  } catch (err) {
    // Network error, timeout, or anything else: the blob path already written
    // by the caller stands untouched. Log loudly for debugging, never surface
    // to the user, never block the eval that follows.
    console.warn('segment-entry-generic client call failed, falling back to the blob entry', err)
    return { segmented: false }
  }
}
