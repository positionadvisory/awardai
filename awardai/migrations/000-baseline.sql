-- ============================================================================
-- 000-baseline.sql — Shortlist live database baseline (audit DM-01)
--
-- Generated 11 June 2026 (Session 51) from the production Supabase instance
-- via migrations/000-baseline-generator.sql (catalog reconstruction).
--
-- This is the FIRST complete record of the live public schema. Until this
-- file, core-table DDL existed only in production. It is a point-in-time
-- snapshot: regenerate after schema changes, and replace with a real
-- `supabase db dump --schema public` once the CLI is set up.
--
-- DO NOT RUN against production (everything in it already exists there).
-- Purpose: disaster recovery, staging setup, and drift detection.
--
-- Post-generation cleanup applied (Session 51, run live same day):
--   - get_org_features() dropped (referenced tables removed by DM-13; no callers)
--   - full-table grants to anon/authenticated revoked on jury_records,
--     platform_invitations, show_requests (RLS already denied; trapdoor removed)
-- ============================================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_cron";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE EXTENSION IF NOT EXISTS "supabase_vault";

CREATE EXTENSION IF NOT EXISTS "unaccent";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS "vector";


-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE agency_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  org_id bigint NOT NULL,
  agency_name text,
  agency_city text,
  credentials_summary text,
  strategic_approach text,
  sector_focus text[],
  results_language_notes text,
  typical_clients text,
  awards_heritage text,
  raw_credentials_text text,
  profile_version integer DEFAULT 1,
  generated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cost_defaults jsonb,
  org_type text DEFAULT 'agency'::text NOT NULL,
  logo_url text,
  website_url text,
  pr_contact_name text,
  pr_contact_email text,
  pr_contact_phone text,
  linkedin_url text,
  x_handle text,
  instagram_handle text,
  tagline text,
  office_locations text[],
  brand_colors jsonb,
  in_house_team_name text,
  agency_partner_names text[]
);

CREATE TABLE articles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  content text DEFAULT ''::text NOT NULL,
  cover_image_url text,
  reading_time_minutes integer GENERATED ALWAYS AS (GREATEST(1, (length(content) / 1000))) STORED,
  published boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE award_shows (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  organiser text,
  region text DEFAULT 'Global'::text,
  website text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE award_tiers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_id bigint NOT NULL,
  name text NOT NULL,
  rank integer DEFAULT 1 NOT NULL
);

CREATE TABLE campaign_awards (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  campaign_id bigint NOT NULL,
  show_id bigint NOT NULL,
  year smallint NOT NULL,
  tier_id bigint,
  category text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE campaign_tags (
  campaign_id bigint NOT NULL,
  tag text NOT NULL
);

CREATE TABLE campaigns (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  campaign_name text NOT NULL,
  slug text NOT NULL,
  show_id bigint,
  show_raw text NOT NULL,
  year smallint,
  award_tier text,
  award_category text,
  client text,
  agency text,
  market text,
  what text,
  insight text,
  win_factor text,
  results text,
  embedding vector(384),
  source text DEFAULT 'manual'::text,
  source_url text,
  verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  search_vector tsvector
);

CREATE TABLE directions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint NOT NULL,
  name text NOT NULL,
  angle text,
  best_show text,
  best_category text,
  win_likelihood integer,
  likelihood_rationale text,
  strengths text,
  risks text,
  hook text,
  chosen boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  org_id bigint,
  created_by uuid,
  model_used text,
  tokens_used integer,
  uuid uuid DEFAULT gen_random_uuid() NOT NULL,
  submitted boolean DEFAULT false,
  submission_outcome text,
  outcome_confirmed_at timestamp with time zone,
  outcome_notes text
);

CREATE TABLE dynamic_shows (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_name text NOT NULL,
  show_url text,
  market text,
  deadline_date date,
  deadline_label text,
  entry_fee_range text,
  categories text[],
  description text,
  industry text DEFAULT 'marketing'::text NOT NULL,
  judging_philosophy text,
  scoring_emphasis text,
  language_guidance text,
  common_mistakes text,
  jury_composition_notes text,
  status text DEFAULT 'active'::text NOT NULL,
  source_request_id bigint,
  added_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  confidence text DEFAULT 'needs_check'::text,
  last_verified_at date
);

CREATE TABLE entry_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  direction_id bigint NOT NULL,
  project_id bigint NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  word_limit integer,
  version_a text,
  version_b text,
  version_c text,
  selected text,
  custom_text text,
  chat_history jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  org_id bigint,
  created_by uuid,
  status text DEFAULT 'draft'::text,
  model_used text,
  tokens_used integer,
  award_show text,
  category text,
  draft_generation integer DEFAULT 1,
  uuid uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE evaluations (
  id bigint DEFAULT nextval('evaluations_id_seq'::regclass) NOT NULL,
  entry_draft_id bigint NOT NULL,
  project_id bigint NOT NULL,
  org_id bigint NOT NULL,
  created_by uuid NOT NULL,
  overall_score numeric(3,1),
  scores jsonb DEFAULT '{}'::jsonb NOT NULL,
  strengths text[],
  gaps text[],
  recommendations text,
  model_used text,
  tokens_used integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  eval_chat_history jsonb DEFAULT '[]'::jsonb,
  evaluation_mode text DEFAULT 'judge'::text,
  changes_analysis text,
  uuid uuid DEFAULT gen_random_uuid() NOT NULL,
  output jsonb
);

