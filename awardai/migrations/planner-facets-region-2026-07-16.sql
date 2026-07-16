-- Migration: planner_v2_facet_region  (P2.1 revision #6)
-- Portfolio Planner v2 — add a structured `region` to every seeded
-- planner_facets row so derivePlan can gate national/regional shows by the
-- user's market. Before this, region was inert in allocation and a China
-- agency was offered PRCA UK / SABRE North America / Campaign UK+US AOY.
--
-- STEP 0 (verified live via the same query this migration was written from):
--   show_profiles.planner_facets / dynamic_shows.planner_facets EXIST (P1).
--   No row carried a `region` key yet. This migration MERGES `region` into the
--   existing jsonb (|| concat) — it does not overwrite kind/axis/discipline/
--   geo_scope/excluded, and it is additive + idempotent (re-running sets the
--   same value).
--
-- region uses the PlannerRegion enum = ShowDeadline.region
--   ('Global'|'APAC'|'MENA'|'China'|'Europe'|'Australia'|'North America').
-- These are the AUTHORITATIVE editorial regions for planner eligibility,
-- corrected where DEADLINES_2026.region is wrong for this purpose:
--   * PRCA UK Awards: DEADLINES tags 'Global' — it is a UK-NATIONAL show -> Europe.
--   * ROI Festival: DEADLINES tags 'Global' — it is China's 金投赏, national -> China.
-- Global-scope shows carry region 'Global'. `market` (finer sub-market, e.g.
-- 'UK'/'US') is seeded on the four US/UK national titles as the future seam; v1
-- gates at the coarse PlannerRegion level and does not read `market`.
--
-- FLAG FOR BEN: 'Festival of Media' is the generic profile row (the family has
-- APAC / Global / LATAM editions). Seeded 'APAC' here (the DEADLINES row present
-- is 'Festival of Media APAC'). If the intent is the Global edition, change to
-- 'Global'. Called out in the P2.1 close.
--
-- planner_facets NEVER carries a rate/odds field. This migration adds none.
-- ============================================================================

BEGIN;

-- ── GLOBAL (region 'Global' — always eligible for every market) ──────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"Global"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN (
    'Campaign Global Agency of the Year','The Indie Awards','ANDY Awards','Cannes Lions',
    'Clio Awards','Clio Creators','Clio Entertainment','Clio Sports','D&AD','Epica Awards',
    'Gerety Awards','Global SABRE Awards','ICCO Global Awards','London International Awards',
    'MMA Smarties','New York Festivals Advertising Awards','One Show','One Show Indies',
    'The Drum Awards Festival','Webby Awards');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"Global"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN (
    'Campaign Global Agency of the Year','The Indie Awards','ANDY Awards','Cannes Lions',
    'Clio Awards','Clio Creators','Clio Entertainment','Clio Sports','D&AD','Epica Awards',
    'Gerety Awards','Global SABRE Awards','ICCO Global Awards','London International Awards',
    'MMA Smarties','New York Festivals Advertising Awards','One Show','One Show Indies',
    'The Drum Awards Festival','Webby Awards');

-- ── APAC (regional) ──────────────────────────────────────────────────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"APAC"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN (
    'Campaign Asia Agency of the Year','Campaign Asia Women Leading Change',
    'Campaign Asia Women to Watch APAC','ADFEST','Effie APAC','Festival of Media',
    'PRCA APAC Awards','SABRE Awards Asia-Pacific','Spikes Asia');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"APAC"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN (
    'Campaign Asia Agency of the Year','Campaign Asia Women Leading Change',
    'Campaign Asia Women to Watch APAC','ADFEST','Effie APAC','Festival of Media',
    'PRCA APAC Awards','SABRE Awards Asia-Pacific','Spikes Asia');

-- ── MENA (regional) ──────────────────────────────────────────────────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"MENA"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Dubai Lynx','Loeries');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"MENA"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Dubai Lynx','Loeries');

-- ── Europe (regional + UK-national) ──────────────────────────────────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"Europe"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Eurobest','SABRE Awards EMEA');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"Europe"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Eurobest','SABRE Awards EMEA');
-- UK-national titles (region Europe + market UK).
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"Europe","market":"UK"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('PRCA UK Awards','Campaign UK Agency of the Year');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"Europe","market":"UK"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('PRCA UK Awards','Campaign UK Agency of the Year');

-- ── North America (regional + US-national) ───────────────────────────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"North America"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('SABRE Awards North America');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"North America"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('SABRE Awards North America');
-- US-national titles (region North America + market US).
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"North America","market":"US"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Adweek Agency of the Year','Campaign US Agency of the Year');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"North America","market":"US"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('Adweek Agency of the Year','Campaign US Agency of the Year');

-- ── China (national) ─────────────────────────────────────────────────────────
UPDATE public.show_profiles SET planner_facets = planner_facets || '{"region":"China"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('ROI Festival');
UPDATE public.dynamic_shows SET planner_facets = planner_facets || '{"region":"China"}'::jsonb
  WHERE planner_facets IS NOT NULL AND show_name IN ('ROI Festival');

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT): every non-global-scope facet must now have a region.
--   SELECT show_name, planner_facets->>'geo_scope' AS geo, planner_facets->>'region' AS region
--   FROM public.show_profiles
--   WHERE planner_facets IS NOT NULL AND planner_facets->>'geo_scope' <> 'global'
--     AND planner_facets->>'region' IS NULL;   -- expect 0 rows
-- (repeat for dynamic_shows)
-- ============================================================================
