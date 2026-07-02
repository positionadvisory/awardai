-- Session 102 (2 Jul 2026): signup notification trigger
--
-- WHY: Ben gets no notification today when a new user signs up (self-serve or
-- invited). This adds an AFTER INSERT trigger on public.profiles — the row
-- created exactly once per new user by the existing handle_new_user() trigger
-- on auth.users, regardless of whether they came through a plain signup or an
-- accepted invite (see Shortlist-Schema.md / Shortlist-Gotchas.md, confirmed
-- live 2 Jul 2026: on_auth_user_created AFTER INSERT on auth.users is the only
-- writer of profiles rows; /api/invite/accept only UPDATEs an existing row).
--
-- This migration is ADDITIVE ONLY. It does not touch handle_new_user(),
-- auth.users, or any existing trigger/policy.
--
-- Live-shape pre-check confirmed 2 Jul 2026 via SQL Editor:
--   - on_auth_user_created (AFTER INSERT on auth.users) exists, is the only
--     trigger on profiles/auth.users besides profiles_updated_at (BEFORE UPDATE).
--   - pg_net was NOT installed (only pg_cron). Enabled below.
--   - organizations has name/plan/trial_unlimited columns as expected.
--
-- MANUAL STEP BEFORE RUNNING THIS FILE (do this first, in the same SQL Editor,
-- as its own statement — the actual secret VALUE lives only in
-- 25 & Beyond/Private/notify-signup-secret.md, never in this committed file):
--
--   select vault.create_secret(
--     '<paste the value from Private/notify-signup-secret.md>',
--     'notify_signup_shared_secret',
--     'Shared secret the notify-signup edge function checks on the x-webhook-secret header. Set 2 Jul 2026, S102.'
--   );
--
-- The SAME value must be set as the notify-signup edge function's
-- NOTIFY_SIGNUP_SECRET secret (Dashboard -> Edge Functions -> notify-signup ->
-- Secrets, or `supabase secrets set NOTIFY_SIGNUP_SECRET=...`). If you ever
-- rotate it, update both places together or the trigger's calls silently 401
-- (which pg_net logs but nothing else notices — check net._http_response if
-- signups stop generating emails).

-- ── Pre-flight: verify profiles has the columns this trigger reads ─────────
do $$
declare
  v_col_count int;
begin
  select count(*) into v_col_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('id','email','full_name','org_id','created_at');

  if v_col_count <> 5 then
    raise exception 'profiles table shape unexpected: found % of 5 expected columns (id, email, full_name, org_id, created_at) — abort before creating trigger', v_col_count;
  end if;
end $$;

-- ── Enable pg_net (idempotent; required for the trigger to call the edge fn) ─
create extension if not exists pg_net;

-- ── Enable Supabase Vault (idempotent; almost certainly already on, guarded
-- anyway since it was never checked live) — needed to store the shared secret
-- without ever putting the literal value in a committed file. ───────────────
create extension if not exists supabase_vault;

-- ── Trigger function ─────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read vault.decrypted_secrets regardless of the
-- calling role. Every branch is wrapped so a failure here can NEVER roll back
-- or block the profiles insert that fired it — worst case, no email goes out
-- and a warning lands in Postgres logs.
create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'notify_signup_shared_secret'
    limit 1;

    if v_secret is null then
      raise warning 'notify_new_signup: notify_signup_shared_secret not found in vault — skipping notify call for profile %', new.id;
      return new;
    end if;

    perform net.http_post(
      url     := 'https://qctpjlysyotkwkvfqyng.supabase.co/functions/v1/notify-signup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'id', new.id,
          'email', new.email,
          'full_name', new.full_name,
          'org_id', new.org_id,
          'created_at', new.created_at
        )
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- Never let a notify failure touch the signup transaction.
    raise warning 'notify_new_signup: swallowed error for profile %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

-- ── Trigger ──────────────────────────────────────────────────────────────
-- CREATE OR REPLACE TRIGGER (PG14+) — explicit redefine, not a silent
-- IF NOT EXISTS skip (see Shortlist-Gotchas: guarded blocks must not assume
-- a same-named object already has the right definition).
create or replace trigger on_profile_created_notify
  after insert on public.profiles
  for each row execute function public.notify_new_signup();

-- ── Post-flight: assert exactly one trigger exists ──────────────────────
do $$
declare
  v_count int;
begin
  select count(*) into v_count from pg_trigger where tgname = 'on_profile_created_notify';
  if v_count <> 1 then
    raise exception 'Expected exactly 1 on_profile_created_notify trigger after migration, found %', v_count;
  end if;
end $$;
