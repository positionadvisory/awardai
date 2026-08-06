-- Planner instrumentation: extend engagement_events_event_check with the five
-- Portfolio Planner v3 funnel events.
--
-- APPLIED LIVE 6 Aug 2026 as migration add_planner_engagement_events_2026_08_06.
-- Committed here as a RECORD, matching the migrations/ convention. Do not re-run.
--
-- Why DROP + re-ADD: a PostgreSQL CHECK constraint cannot be ALTERed. The 24
-- pre-existing values below were copied verbatim from a live
-- pg_get_constraintdef read taken immediately before the run, never from the
-- reference docs. Additive only.
--
-- Deploy order is load-bearing: this ships BEFORE the frontend. useEngagement's
-- track() is fire-and-forget and swallows the insert error, so an event name the
-- constraint does not know is dropped silently with only a console.warn.
--
-- Verified post-run: 29 allowed values, 3462 rows intact, one RLS policy, and
-- authenticated still holds INSERT only. All five new names were then proven to
-- pass the constraint by a real insert, which was deleted again (0 residue).

ALTER TABLE engagement_events DROP CONSTRAINT engagement_events_event_check;

ALTER TABLE engagement_events ADD CONSTRAINT engagement_events_event_check CHECK (
  event = ANY (ARRAY[
    -- Milestones (Session 54)
    'eval_completed'::text,
    'directions_generated'::text,
    'draft_generated'::text,
    'presskit_generated'::text,
    'script_generated'::text,
    'quick_eval_used'::text,
    'outcome_recorded'::text,
    -- Engagement (Session 54)
    'section_view'::text,
    'spine_step_clicked'::text,
    'nextstep_shown'::text,
    'nextstep_clicked'::text,
    'nudge_shown'::text,
    'nudge_clicked'::text,
    'nudge_dismissed'::text,
    'wizard_frame_viewed'::text,
    'wizard_route_selected'::text,
    'guidance_disabled'::text,
    'guidance_enabled'::text,
    'tour_restarted'::text,
    -- Trial first-run activation flow, /start (S158, 13 Jul 2026)
    'first_run_landed'::text,
    'first_run_upload_started'::text,
    'first_run_score_shown'::text,
    'first_run_sample_used'::text,
    'first_run_nextstep_selected'::text,
    -- Portfolio Planner v3 funnel (6 Aug 2026)
    'planner_opened'::text,
    'planner_campaigns_selected'::text,
    'planner_confirm_reached'::text,
    'planner_plan_derived'::text,
    'planner_plan_saved'::text
  ])
);