CREATE TABLE invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id bigint NOT NULL,
  invited_by uuid NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  token text DEFAULT encode(gen_random_bytes(32), 'hex'::text) NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE jury_cells (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_name text NOT NULL,
  year integer NOT NULL,
  category text NOT NULL,
  n_jurors integer,
  n_repeat_jurors integer,
  top_region text,
  top_region_share text,
  region_breakdown jsonb,
  president_region text,
  president_country text,
  president_is_repeat boolean,
  philosophy_cluster text,
  winner_regions text[],
  winner_countries text[],
  n_grand_prix integer DEFAULT 0,
  n_gold integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE jury_president_uplift (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  president_region text NOT NULL,
  n_cells integer,
  cells_with_pres_region_wins integer,
  pct_wins text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE jury_records (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_name text NOT NULL,
  year integer NOT NULL,
  category text NOT NULL,
  full_name text,
  title text,
  company text,
  city text,
  country text,
  region text,
  western_flag text,
  sector text,
  is_president boolean DEFAULT false,
  confidence text,
  source_url text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE jury_regional_uplift (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  region text NOT NULL,
  cells_as_top_juror integer,
  cells_with_region_in_winners integer,
  pct_when_top_juror text,
  baseline_pct text,
  uplift_points integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE monthly_usage (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id bigint NOT NULL,
  period_year smallint NOT NULL,
  period_month smallint NOT NULL,
  entries_generated integer DEFAULT 0 NOT NULL,
  evaluations_run integer DEFAULT 0 NOT NULL,
  edits_run integer DEFAULT 0 NOT NULL,
  video_scripts_generated integer DEFAULT 0 NOT NULL,
  directions_generated integer DEFAULT 0 NOT NULL,
  budget_analyses_run integer DEFAULT 0 NOT NULL,
  kb_uploads integer DEFAULT 0 NOT NULL,
  total_ai_tokens_used bigint DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE organizations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  plan text DEFAULT 'free'::text,
  stripe_customer_id text,
  max_projects integer DEFAULT 5,
  max_kb_access integer DEFAULT 500,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  trial_unlimited boolean DEFAULT false NOT NULL,
  payment_failed_at timestamp with time zone,
  max_seats integer DEFAULT 1 NOT NULL
);

CREATE TABLE platform_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  token text DEFAULT encode(gen_random_bytes(16), 'hex'::text) NOT NULL,
  invited_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  used_at timestamp with time zone
);

CREATE TABLE press_kit_drafts (
  id bigint DEFAULT nextval('press_kit_drafts_id_seq'::regclass) NOT NULL,
  project_id bigint NOT NULL,
  direction_id bigint NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  version_a text,
  version_b text,
  version_c text,
  selected text DEFAULT 'a'::text NOT NULL,
  custom_text text,
  press_target text,
  model_used text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE profiles (
  id uuid NOT NULL,
  full_name text,
  email text,
  avatar_url text,
  org_id bigint,
  role text DEFAULT 'member'::text,
  onboarded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE project_collaborators (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint NOT NULL,
  org_id bigint NOT NULL,
  collaborator_name text NOT NULL,
  collaborator_type text DEFAULT 'creative_agency'::text NOT NULL,
  contact_name text,
  contact_email text,
  logo_url text,
  website_url text,
  is_lead_credit boolean DEFAULT false NOT NULL,
  credit_order integer DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE projects (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  org_id bigint,
  campaign_name text DEFAULT 'Untitled Project'::text NOT NULL,
  client_name text,
  target_shows text[] DEFAULT '{}'::text[],
  materials jsonb DEFAULT '[]'::jsonb,
  combined_text text,
  script_text text,
  script_analysis jsonb,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  uuid uuid DEFAULT gen_random_uuid() NOT NULL,
  award_year integer,
  tonal_brief jsonb
);

CREATE TABLE show_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_name text NOT NULL,
  category_pattern text,
  judging_philosophy text NOT NULL,
  scoring_emphasis text,
  language_guidance text,
  common_mistakes text,
  jury_composition_notes text,
  base_win_rate numeric(5,2) DEFAULT NULL::numeric,
  last_updated date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  medal_culture text,
  resonant_language text,
  red_flag_language text,
  gold_standard_profile text
);

CREATE TABLE show_requests (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  show_name text,
  show_url text,
  market text,
  entry_kit_url text,
  project_id bigint,
  requested_by uuid,
  org_id bigint,
  status text DEFAULT 'pending'::text NOT NULL,
  research_result jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE stripe_webhook_events (
  event_id text NOT NULL,
  event_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE usage_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  org_id bigint,
  action text NOT NULL,
  model text DEFAULT 'claude-sonnet-4-5-20250514'::text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);


-- ============================================================
-- CONSTRAINTS (PK, UNIQUE, CHECK, then FK)
-- ============================================================

ALTER TABLE agency_profiles ADD CONSTRAINT agency_profiles_pkey PRIMARY KEY (id);

ALTER TABLE agency_profiles ADD CONSTRAINT agency_profiles_org_id_unique UNIQUE (org_id);

ALTER TABLE agency_profiles ADD CONSTRAINT agency_profiles_org_type_check CHECK ((org_type = ANY (ARRAY['agency'::text, 'brand'::text, 'production_company'::text, 'media_agency'::text, 'consultancy'::text])));

ALTER TABLE agency_profiles ADD CONSTRAINT agency_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE articles ADD CONSTRAINT articles_pkey PRIMARY KEY (id);

ALTER TABLE articles ADD CONSTRAINT articles_slug_key UNIQUE (slug);

ALTER TABLE award_shows ADD CONSTRAINT award_shows_pkey PRIMARY KEY (id);

ALTER TABLE award_shows ADD CONSTRAINT award_shows_slug_key UNIQUE (slug);

ALTER TABLE award_tiers ADD CONSTRAINT award_tiers_pkey PRIMARY KEY (id);

ALTER TABLE award_tiers ADD CONSTRAINT award_tiers_show_id_name_key UNIQUE (show_id, name);

ALTER TABLE award_tiers ADD CONSTRAINT award_tiers_show_id_fkey FOREIGN KEY (show_id) REFERENCES award_shows(id);

ALTER TABLE campaign_awards ADD CONSTRAINT campaign_awards_pkey PRIMARY KEY (id);

ALTER TABLE campaign_awards ADD CONSTRAINT campaign_awards_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE campaign_awards ADD CONSTRAINT campaign_awards_show_id_fkey FOREIGN KEY (show_id) REFERENCES award_shows(id);

ALTER TABLE campaign_awards ADD CONSTRAINT campaign_awards_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES award_tiers(id);

ALTER TABLE campaign_tags ADD CONSTRAINT campaign_tags_pkey PRIMARY KEY (campaign_id, tag);

ALTER TABLE campaign_tags ADD CONSTRAINT campaign_tags_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE campaigns ADD CONSTRAINT campaigns_slug_key UNIQUE (slug);

ALTER TABLE campaigns ADD CONSTRAINT campaigns_show_id_fkey FOREIGN KEY (show_id) REFERENCES award_shows(id);

ALTER TABLE directions ADD CONSTRAINT directions_pkey PRIMARY KEY (id);

ALTER TABLE directions ADD CONSTRAINT directions_uuid_key UNIQUE (uuid);

ALTER TABLE directions ADD CONSTRAINT directions_submission_outcome_check CHECK (((submission_outcome IS NULL) OR (submission_outcome = ANY (ARRAY['shortlisted'::text, 'finalist'::text, 'winner'::text, 'no_place'::text]))));

ALTER TABLE directions ADD CONSTRAINT directions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE directions ADD CONSTRAINT directions_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE directions ADD CONSTRAINT directions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE dynamic_shows ADD CONSTRAINT dynamic_shows_pkey PRIMARY KEY (id);

ALTER TABLE dynamic_shows ADD CONSTRAINT dynamic_shows_show_name_key UNIQUE (show_name);

ALTER TABLE dynamic_shows ADD CONSTRAINT dynamic_shows_confidence_check CHECK ((confidence = ANY (ARRAY['verified'::text, 'estimated'::text, 'needs_check'::text])));

ALTER TABLE dynamic_shows ADD CONSTRAINT dynamic_shows_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE dynamic_shows ADD CONSTRAINT dynamic_shows_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES show_requests(id) ON DELETE SET NULL;

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_pkey PRIMARY KEY (id);

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_uuid_key UNIQUE (uuid);

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_selected_check CHECK ((selected = ANY (ARRAY['a'::text, 'b'::text, 'c'::text, 'custom'::text])));

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_direction_id_fkey FOREIGN KEY (direction_id) REFERENCES directions(id) ON DELETE CASCADE;

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE entry_drafts ADD CONSTRAINT entry_drafts_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE evaluations ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);

ALTER TABLE evaluations ADD CONSTRAINT evaluations_uuid_key UNIQUE (uuid);

ALTER TABLE evaluations ADD CONSTRAINT evaluations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE evaluations ADD CONSTRAINT evaluations_entry_draft_id_fkey FOREIGN KEY (entry_draft_id) REFERENCES entry_drafts(id) ON DELETE CASCADE;

ALTER TABLE evaluations ADD CONSTRAINT evaluations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE evaluations ADD CONSTRAINT evaluations_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE invitations ADD CONSTRAINT invitations_token_key UNIQUE (token);

ALTER TABLE invitations ADD CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text])));

ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);

