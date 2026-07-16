-- Migration: create_show_rate_facts
-- Win-rate reconciliation, Phase 1 (WinRate-Reconciliation-PLAN-2026-07.md §3 + §6)
-- SQL only. No frontend, no edge functions, no scorer touched.
-- Verified live schema first (information_schema): show_rate_facts did not exist;
-- dynamic_shows.confidence/last_verified_at and aoy_market_baselines' REVOKE-only
-- (no RLS) pattern are the conventions this table follows.

BEGIN;

CREATE TABLE public.show_rate_facts (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  show_name         text NOT NULL,
  metric            text NOT NULL,
  value             numeric(5,2),
  grade             text NOT NULL,
  denominator        text,
  category_scope    text NOT NULL DEFAULT 'whole_show',
  cycle_year        int,
  source_url        text,
  source_quote      text,
  attributed_to     text,
  note              text,
  last_verified_at  date NOT NULL,
  verified_by       text NOT NULL,
  superseded_by     bigint REFERENCES public.show_rate_facts(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT show_rate_facts_metric_check
    CHECK (metric IN ('shortlist_rate','win_rate','gold_rate','grandprix_rate')),
  CONSTRAINT show_rate_facts_grade_check
    CHECK (grade IN ('FESTIVAL_STATED','SOURCED','THIRD_PARTY','ESTIMATE','NONE_PUBLISHED','REFUTED')),
  CONSTRAINT show_rate_facts_denominator_check
    CHECK (denominator IS NULL OR denominator IN ('entries','pieces','unknown')),
  -- value required unless grade is NONE_PUBLISHED or REFUTED (a refuted row MAY still carry
  -- the killed value for the record; this constraint only blocks a silently-missing value
  -- on every other grade)
  CONSTRAINT show_rate_facts_value_required_check
    CHECK (grade IN ('NONE_PUBLISHED','REFUTED') OR value IS NOT NULL),
  -- source_url required when grade is FESTIVAL_STATED or SOURCED
  CONSTRAINT show_rate_facts_source_url_required_check
    CHECK (grade NOT IN ('FESTIVAL_STATED','SOURCED') OR source_url IS NOT NULL),
  -- attributed_to required when grade is THIRD_PARTY (whose guess)
  CONSTRAINT show_rate_facts_attributed_to_required_check
    CHECK (grade <> 'THIRD_PARTY' OR attributed_to IS NOT NULL)
);

COMMENT ON TABLE public.show_rate_facts IS
  'Canonical store for show win/shortlist/gold/grand-prix rates. One row per figure, provenance on the row. Replaces WIN_RATES (lib/shows-data.ts), BASE_WIN_RATES (page.tsx), and show_profiles.base_win_rate as the source of truth (those become consumers or are retired — see WinRate-Reconciliation-PLAN-2026-07.md). NONE_PUBLISHED and REFUTED are first-class grades, not the absence of a row.';

CREATE INDEX show_rate_facts_show_metric_idx
  ON public.show_rate_facts (show_name, metric)
  WHERE superseded_by IS NULL;

-- Service-role-only table: REVOKE is the primary defense (RLS alone is a trapdoor).
-- Matches the aoy_market_baselines precedent (no RLS policies, no anon/authenticated grants).
REVOKE ALL ON public.show_rate_facts FROM anon, authenticated;

-- Slim read surface for the client. A plain view (not security_invoker) checks
-- permissions as the view owner, so anon/authenticated can read it via GRANT SELECT
-- on the view alone, with zero grants on the base table itself.
-- Excludes REFUTED rows (tombstones are for internal integrity checking, not client
-- display) and superseded rows (corrections chain: only the current row is live).
-- verified_by is internal-only and left off the view.
CREATE VIEW public.show_rate_facts_read AS
  SELECT
    id, show_name, metric, value, grade, denominator, category_scope,
    cycle_year, source_url, source_quote, attributed_to, note, last_verified_at
  FROM public.show_rate_facts
  WHERE grade <> 'REFUTED' AND superseded_by IS NULL;

COMMENT ON VIEW public.show_rate_facts_read IS
  'Client-facing read surface for show_rate_facts. Excludes REFUTED tombstones and superseded rows. Publishability (which grades may render a number) is NOT filtered here by design -- the plan keeps that rule in one shared display-layer helper (GatedNumber), not scattered into the data layer, because NONE_PUBLISHED rows are needed data (the "why no number" fallback), not an absence.';

GRANT SELECT ON public.show_rate_facts_read TO anon, authenticated;

-- ============================================================
-- Seed: day-one cleared content only. Every row traces to a ledger line
-- (Verified Research Ledger §B2, or the underlying Part 3 verification brief
-- the ledger cites) or to the E1 audit's REFUTED findings. No filled gaps.
-- ============================================================

-- Cannes Lions -- FESTIVAL_STATED, standing (no cycle_year)
INSERT INTO public.show_rate_facts
  (show_name, metric, value, grade, denominator, category_scope, cycle_year,
   source_url, source_quote, note, last_verified_at, verified_by)
VALUES
  ('Cannes Lions', 'win_rate', 3.00, 'FESTIVAL_STATED', 'entries', 'whole_show', NULL,
   'https://www.canneslions.com/awards/awards-support/awards-entry-guide',
   'Each year, only 10% of all entries make the shortlist and only 3% win an Award.',
   'Standing festival-stated figure, not tied to a specific year. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

  ('Cannes Lions', 'shortlist_rate', 10.00, 'FESTIVAL_STATED', 'entries', 'whole_show', NULL,
   'https://www.canneslions.com/awards/awards-support/awards-entry-guide',
   'Each year, only 10% of all entries make the shortlist and only 3% win an Award.',
   'Standing festival-stated figure, not tied to a specific year. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

-- Spikes Asia -- FESTIVAL_STATED shortlist rate ONLY, never a win rate
  ('Spikes Asia', 'shortlist_rate', 20.00, 'FESTIVAL_STATED', 'entries', 'whole_show', NULL,
   'https://www.spikes.asia/awards/awards-support/awards-entry-guide',
   'Being shortlisted at Spikes Asia is a huge achievement. Only roughly 20% of all entries make the cut.',
   'Shortlist rate only -- Spikes Asia publishes no whole-show metals/win rate. Never substitute this for win_rate. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

-- D&AD -- FESTIVAL_STATED, year-specific win_rate rows. Denominator confirmed
-- 'entries' for 2020-2022 (Part 3 explicitly checked this); the 2024 Trend Report
-- quote says "entered work", which is ambiguous vs the entries/pieces split D&AD
-- itself flags elsewhere, so that one row is marked 'unknown' rather than guessed.
  ('D&AD', 'win_rate', 7.30, 'FESTIVAL_STATED', 'entries', 'whole_show', 2020,
   'https://www.dandad.org/annual/2020/dandad2020/d-ad-in-2020/',
   'There were 8,656 entries, comprising 21,640 pieces of work, from 76 countries. There were 1,019 shortlisted (11.8% of entries) and 630 pencil winners (7.3%).',
   'Denominator confirmed entries (8,656), not pieces of work. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

  ('D&AD', 'win_rate', 6.60, 'FESTIVAL_STATED', 'entries', 'whole_show', 2021,
   'https://www.dandad.org/annual/2021/dandad2021/d-ad-in-2021/',
   '664 out of the 9,972 entries (just 6.6%) won a pencil.',
   'Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B. No standing "6%" figure exists -- always cite the year.',
   '2026-07-16', 'ledger-B2'),

  ('D&AD', 'win_rate', 5.90, 'FESTIVAL_STATED', 'entries', 'whole_show', 2022,
   'https://www.dandad.org/annual/2022/dandad2022/d-ad-in-2022/',
   'Of those, 702 won a Pencil, a total of 5.9%.',
   'Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

  ('D&AD', 'win_rate', 5.00, 'FESTIVAL_STATED', 'unknown', 'whole_show', 2024,
   'https://www.dandad.org',
   'ONLY 5% OF ENTERED WORK TAKES HOME A COVETED PENCIL.',
   'From the D&AD 2024 Trend Report (verbatim, per Part3_VERIFICATION_BRIEF_15JUN2026.md §3B); the exact Trend-Report page URL was not pinned down in local research and needs a backfill pass before customer-facing use -- source_url points to the parent domain only, not invented. Denominator ambiguous ("entered work" vs the entries/pieces split D&AD uses elsewhere in the same period) -- do NOT assume entries. Ledger §B2.',
   '2026-07-16', 'ledger-B2'),

-- NONE_PUBLISHED -- researched, confirmed absent. First-class data, not a missing row.
  ('One Show', 'win_rate', NULL, 'NONE_PUBLISHED', 'entries', 'whole_show', 2025,
   'https://oneshow.org/about/',
   'Entries: 18,000 in 2025 / Awards Presented: 658 Pencils in 2025',
   'Raw counts only -- One Show publishes no win-rate percentage. Do NOT derive/store 3.66%. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

  ('Clio', 'win_rate', NULL, 'NONE_PUBLISHED', NULL, 'whole_show', NULL,
   'https://clios.com',
   NULL,
   'Multiple clios.com pages checked (entry/about/winners gallery); no win rate published anywhere. Circulating "<3% / <1% Gold" figures are third-party (Wikipedia), not Clio-sourced -- not seeded here. Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2'),

  ('LIA', 'win_rate', NULL, 'NONE_PUBLISHED', NULL, 'whole_show', 2024,
   'https://2024.liaentries.com/winners/',
   NULL,
   '2024: 935 statues published but no entry total; no win-rate percentage in any official LIA source. Correct official domain is liaawards.com (lia.co.uk is an unrelated UK financial body). Ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B.',
   '2026-07-16', 'ledger-B2');

-- REFUTED -- tombstones for the killed-numbers list. Every one of these six numbers
-- traces to the retired Shortlist-Portfolio-Comparison-Brief.md (now marked superseded,
-- Phase 0) and/or the WARC v2 cost-per-point table, both refuted by ledger §C and the
-- Part 3 conflict table. Refuting source is in the note, per the plan's own design.
INSERT INTO public.show_rate_facts
  (show_name, metric, value, grade, category_scope, cycle_year, note, last_verified_at, verified_by)
VALUES
  ('Cannes Lions', 'win_rate', 6.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: Cannes festival-stated win rate is 3% (verbatim, canneslions.com entry guide), not 6% -- exactly 2x the real figure. This number originated in the WARC v2 cost-per-point table and the retired Shortlist-Portfolio-Comparison-Brief.md ("Cannes base rates: 6% metal"). Refuting source: https://www.canneslions.com/awards/awards-support/awards-entry-guide (ledger §B2); conflict documented in Part3_VERIFICATION_BRIEF_15JUN2026.md §3B + ledger §C.',
   '2026-07-16', 'ledger-C'),

  ('Cannes Lions', 'shortlist_rate', 12.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: Cannes festival-stated shortlist rate is 10% (verbatim, canneslions.com entry guide: "10% of all entries make the shortlist"), not 12%. Originated in the retired Shortlist-Portfolio-Comparison-Brief.md ("Cannes base rates: 12% shortlist"). Refuting source: https://www.canneslions.com/awards/awards-support/awards-entry-guide (ledger §B2).',
   '2026-07-16', 'ledger-C'),

  ('D&AD', 'win_rate', 10.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: 10% exceeds every published D&AD year (7.3% 2020 / 6.6% 2021 / 5.9% 2022 / ~5% 2024); D&AD does not publish a standing "10%" figure. Originated in the WARC v2 cost-per-point table and the retired Shortlist-Portfolio-Comparison-Brief.md ("D&AD... 10% metal rate"). Refuting source: the year-specific dandad.org pages seeded above (ledger §B2); conflict documented in Part3_VERIFICATION_BRIEF_15JUN2026.md §3B + ledger §C.',
   '2026-07-16', 'ledger-C'),

  ('One Show', 'win_rate', 12.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: One Show publishes no win-rate percentage (raw 658 Pencils / 18,000 entries, 2025, no % stated). The 12% figure is unsourced, originating in the WARC v2 cost-per-point table and the retired Shortlist-Portfolio-Comparison-Brief.md. Refuting source: https://oneshow.org/about/ (ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B); see also ledger §C.',
   '2026-07-16', 'ledger-C'),

  ('Clio', 'win_rate', 12.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: Clio publishes no official win rate (confirmed across clios.com entry/about/winners pages). The 12% figure is unsourced, originating in the WARC v2 cost-per-point table and the retired Shortlist-Portfolio-Comparison-Brief.md; circulating "<3% / <1% Gold" figures are third-party (Wikipedia), a different number entirely. Refuting source: ledger §B2 / Part3_VERIFICATION_BRIEF_15JUN2026.md §3B; see also ledger §C.',
   '2026-07-16', 'ledger-C'),

  ('Spikes Asia', 'win_rate', 9.00, 'REFUTED', 'whole_show', NULL,
   'Refuted: Spikes Asia publishes no whole-show metals/win rate -- only a ~20% shortlist rate. The 9% "metal rate" is the wrong metric (a shortlist-adjacent number substituted for a win rate), originating in the WARC v2 cost-per-point table and the retired Shortlist-Portfolio-Comparison-Brief.md. Refuting source: https://www.spikes.asia/awards/awards-support/awards-entry-guide (ledger §B2); conflict documented in Part3_VERIFICATION_BRIEF_15JUN2026.md §3B + ledger §C.',
   '2026-07-16', 'ledger-C');

COMMIT;

-- ============================================================
-- Follow-up migration: show_rate_facts_read_revoke_write_grants
-- Applied separately, immediately after the above, once the post-run
-- verification below surfaced a gap.
-- ============================================================
-- CAUGHT AT VERIFICATION: information_schema.role_table_grants showed
-- anon/authenticated held DELETE/INSERT/UPDATE (not just SELECT) on
-- show_rate_facts_read, despite the migration above only running
-- `GRANT SELECT`. Root cause: Supabase's default-privileges-to-anon/
-- authenticated rule applies to new VIEWS too, and because
-- show_rate_facts_read is a simple auto-updatable view owned by postgres,
-- postgres's own unrestricted table access would have let those writes
-- through the view even with the base table REVOKEd. Fixed immediately:
REVOKE ALL ON public.show_rate_facts_read FROM anon, authenticated;
GRANT SELECT ON public.show_rate_facts_read TO anon, authenticated;
-- Re-verified: anon/authenticated hold SELECT only on the view, nothing
-- on the base table. Flagging this pattern for future sessions: any new
-- VIEW (not just new TABLE) over a service-role-only table needs its own
-- explicit REVOKE, the base-table REVOKE alone is not sufficient.
