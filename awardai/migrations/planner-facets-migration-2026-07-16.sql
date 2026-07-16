-- Migration: planner_v2_data_layer
-- Portfolio Planner v2, build session P1 (data + engine layer).
-- Planner-v2-SPEC-2026-07.md Part 2 as amended by the PRE-BUILD DELTA +
-- USER MODEL & FLOW v2 sections. SQL only. No frontend, no edge functions,
-- no scorer touched.
--
-- STEP 0 (verified live via information_schema before writing this):
--   agency_profiles.planner_prefs   -- did NOT exist
--   show_profiles.planner_facets    -- did NOT exist
--   dynamic_shows.planner_facets    -- did NOT exist
--   show_rate_facts_read view       -- EXISTS, columns match lib/rate-facts.ts's
--                                       RateFact type exactly (id, show_name,
--                                       metric, value, grade, denominator,
--                                       category_scope, cycle_year, source_url,
--                                       source_quote, attributed_to, note,
--                                       last_verified_at). No drift.
--
-- planner_facets NEVER carries a rate/odds/win-likelihood field. Odds come
-- only from show_rate_facts / GatedNumber, already live (Phase 2).
--
-- ============================================================================

BEGIN;

-- ── 1. agency_profiles.planner_prefs ────────────────────────────────────────
-- Nullable; NULL = use derived defaults. VERSIONED from day one so named
-- scenarios (v1.5) land without a further migration (USER MODEL & FLOW v2 §5).
-- Written only via the existing /api/agency-profile PATCH route (service-role;
-- agency_profiles has ZERO client direct writes by rule) -- wiring that route's
-- WRITABLE_FIELDS allowlist is P2's job, not this session's.
ALTER TABLE public.agency_profiles
  ADD COLUMN planner_prefs jsonb;

COMMENT ON COLUMN public.agency_profiles.planner_prefs IS
  'Portfolio Planner v2 per-agency state. Nullable (NULL = derive defaults from agency_profiles/project history). Shape: {schema_version:1, updated_by, current:{discipline, maturity, region, budget, budget_currency, target_title, pins:[], excludes:[], lens}, scenarios:[]}. scenarios stays empty in v1; the shape ships versioned now (Planner-v2-SPEC-2026-07.md USER MODEL & FLOW v2 §5). Writes ONLY via /api/agency-profile PATCH (service-role) -- never a client supabase.from(''agency_profiles'').update().';

-- ── 2. show_profiles.planner_facets ─────────────────────────────────────────
-- Supersedes the spec's original flat `reputation_axis text` column decision
-- (overtaken by the FACETED v2 mapping, PRE-BUILD DELTA 16 Jul). Editorial
-- reference data, never a per-agency value. Never carries a rate.
ALTER TABLE public.show_profiles
  ADD COLUMN planner_facets jsonb;

COMMENT ON COLUMN public.show_profiles.planner_facets IS
  'Portfolio Planner v2 editorial facet mapping. Shape: {kind: work|agency_title|people, axis?: effectiveness|craft|creative_fame|specialist (work only), discipline?: creative|media|mobile|PR|entertainment|sports|creator|digital, geo_scope?: national|regional|global, excluded?: string, discipline_note?: string}. NEVER carries a win-odds/rate field -- odds come only from show_rate_facts/GatedNumber. Ben-approved mapping per Planner-v2-SPEC-2026-07.md PRE-BUILD DELTA (16 Jul 2026), seeded exactly as written, not re-derived.';

-- ── 3. dynamic_shows.planner_facets ─────────────────────────────────────────
-- dynamic_shows has no facets column at all (S118-class pipeline-only shows).
-- Same shape as show_profiles.planner_facets, same rule: never a rate.
ALTER TABLE public.dynamic_shows
  ADD COLUMN planner_facets jsonb;

COMMENT ON COLUMN public.dynamic_shows.planner_facets IS
  'Same shape and rule as show_profiles.planner_facets -- see that column comment. Seeded here for shows tracked only in dynamic_shows (Epica, Webby, The Drum, One Show Indies, the four Agency-of-the-Year dynamic rows, The Indie Awards).';