ALTER TABLE invitations ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE jury_cells ADD CONSTRAINT jury_cells_pkey PRIMARY KEY (id);

ALTER TABLE jury_cells ADD CONSTRAINT jury_cells_show_name_year_category_key UNIQUE (show_name, year, category);

ALTER TABLE jury_cells ADD CONSTRAINT jury_cells_unique UNIQUE (show_name, year, category);

ALTER TABLE jury_president_uplift ADD CONSTRAINT jury_president_uplift_pkey PRIMARY KEY (id);

ALTER TABLE jury_president_uplift ADD CONSTRAINT jury_president_uplift_president_region_key UNIQUE (president_region);

ALTER TABLE jury_president_uplift ADD CONSTRAINT jury_president_uplift_unique UNIQUE (president_region);

ALTER TABLE jury_records ADD CONSTRAINT jury_records_pkey PRIMARY KEY (id);

ALTER TABLE jury_records ADD CONSTRAINT jury_records_unique UNIQUE (show_name, year, category, full_name);

ALTER TABLE jury_regional_uplift ADD CONSTRAINT jury_regional_uplift_pkey PRIMARY KEY (id);

ALTER TABLE jury_regional_uplift ADD CONSTRAINT jury_regional_uplift_region_key UNIQUE (region);

ALTER TABLE jury_regional_uplift ADD CONSTRAINT jury_regional_uplift_unique UNIQUE (region);

