-- Session 146 — Workbench P3: section-level directional re-score (evaluate-aoy-section)
-- ---------------------------------------------------------------------------------------
-- ADDITIVE ONLY. Adds evaluations.section_rescores (jsonb) plus one atomic merge RPC.
--
-- The official jury payload (evaluations.scores / evaluations.output.sections) is NEVER
-- mutated by this feature. section_rescores is a SEPARATE, directional-only store keyed
-- by the section key. Everything the user sees from it is labelled directional; the full
-- jury run remains the score of record. A full jury re-run INSERTS a new evaluations row
-- (see evaluate-aoy-entry: delete-then-insert), so rescores age out with their parent
-- evaluation and can never be shown against a newer official score.
--
-- Deploy order (P3 brief): run THIS migration FIRST, then paste the evaluate-aoy-section
-- edge function (Verify JWT OFF), then merge the frontend PR.

begin;

-- 1. The directional store. Default '{}' so every existing and future row reads cleanly.
--    Shape: { "<section_key>": { "score": 8, "rationale": "...", "at": "ISO-8601",
--                                "text_hash": "8-hex" }, ... }
alter table public.evaluations
  add column if not exists section_rescores jsonb not null default '{}'::jsonb;

-- 2. Atomic per-key merge, called by the evaluate-aoy-section edge fn (service role only).
--    Single-statement jsonb concat, so two sections rescored near-simultaneously cannot
--    clobber each other via a read-modify-write race (append_project_material pattern).
--    p_org_id is matched in the WHERE clause as defence in depth on top of the edge fn's
--    own IDOR checks: a rescore can only ever land on an evaluation the caller's org owns.
--    Returns the merged section_rescores, or NULL if no row matched (wrong id/org) so the
--    caller can fail loudly instead of silently no-opping.
create or replace function public.merge_evaluation_section_rescore(
  p_evaluation_id bigint,
  p_org_id bigint,
  p_section_key text,
  p_payload jsonb
) returns jsonb
language sql
security definer
set search_path = public
as $func$
  update public.evaluations
     set section_rescores = coalesce(section_rescores, '{}'::jsonb)
                            || jsonb_build_object(p_section_key, p_payload)
   where id = p_evaluation_id
     and org_id = p_org_id
  returning section_rescores;
$func$;

-- Service-role only. The edge fn calls it with the service-role key; there is no client
-- path (a client rescore write would be the DM-16 silent-no-op / privileged-state class).
revoke all on function public.merge_evaluation_section_rescore(bigint, bigint, text, jsonb) from public;
revoke all on function public.merge_evaluation_section_rescore(bigint, bigint, text, jsonb) from anon, authenticated;
grant execute on function public.merge_evaluation_section_rescore(bigint, bigint, text, jsonb) to service_role;

commit;