COMMIT;

-- ============================================================================
-- SEED: show_profiles.planner_facets
-- Every row traces to the v2 FACETED mapping table in
-- Planner-v2-SPEC-2026-07.md PRE-BUILD DELTA (Ben-approved as of P1's start).
-- Shows NOT in this list (African Cristal Festival, AWARD Awards, WARC Awards)
-- are deliberately left NULL -- the spec's "9 pipeline-only shows... stay
-- unmapped until covered" rule. Nothing here is re-derived from show names;
-- placements are grounded in each show's own judging_philosophy text per the
-- spec's stated decision rule (axis = the reputation a win travels as,
-- informed by who judges and what they weight).
-- ============================================================================

BEGIN;

-- WORK -- Effectiveness
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"effectiveness","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'Effie APAC';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"effectiveness","discipline":"mobile","geo_scope":"global","discipline_note":"Business impact and results carry the most weight, well above craft (own show_profiles judging_philosophy) -- v1 had this specialist, contradicted by our own profile. Covers both the MMA Smarties APAC and Global tracks; fees differ by track (see ENTRY_FEES ''MMA Smarties APAC''/''MMA Smarties Global'')."}'::jsonb
  WHERE show_name = 'MMA Smarties';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"effectiveness","discipline":"media","geo_scope":"regional","discipline_note":"Jury ~80-85% client-side; genuine media insight driving strategy is the judging test -- THE media-agency reputation show in the covered set. NOTE: this show_profiles row is named ''Festival of Media'' vs the DEADLINES_2026 key ''Festival of Media APAC'' -- name-drift, logged for the facts hygiene list, not fixed in this migration."}'::jsonb
  WHERE show_name = 'Festival of Media';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"effectiveness","discipline":"creative","geo_scope":"national","discipline_note":"Multi-discipline (creative + media); 3-dimension scoring with Results at 40%, the heaviest weight. The covered set''s one national work show (China)."}'::jsonb
  WHERE show_name = 'ROI Festival';

-- WORK -- Craft
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"craft","discipline":"creative","geo_scope":"global"}'::jsonb
  WHERE show_name = 'D&AD';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"craft","discipline":"creative","geo_scope":"global"}'::jsonb
  WHERE show_name = 'London International Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"craft","discipline":"creative","geo_scope":"global","discipline_note":"Borderline with creative fame; kept craft per the spec''s own example (''pure creative excellence -- the idea and its execution'')."}'::jsonb
  WHERE show_name = 'One Show';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"craft","discipline":"creative","geo_scope":"global","discipline_note":"Profile evidence is thin (''intrinsic merit... industry-accepted standard''). Weakest placement in this lane per the spec -- flag if read differently."}'::jsonb
  WHERE show_name = 'New York Festivals Advertising Awards';

-- WORK -- Creative fame
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"creative_fame","discipline":"creative","geo_scope":"global","discipline_note":"Media agencies enter via the Media Lions."}'::jsonb
  WHERE show_name = 'Cannes Lions';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"creative_fame","discipline":"creative","geo_scope":"global","discipline_note":"Broader category portfolio than most. Clio Entertainment/Sports/Creators are separate specialist/discipline shows, not sub-categories of this facet."}'::jsonb
  WHERE show_name = 'Clio Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"creative_fame","discipline":"creative","geo_scope":"global","discipline_note":"Idea/bravery-led (Craft, Reset, Bravery), not execution-judged."}'::jsonb
  WHERE show_name = 'ANDY Awards';