ALTER TABLE monthly_usage ADD CONSTRAINT monthly_usage_pkey PRIMARY KEY (id);

ALTER TABLE monthly_usage ADD CONSTRAINT monthly_usage_org_id_period_year_period_month_key UNIQUE (org_id, period_year, period_month);

ALTER TABLE monthly_usage ADD CONSTRAINT monthly_usage_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

ALTER TABLE organizations ADD CONSTRAINT organizations_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text, 'super_admin'::text])));

ALTER TABLE platform_invitations ADD CONSTRAINT platform_invitations_pkey PRIMARY KEY (id);

ALTER TABLE platform_invitations ADD CONSTRAINT platform_invitations_token_key UNIQUE (token);

ALTER TABLE platform_invitations ADD CONSTRAINT platform_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE press_kit_drafts ADD CONSTRAINT press_kit_drafts_pkey PRIMARY KEY (id);

ALTER TABLE press_kit_drafts ADD CONSTRAINT press_kit_drafts_direction_id_field_key_key UNIQUE (direction_id, field_key);

ALTER TABLE press_kit_drafts ADD CONSTRAINT press_kit_drafts_direction_id_fkey FOREIGN KEY (direction_id) REFERENCES directions(id) ON DELETE CASCADE;

ALTER TABLE press_kit_drafts ADD CONSTRAINT press_kit_drafts_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])));

ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE project_collaborators ADD CONSTRAINT project_collaborators_pkey PRIMARY KEY (id);

ALTER TABLE project_collaborators ADD CONSTRAINT project_collaborators_collaborator_type_check CHECK ((collaborator_type = ANY (ARRAY['lead_agency'::text, 'creative_agency'::text, 'media_agency'::text, 'production_company'::text, 'pr_agency'::text, 'brand_team'::text, 'tech_partner'::text, 'other'::text])));

ALTER TABLE project_collaborators ADD CONSTRAINT project_collaborators_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE project_collaborators ADD CONSTRAINT project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE projects ADD CONSTRAINT projects_uuid_key UNIQUE (uuid);

ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'analyzing'::text, 'directions'::text, 'drafting'::text, 'complete'::text, 'archived'::text])));

ALTER TABLE projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE show_profiles ADD CONSTRAINT show_profiles_pkey PRIMARY KEY (id);

ALTER TABLE show_requests ADD CONSTRAINT show_requests_pkey PRIMARY KEY (id);

ALTER TABLE show_requests ADD CONSTRAINT show_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE show_requests ADD CONSTRAINT show_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE show_requests ADD CONSTRAINT show_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE stripe_webhook_events ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (event_id);

ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_pkey PRIMARY KEY (id);

ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX campaigns_embedding_ivfflat_idx ON public.campaigns USING ivfflat (embedding vector_cosine_ops) WITH (lists='30');

CREATE INDEX campaigns_search_idx ON public.campaigns USING gin (search_vector);

CREATE INDEX directions_org_id_idx ON public.directions USING btree (org_id);

CREATE INDEX directions_project_id_idx ON public.directions USING btree (project_id);

CREATE INDEX entry_drafts_direction_id_idx ON public.entry_drafts USING btree (direction_id);

CREATE INDEX entry_drafts_org_id_idx ON public.entry_drafts USING btree (org_id);

CREATE INDEX entry_drafts_project_id_idx ON public.entry_drafts USING btree (project_id);

CREATE INDEX evaluations_entry_draft_id_idx ON public.evaluations USING btree (entry_draft_id);

CREATE INDEX evaluations_org_id_idx ON public.evaluations USING btree (org_id);

CREATE INDEX evaluations_project_id_idx ON public.evaluations USING btree (project_id);

CREATE INDEX idx_campaigns_agency ON public.campaigns USING gin (agency gin_trgm_ops);

CREATE INDEX idx_campaigns_client ON public.campaigns USING gin (client gin_trgm_ops);

CREATE INDEX idx_campaigns_fts ON public.campaigns USING gin (to_tsvector('english'::regconfig, ((((((((((((COALESCE(campaign_name, ''::text) || ' '::text) || COALESCE(client, ''::text)) || ' '::text) || COALESCE(agency, ''::text)) || ' '::text) || COALESCE(what, ''::text)) || ' '::text) || COALESCE(insight, ''::text)) || ' '::text) || COALESCE(win_factor, ''::text)) || ' '::text) || COALESCE(results, ''::text))));

