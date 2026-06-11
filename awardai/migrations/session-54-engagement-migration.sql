-- ════════════════════════════════════════════════════════════════════════════
-- SESSION 54 — ENGAGEMENT TRACKING FOUNDATION (Build 1 of Brief-Onboarding-Engagement-v3)
-- ════════════════════════════════════════════════════════════════════════════
-- Creates the two tables that power onboarding guidance, lifecycle nudges,
-- and the Phase 2 Cycle Wrap:
--
--   1. engagement_events   — append-only first-party product analytics.
--                            INSERT-only for clients, 24-MONTH retention
--                            (its own pg_cron job, deliberately separate from
--                            the 90-day usage_logs purge).
--   2. user_product_state  — one row per user; guidance toggle, wizard state,
--                            section visit counters, nudge dismissals.
--                            Self-row SELECT/INSERT/UPDATE for clients.
--
-- Run the whole script in the Supabase SQL Editor, then run the verification
-- block (Block 5) statements ONE AT A TIME — the editor only displays the
-- result of the last statement in a run.
--
-- Lessons baked in:
--   • Session 51 trapdoor: explicit REVOKEs, not just "no policies".
--   • Session 47: get_my_org_id() inside policies (SECURITY DEFINER, no recursion).
--   • DM-15: CHECK constraints on enum-like text columns.
--   • DM-11: retention job named + guarded re-runnable.
-- ════════════════════════════════════════════════════════════════════════════


-- ── Block 1: engagement_events ──────────────────────────────────────────────

CREATE TABLE engagement_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event       text   NOT NULL,
  context     jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_events_event_check CHECK (event IN (
    -- Milestone events (slim mirror of key AI actions — survives the
    -- 90-day usage_logs purge; required for the Phase 2 Cycle Wrap)
    'eval_completed',
    'directions_generated',
    'draft_generated',
    'presskit_generated',
    'script_generated',
    'quick_eval_used',
    'outcome_recorded',
    -- Engagement events
    'section_view',
    'spine_step_clicked',
    'nextstep_shown',
    'nextstep_clicked',
    'nudge_shown',
    'nudge_clicked',
    'nudge_dismissed',
    'wizard_frame_viewed',
    'wizard_route_selected',
    'guidance_disabled',
    'guidance_enabled',
    'tour_restarted'
  ))
);

-- Hot-path indexes (Session 47 rule: index lands in the same migration as the
-- query path). Org/event scan powers the wrap + success metrics; user scan
-- powers nudge predicates and per-user history.
CREATE INDEX engagement_events_org_event_created_idx
  ON engagement_events (org_id, event, created_at DESC);
CREATE INDEX engagement_events_user_created_idx
  ON engagement_events (user_id, created_at DESC);

-- RLS: INSERT-only for authenticated users, own user_id + own org only.
-- No client SELECT/UPDATE/DELETE policies — reads are service-role only
-- (Phase 2 wrap generation, admin dashboard later).
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own engagement events"
  ON engagement_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id = get_my_org_id());

-- Session 51 trapdoor lesson: RLS-deny with full default grants is one
-- accidentally-permissive policy away from exposure. Revoke everything,
-- grant back INSERT only. (Identity columns need no sequence grant.)
REVOKE ALL ON engagement_events FROM anon, authenticated;
GRANT INSERT ON engagement_events TO authenticated;


-- ── Block 2: user_product_state ─────────────────────────────────────────────
-- Deliberately NOT columns on profiles: client UPDATE on profiles is
-- column-limited to full_name/avatar_url (Session 47) and widening that
-- grant for UI state expands the attack surface on a sensitive table.
-- profiles.onboarded_at stays as-is, unused by this build.

CREATE TABLE user_product_state (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  guidance_enabled    boolean NOT NULL DEFAULT true,
  wizard_completed_at timestamptz,
  wizard_route        text,
  section_visits      jsonb NOT NULL DEFAULT '{}'::jsonb,
  nudges              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_product_state_wizard_route_check CHECK (
    wizard_route IS NULL OR wizard_route IN ('evaluate', 'new_entry', 'scope_season', 'skipped')
  )
);

-- RLS: self-row only. All columns are client-writable — this is all UI
-- state, nothing privileged. No DELETE policy (row dies with the user via
-- the FK cascade).
ALTER TABLE user_product_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own product state"
  ON user_product_state FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own product state"
  ON user_product_state FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own product state"
  ON user_product_state FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON user_product_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON user_product_state TO authenticated;


-- ── Block 3: retention — 24-month purge via pg_cron ─────────────────────────
-- SEPARATE from the 90-day usage_logs purge (19:20 UTC) and the
-- stripe_webhook_events purge (19:40 UTC). 24 months = two full award
-- cycles, enough for the annual wrap with year-over-year comparison.
-- Do NOT shorten this to match usage_logs — the whole point of this table
-- is surviving that purge.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-runnable: unschedule if the job already exists, then (re)schedule.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-engagement-events');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-engagement-events',
  '0 20 * * *',  -- 20:00 UTC daily = ~4:00am SGT, after the other two purges
  $$DELETE FROM engagement_events WHERE created_at < now() - interval '24 months'$$
);


-- ── Block 4: documentation comments ─────────────────────────────────────────

COMMENT ON TABLE engagement_events IS
  'First-party product analytics (append-only). Client INSERT only; reads are service-role. 24-month retention via pg_cron job purge-engagement-events. Powers onboarding metrics + Phase 2 Cycle Wrap. Session 54.';
COMMENT ON TABLE user_product_state IS
  'Per-user guidance/onboarding UI state (guidance toggle, wizard, section visits, nudge dismissals). Self-row RLS, fully client-writable. Deliberately not on profiles. Session 54.';


-- ── Block 5: post-flight verification (read-only — RUN ONE AT A TIME) ──────

-- 5a. Policies exist with the right definitions (expect 4 rows; check the
--     qual/with_check text, not just the names — Session 51 lesson)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('engagement_events', 'user_product_state')
ORDER BY tablename, policyname;

-- 5b. Grants are exactly: engagement_events INSERT only; user_product_state
--     SELECT/INSERT/UPDATE only; nothing for anon (expect 4 rows, all authenticated)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('engagement_events', 'user_product_state')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 5c. RLS enabled on both (expect rowsecurity = true, 2 rows)
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('engagement_events', 'user_product_state');

-- 5d. Cron job scheduled (expect 1 row: purge-engagement-events, 0 20 * * *)
SELECT jobname, schedule FROM cron.job
WHERE jobname = 'purge-engagement-events';

-- 5e. Indexes exist (expect 2 rows beyond the PK)
SELECT indexname FROM pg_indexes
WHERE tablename = 'engagement_events' AND indexname LIKE 'engagement_events_%_idx';