-- WORK -- Specialist / regional
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'Spikes Asia';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'ADFEST';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'Dubai Lynx';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'Eurobest';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'Loeries';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"global","discipline_note":"Perspective/eligibility cut (through the female lens), not a geographic one."}'::jsonb
  WHERE show_name = 'Gerety Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"entertainment","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Clio Entertainment';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"sports","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Clio Sports';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creator","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Clio Creators';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'SABRE Awards Asia-Pacific';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'SABRE Awards EMEA';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'SABRE Awards North America';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"national"}'::jsonb
  WHERE show_name = 'PRCA UK Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"regional"}'::jsonb
  WHERE show_name = 'PRCA APAC Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"global","discipline_note":"Charter is results-purist -- arguable effectiveness axis; flag if you want it moved (per spec)."}'::jsonb
  WHERE show_name = 'ICCO Global Awards';

-- Global SABRE -- EXCLUDE from allocation entirely. Verbatim marker shape per
-- spec, plus context fields so the normal facet reader does not choke on a
-- missing axis/discipline/geo_scope; the engine must hard-exclude on `excluded`
-- before doing anything else with this row.
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"PR","geo_scope":"global","excluded":"not_directly_enterable","discipline_note":"No separate judging panel -- winners are selected by PRovoke editorial leadership from across all regional SABRE competitions. Not an entry purchase; budget cannot buy it directly. EXCLUDE from allocation entirely."}'::jsonb
  WHERE show_name = 'Global SABRE Awards';

-- AGENCY TITLES lane (kind only; no axis/discipline -- allocation lane is titles)
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"regional","discipline_note":"Six sub-region tracks + market-level awards -- the geo-tier-native show. Client-marketer judged."}'::jsonb
  WHERE show_name = 'Campaign Asia Agency of the Year';

-- PEOPLE lane
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"people","geo_scope":"regional","discipline_note":"Judges the nominee, not her agency. Achievement weighted 35%."}'::jsonb
  WHERE show_name = 'Campaign Asia Women to Watch APAC';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"people","geo_scope":"regional","discipline_note":"Individual leadership award, written-submission judged."}'::jsonb
  WHERE show_name = 'Campaign Asia Women Leading Change';

-- Dynamic-show names that ALSO have a legacy show_profiles row (judging_philosophy
-- content lives here too) -- kept in sync with the dynamic_shows seed below so
-- either table resolves to the same facet regardless of which one a future
-- reader consults. Kind/geo_scope only match the AGENCY TITLES / specialist
-- lane rules; see the dynamic_shows block for the authoritative comment.
UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"creative_fame","discipline":"creative","geo_scope":"global","discipline_note":"Journalist-judged since 1987; arguable specialist given the unique jury cut -- placed fame because the reputation it buys is general-creative."}'::jsonb
  WHERE show_name = 'Epica Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"digital","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Webby Awards';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"global","discipline_note":"Multi-discipline three-pillar judging (Planning/Execution/Results), weighting adjusted by discipline; global/UK-lean."}'::jsonb
  WHERE show_name = 'The Drum Awards Festival';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"global","discipline_note":"Separate all-indie jury, indie-only eligibility -- a perspective/eligibility cut, not geographic."}'::jsonb
  WHERE show_name = 'One Show Indies';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national","discipline_note":"Editorial endorsement (Adweek staff, no external jury) -- a different validation mechanism than the Campaign titles."}'::jsonb
  WHERE show_name = 'Adweek Agency of the Year';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Campaign Global Agency of the Year';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national"}'::jsonb
  WHERE show_name = 'Campaign UK Agency of the Year';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national"}'::jsonb
  WHERE show_name = 'Campaign US Agency of the Year';

UPDATE public.show_profiles SET planner_facets =
  '{"kind":"agency_title","geo_scope":"global","discipline_note":"TNO''s show; indie-only, peer-judged. Natural first coverage addition, obvious TNO-funnel tie."}'::jsonb
  WHERE show_name = 'The Indie Awards';