CREATE INDEX idx_campaigns_market ON public.campaigns USING btree (market);

CREATE INDEX idx_campaigns_name_trgm ON public.campaigns USING gin (campaign_name gin_trgm_ops);

CREATE INDEX idx_campaigns_show ON public.campaigns USING btree (show_id);

CREATE INDEX idx_campaigns_year ON public.campaigns USING btree (year);

CREATE INDEX idx_invitations_email ON public.invitations USING btree (email) WHERE (accepted_at IS NULL);

CREATE INDEX idx_invitations_org ON public.invitations USING btree (org_id);

CREATE INDEX idx_invitations_token ON public.invitations USING btree (token) WHERE (accepted_at IS NULL);

CREATE INDEX idx_project_collaborators_org_id ON public.project_collaborators USING btree (org_id);

CREATE INDEX idx_project_collaborators_project_id ON public.project_collaborators USING btree (project_id);

CREATE INDEX idx_projects_org ON public.projects USING btree (org_id);

CREATE INDEX idx_projects_status ON public.projects USING btree (status);

CREATE INDEX idx_projects_user ON public.projects USING btree (user_id);

CREATE INDEX idx_usage_action ON public.usage_logs USING btree (action, created_at DESC);

CREATE INDEX idx_usage_org ON public.usage_logs USING btree (org_id, created_at DESC);

CREATE INDEX idx_usage_user ON public.usage_logs USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX invitations_pending_org_email_uniq ON public.invitations USING btree (org_id, lower(email)) WHERE (accepted_at IS NULL);

CREATE INDEX platform_invitations_email_idx ON public.platform_invitations USING btree (email);

CREATE INDEX platform_invitations_token_idx ON public.platform_invitations USING btree (token);

CREATE INDEX press_kit_drafts_direction_idx ON public.press_kit_drafts USING btree (direction_id);

CREATE INDEX press_kit_drafts_project_idx ON public.press_kit_drafts USING btree (project_id);

CREATE INDEX projects_org_id_idx ON public.projects USING btree (org_id);

CREATE UNIQUE INDEX show_profiles_show_cat_nnd_uniq ON public.show_profiles USING btree (show_name, category_pattern) NULLS NOT DISTINCT;

CREATE INDEX show_profiles_show_name_idx ON public.show_profiles USING btree (show_name);

CREATE INDEX show_requests_status_idx ON public.show_requests USING btree (status);

CREATE INDEX stripe_webhook_events_created_idx ON public.stripe_webhook_events USING btree (created_at);

CREATE INDEX usage_logs_org_action_created_idx ON public.usage_logs USING btree (org_id, action, created_at DESC);


-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.bulk_insert_campaigns(data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  rec jsonb;
  cnt integer := 0;
  sid bigint;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(data)
  LOOP
    SELECT id INTO sid FROM public.award_shows WHERE slug = (rec->>'show_slug');
    
    INSERT INTO public.campaigns (
      campaign_name, slug, show_id, show_raw, year, award_tier, award_category,
      client, agency, market, what, insight, win_factor, results, source, verified
    ) VALUES (
      rec->>'campaign_name', rec->>'slug', sid, rec->>'show_raw',
      (rec->>'year')::smallint, rec->>'award_tier', rec->>'award_category',
      rec->>'client', rec->>'agency', rec->>'market',
      rec->>'what', rec->>'insight', rec->>'win_factor', rec->>'results',
      'import', true
    )
    ON CONFLICT (slug) DO NOTHING;
    
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.campaigns_search_vector(c campaigns)
 RETURNS tsvector
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT
    setweight(to_tsvector('english', coalesce(c.campaign_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(c.client, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(c.agency, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(c.award_category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(c.market, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(c.insight, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(c.win_factor, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(c.results, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(c.what, '')), 'D')
$function$
;

CREATE OR REPLACE FUNCTION public.campaigns_search_vector_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_vector := campaigns_search_vector(NEW);
  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_project_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max   int;
  v_trial boolean;
  v_count int;
BEGIN
  SELECT max_projects, trial_unlimited
  INTO   v_max, v_trial
  FROM   organizations
  WHERE  id = NEW.org_id;

  -- Fail open: missing org row or NULL limit never blocks an insert
  IF v_trial IS TRUE OR v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count FROM projects WHERE org_id = NEW.org_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Your plan includes up to % active projects. Delete a project to free a slot, or contact ben@positionadvisory.com to raise the limit.', v_max
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_org_award_history(p_org_id bigint, p_show_names text[] DEFAULT NULL::text[], p_year_from integer DEFAULT NULL::integer, p_limit integer DEFAULT 6)
 RETURNS TABLE(direction_id bigint, project_id bigint, campaign_name text, client_name text, award_year integer, best_show text, best_category text, angle text, win_likelihood integer, submitted boolean, submission_outcome text, overall_score numeric, evaluation_gaps text[], evaluation_recommendations text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    d.id                                          AS direction_id,
    p.id                                          AS project_id,
    p.campaign_name,
    p.client_name,
    p.award_year,
    d.best_show,
    d.best_category,
    d.angle,
    d.win_likelihood,
    d.submitted,
    d.submission_outcome,
    e.overall_score,
    e.gaps                                        AS evaluation_gaps,
    e.recommendations                             AS evaluation_recommendations
  FROM directions d
  JOIN projects p ON p.id = d.project_id
  -- Most recent evaluation per direction (judge mode preferred)
  LEFT JOIN LATERAL (
    SELECT overall_score, gaps, recommendations
    FROM evaluations ev
    WHERE ev.project_id = p.id
      AND ev.org_id = p.org_id
      AND ev.entry_draft_id IN (
        SELECT id FROM entry_drafts WHERE direction_id = d.id
      )
    ORDER BY
      CASE WHEN ev.evaluation_mode = 'judge' THEN 0 ELSE 1 END,
      ev.created_at DESC
    LIMIT 1
  ) e ON true
  WHERE p.org_id = p_org_id
    AND (p_show_names IS NULL OR d.best_show = ANY(p_show_names))
    AND (p_year_from IS NULL OR p.award_year >= p_year_from)
    -- Exclude quick-eval placeholder directions
    AND d.angle != 'Uploaded entry — direct evaluation'
  ORDER BY p.award_year DESC NULLS LAST, e.overall_score DESC NULLS LAST
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id    bigint;
  invite_org_id bigint;
  invite_role   text;
  base_slug     text;
  final_slug    text;
  counter       int := 0;
  display_name  text;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Check for a pending, unexpired invitation for this email
  SELECT org_id, role
    INTO invite_org_id, invite_role
    FROM public.invitations
   WHERE email       = NEW.email
     AND accepted_at IS NULL
     AND expires_at  > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF invite_org_id IS NOT NULL THEN
    -- ── Invited path: join the existing org ──────────────────────────────────
    INSERT INTO public.profiles (id, email, full_name, org_id, role)
    VALUES (NEW.id, NEW.email, display_name, invite_org_id, COALESCE(invite_role, 'member'));

    -- Stamp the invitation as accepted
    UPDATE public.invitations
       SET accepted_at = now()
     WHERE email   = NEW.email
       AND org_id  = invite_org_id
       AND accepted_at IS NULL;

  ELSE
    -- ── Fresh signup: create a brand-new org ─────────────────────────────────
    base_slug  := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g'));
    final_slug := base_slug;

    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
      counter    := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    INSERT INTO public.organizations (name, slug)
    VALUES (display_name || '''s Workspace', final_slug)
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, email, full_name, org_id, role)
    VALUES (NEW.id, NEW.email, display_name, new_org_id, 'owner');

  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_campaigns(data jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  row_count integer := 0;
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(data)
  LOOP
    INSERT INTO campaigns (campaign_name, slug, show_id, show_raw, year, award_tier, award_category, client, agency, market, what, insight, win_factor, results, source, verified)
    VALUES (
      item->>'campaign_name',
      item->>'slug',
      (item->>'show_id')::integer,
      COALESCE(item->>'show_raw', ''),
      (item->>'year')::integer,
      item->>'award_tier',
      item->>'award_category',
      item->>'client',
      item->>'agency',
      item->>'market',
      item->>'what',
      item->>'insight',
      item->>'win_factor',
      item->>'results',
      'import',
      true
    )
    ON CONFLICT (slug) DO NOTHING;
    row_count := row_count + 1;
  END LOOP;
  RETURN row_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_usage(p_org_id bigint, p_counter text, p_tokens bigint DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO monthly_usage (org_id, period_year, period_month)
  VALUES (
    p_org_id,
    EXTRACT(year  FROM now())::smallint,
    EXTRACT(month FROM now())::smallint
  )
  ON CONFLICT (org_id, period_year, period_month) DO NOTHING;

  EXECUTE format(
    'UPDATE monthly_usage
     SET %I = %I + 1,
         total_ai_tokens_used = total_ai_tokens_used + $1,
         updated_at = now()
     WHERE org_id = $2
       AND period_year  = EXTRACT(year  FROM now())::smallint
       AND period_month = EXTRACT(month FROM now())::smallint',
    p_counter, p_counter
  ) USING p_tokens, p_org_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_campaigns(query_embedding vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 20, filter_show_id bigint DEFAULT NULL::bigint, filter_year smallint DEFAULT NULL::smallint, filter_market text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, campaign_name text, client text, agency text, market text, show_raw text, year smallint, what text, insight text, win_factor text, results text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select c.id, c.campaign_name, c.client, c.agency, c.market, c.show_raw, c.year,
    c.what, c.insight, c.win_factor, c.results,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.campaigns c
  where 1 - (c.embedding <=> query_embedding) > match_threshold
    and (filter_show_id is null or c.show_id = filter_show_id)
    and (filter_year    is null or c.year    = filter_year)
    and (filter_market  is null or c.market  ilike '%' || filter_market || '%')
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.org_usage_last_hour(p_org_id bigint, p_action text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT trial_unlimited FROM public.organizations WHERE id = p_org_id) THEN 0
    ELSE (
      SELECT COUNT(*)::int
        FROM public.usage_logs
       WHERE org_id     = p_org_id
         AND action     = p_action
         AND created_at > now() - interval '1 hour'
    )
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_campaigns(search_query text, result_limit integer DEFAULT 50, filter_show_id bigint DEFAULT NULL::bigint, filter_year smallint DEFAULT NULL::smallint)
 RETURNS TABLE(id bigint, campaign_name text, client text, agency text, show_raw text, year smallint, rank double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select c.id, c.campaign_name, c.client, c.agency, c.show_raw, c.year,
    ts_rank_cd(
      to_tsvector('english',
        coalesce(c.campaign_name,'') || ' ' || coalesce(c.client,'') || ' ' ||
        coalesce(c.agency,'') || ' ' || coalesce(c.what,'') || ' ' ||
        coalesce(c.insight,'') || ' ' || coalesce(c.win_factor,'') || ' ' ||
        coalesce(c.results,'')
      ),
      websearch_to_tsquery('english', search_query)
    ) as rank
  from public.campaigns c
  where to_tsvector('english',
      coalesce(c.campaign_name,'') || ' ' || coalesce(c.client,'') || ' ' ||
      coalesce(c.agency,'') || ' ' || coalesce(c.what,'') || ' ' ||
      coalesce(c.insight,'') || ' ' || coalesce(c.win_factor,'') || ' ' ||
      coalesce(c.results,'')
    ) @@ websearch_to_tsquery('english', search_query)
    and (filter_show_id is null or c.show_id = filter_show_id)
    and (filter_year    is null or c.year    = filter_year)
  order by rank desc
  limit result_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_campaigns(query_text text, show_filter text DEFAULT NULL::text, year_from integer DEFAULT NULL::integer, year_to integer DEFAULT NULL::integer, result_limit integer DEFAULT 10)
 RETURNS TABLE(id bigint, campaign_name text, slug text, show_id bigint, year smallint, award_tier text, award_category text, client text, agency text, market text, what text, insight text, win_factor text, results text, rank real)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id, c.campaign_name, c.slug, c.show_id, c.year,
    c.award_tier, c.award_category, c.client, c.agency, c.market,
    c.what, c.insight, c.win_factor, c.results,
    ts_rank(c.search_vector, websearch_to_tsquery('english', query_text)) AS rank
  FROM campaigns c
  JOIN award_shows s ON s.id = c.show_id
  WHERE c.search_vector @@ websearch_to_tsquery('english', query_text)
    AND (show_filter IS NULL OR s.slug = show_filter)
    AND (year_from IS NULL OR c.year >= year_from)
    AND (year_to IS NULL OR c.year <= year_to)
  ORDER BY rank DESC LIMIT result_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_campaigns_semantic(query_embedding vector, show_filter text DEFAULT NULL::text, result_limit integer DEFAULT 8)
 RETURNS TABLE(id bigint, campaign_name text, agency text, client text, show_raw text, award_category text, award_tier text, year smallint, what text, win_factor text, insight text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id, c.campaign_name, c.agency, c.client, c.show_raw,
    c.award_category, c.award_tier, c.year, c.what, c.win_factor, c.insight,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM campaigns c
  WHERE c.embedding IS NOT NULL
    AND (show_filter IS NULL OR c.show_raw ILIKE '%' || show_filter || '%')
  ORDER BY c.embedding <=> query_embedding
  LIMIT result_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dynamic_shows_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_press_kit_drafts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER articles_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaigns_search_vector_update BEFORE INSERT OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION campaigns_search_vector_trigger();

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER dynamic_shows_updated_at BEFORE UPDATE ON public.dynamic_shows FOR EACH ROW EXECUTE FUNCTION update_dynamic_shows_updated_at();

CREATE TRIGGER entry_drafts_updated_at BEFORE UPDATE ON public.entry_drafts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER press_kit_drafts_updated_at BEFORE UPDATE ON public.press_kit_drafts FOR EACH ROW EXECUTE FUNCTION update_press_kit_drafts_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_enforce_project_limit BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION enforce_project_limit();


-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW admin_org_overview AS
 SELECT o.id,
    o.name,
    o.slug,
    o.plan,
    o.trial_unlimited,
    o.max_projects,
    o.created_at,
    count(DISTINCT p.id) AS member_count,
    string_agg(DISTINCT p.email, ', '::text ORDER BY p.email) AS member_emails,
    count(DISTINCT ul.id) FILTER (WHERE ul.created_at > (now() - '30 days'::interval)) AS usage_last_30d
   FROM organizations o
     LEFT JOIN profiles p ON p.org_id = o.id
     LEFT JOIN usage_logs ul ON ul.org_id = o.id
  GROUP BY o.id, o.name, o.slug, o.plan, o.trial_unlimited, o.max_projects, o.created_at
  ORDER BY o.created_at DESC;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE agency_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

ALTER TABLE award_shows ENABLE ROW LEVEL SECURITY;

ALTER TABLE award_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE campaign_awards ENABLE ROW LEVEL SECURITY;

ALTER TABLE campaign_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE directions ENABLE ROW LEVEL SECURITY;

ALTER TABLE dynamic_shows ENABLE ROW LEVEL SECURITY;

ALTER TABLE entry_drafts ENABLE ROW LEVEL SECURITY;

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE jury_cells ENABLE ROW LEVEL SECURITY;

ALTER TABLE jury_president_uplift ENABLE ROW LEVEL SECURITY;

ALTER TABLE jury_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE jury_regional_uplift ENABLE ROW LEVEL SECURITY;

ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE platform_invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE press_kit_drafts ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE show_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE show_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- POLICIES
-- ============================================================

CREATE POLICY agency_profiles_select_own_org ON agency_profiles AS PERMISSIVE FOR SELECT TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Public can read published articles" ON articles AS PERMISSIVE FOR SELECT TO public USING ((published = true));

CREATE POLICY "Authenticated read" ON award_shows AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON award_tiers AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON campaign_awards AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read" ON campaign_tags AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated users can read campaigns" ON campaigns AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY campaigns_admin_write ON campaigns AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY campaigns_read ON campaigns AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY directions_org_insert ON directions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY directions_org_select ON directions AS PERMISSIVE FOR SELECT TO public USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY directions_org_update ON directions AS PERMISSIVE FOR UPDATE TO public USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY directions_via_project ON directions AS PERMISSIVE FOR ALL TO authenticated USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY "org members can access their directions" ON directions AS PERMISSIVE FOR ALL TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Authenticated users read active dynamic shows" ON dynamic_shows AS PERMISSIVE FOR SELECT TO authenticated USING ((status = 'active'::text));

CREATE POLICY drafts_via_project ON entry_drafts AS PERMISSIVE FOR ALL TO authenticated USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));

CREATE POLICY entry_drafts_org_insert ON entry_drafts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY entry_drafts_org_select ON entry_drafts AS PERMISSIVE FOR SELECT TO public USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY entry_drafts_org_update ON entry_drafts AS PERMISSIVE FOR UPDATE TO public USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.org_id IN ( SELECT profiles.org_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));

CREATE POLICY "org members can access their entry drafts" ON entry_drafts AS PERMISSIVE FOR ALL TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY evaluations_org_insert ON evaluations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY evaluations_org_select ON evaluations AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "org members can access their evaluations" ON evaluations AS PERMISSIVE FOR ALL TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY invitations_org_delete ON invitations AS PERMISSIVE FOR DELETE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY invitations_org_insert ON invitations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY invitations_org_read ON invitations AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Authenticated users can read jury_cells" ON jury_cells AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read jury_president_uplift" ON jury_president_uplift AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read jury_regional_uplift" ON jury_regional_uplift AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY monthly_usage_org_read ON monthly_usage AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "org members can read their monthly usage" ON monthly_usage AS PERMISSIVE FOR SELECT TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Members can read own org" ON organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((id = get_my_org_id()));

CREATE POLICY "Org members manage own press kit drafts" ON press_kit_drafts AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = press_kit_drafts.project_id) AND (p.org_id = get_my_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = press_kit_drafts.project_id) AND (p.org_id = get_my_org_id())))));

CREATE POLICY "Members can read own org profiles" ON profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR (org_id = get_my_org_id())));

CREATE POLICY "Users can update own profile" ON profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY collaborators_delete_own_org ON project_collaborators AS PERMISSIVE FOR DELETE TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY collaborators_insert_own_org ON project_collaborators AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY collaborators_select_own_org ON project_collaborators AS PERMISSIVE FOR SELECT TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY collaborators_update_own_org ON project_collaborators AS PERMISSIVE FOR UPDATE TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "org members can access their projects" ON projects AS PERMISSIVE FOR ALL TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY projects_org_insert ON projects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY projects_org_read ON projects AS PERMISSIVE FOR SELECT TO authenticated USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY projects_org_select ON projects AS PERMISSIVE FOR SELECT TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY projects_org_update ON projects AS PERMISSIVE FOR UPDATE TO public USING ((org_id IN ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY projects_own ON projects AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY show_profiles_select_authenticated ON show_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "org members can read their usage logs" ON usage_logs AS PERMISSIVE FOR SELECT TO public USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY usage_own ON usage_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));


-- ============================================================
-- TABLE GRANTS (anon / authenticated)
-- ============================================================

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON admin_org_overview TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON admin_org_overview TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON agency_profiles TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON agency_profiles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON articles TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON articles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON award_shows TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON award_shows TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON award_tiers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON award_tiers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaign_awards TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaign_awards TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaign_tags TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaign_tags TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaigns TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON campaigns TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON directions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON directions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON dynamic_shows TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON dynamic_shows TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON entry_drafts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON entry_drafts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON evaluations TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON evaluations TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON invitations TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON invitations TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_cells TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_cells TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_president_uplift TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_president_uplift TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_regional_uplift TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON jury_regional_uplift TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON monthly_usage TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON monthly_usage TO authenticated;

GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON organizations TO anon;

GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON organizations TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON press_kit_drafts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON press_kit_drafts TO authenticated;

GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON profiles TO anon;

GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON profiles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON project_collaborators TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON project_collaborators TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON projects TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON projects TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON show_profiles TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON show_profiles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON usage_logs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON usage_logs TO authenticated;


-- ============================================================
-- COLUMN GRANTS
-- ============================================================

GRANT UPDATE (avatar_url, full_name) ON profiles TO authenticated;