-- Tangrams: NO show-level profile row exists on file. Per the spec, seed ONLY
-- if a quick live check supports the media/effectiveness placement. WEB-VERIFIED
-- this session (campaignasia.com, antaranews.com, tangrams.asia -- NOT a live
-- show_profiles row, so this is a facts-hygiene-flagged placement, not a
-- profile-grounded one): Tangrams (formerly the Asian Marketing Effectiveness
-- Awards) merged into Spikes Asia in 2022 as the Strategy & Effectiveness Spike,
-- covering Effectiveness / Media Strategy / Digital Strategy / Data & Analytics /
-- eCommerce. There is no show_profiles row named 'Tangrams' to attach this to --
-- ENTRY_FEES has a 'Tangrams' key that says "N/A -- integrated into Spikes Asia,
-- use Spikes Asia Strategy & Effectiveness Spike" instead of a standalone entry
-- fee. Recorded here as a comment only; nothing UPDATEd, and no new show_profiles
-- row invented for it (a real "show-level profile" gate is exactly what the
-- spec's TANGRAMS EXCEPTION says not to skip). Flag for Ben: since Tangrams has
-- functionally merged into Spikes Asia, the planner should probably route a
-- Tangrams-target user to the existing 'Spikes Asia' facet row (specialist/
-- creative/regional) rather than seed a phantom standalone show -- a P2/lib
-- decision, not a P1 schema one.

COMMIT;

-- ============================================================================
-- SEED: dynamic_shows.planner_facets
-- The spec's explicit "dynamic-show facets" list: Epica, Webby, The Drum,
-- One Show Indies, the four Agency-of-the-Year dynamic rows, The Indie Awards.
-- Same facet values as the show_profiles UPDATEs above (kept byte-consistent
-- above), seeded here because dynamic_shows is the table without a facets
-- column at all until this migration.
-- ============================================================================

BEGIN;

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"work","axis":"creative_fame","discipline":"creative","geo_scope":"global","discipline_note":"Journalist-judged since 1987; arguable specialist given the unique jury cut -- placed fame because the reputation it buys is general-creative."}'::jsonb
  WHERE show_name = 'Epica Awards';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"digital","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Webby Awards';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"global","discipline_note":"Multi-discipline three-pillar judging (Planning/Execution/Results), weighting adjusted by discipline; global/UK-lean."}'::jsonb
  WHERE show_name = 'The Drum Awards Festival';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"work","axis":"specialist","discipline":"creative","geo_scope":"global","discipline_note":"Separate all-indie jury, indie-only eligibility -- a perspective/eligibility cut, not geographic."}'::jsonb
  WHERE show_name = 'One Show Indies';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national","discipline_note":"Editorial endorsement (Adweek staff, no external jury) -- a different validation mechanism than the Campaign titles."}'::jsonb
  WHERE show_name = 'Adweek Agency of the Year';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"agency_title","geo_scope":"global"}'::jsonb
  WHERE show_name = 'Campaign Global Agency of the Year';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national"}'::jsonb
  WHERE show_name = 'Campaign UK Agency of the Year';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"agency_title","geo_scope":"national"}'::jsonb
  WHERE show_name = 'Campaign US Agency of the Year';

UPDATE public.dynamic_shows SET planner_facets =
  '{"kind":"agency_title","geo_scope":"global","discipline_note":"TNO''s show; indie-only, peer-judged. Natural first coverage addition, obvious TNO-funnel tie."}'::jsonb
  WHERE show_name = 'The Indie Awards';

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only; run after the above, not part of the transaction)
-- ============================================================================
-- Confirms: new columns exist; row counts of mapped vs deliberately-unmapped
-- shows in show_profiles/dynamic_shows; no planner_facets row carries a rate
-- key (win_rate/shortlist_rate/odds) by construction (grep the JSON keys).
--
-- SELECT show_name, planner_facets FROM show_profiles WHERE planner_facets IS NOT NULL ORDER BY show_name;
-- SELECT show_name, planner_facets FROM dynamic_shows WHERE planner_facets IS NOT NULL ORDER BY show_name;
-- SELECT DISTINCT show_name FROM show_profiles WHERE planner_facets IS NULL ORDER BY show_name; -- expect African Cristal Festival, AWARD Awards, WARC Awards (deliberately unmapped) + any show not in the v2 table
