-- ---------------------------------------------------------------------------
-- Fisio Architect — cloud storage for generated articles, version history and
-- profile rules.
--
-- HOW TO USE
--   Run this whole file once in the Supabase dashboard:
--   Project Settings -> SQL Editor -> New query -> Paste -> Run.
--
-- SECURITY MODEL (why there is no login page)
--   The app talks to PostgREST with the *anon* key only. The anon key is
--   public by design — it is shipped in the browser bundle — so it grants
--   nothing on its own. What grants access is the workspace secret: a random
--   string you create in the Providers view and paste once per device. It
--   travels as the request header `X-Workspace-Secret`, which PostgREST exposes
--   to policies as the setting `request.header.x_workspace_secret`, and every
--   policy below compares it to the value stored on the row.
--
--   Consequences worth knowing:
--     * The secret is the only gate. Generate it with the button in the app (or
--       `select md5(random()::text || clock_timestamp()::text);`) and treat it
--       like a password. Anyone who has it can read and rewrite this history.
--     * Nothing here is encrypted at rest beyond Supabase's own disk encryption.
--       Rows stay readable in the dashboard, which is deliberate: you can audit
--       your content there.
--     * `service_role` is never used by the app and must never appear in a
--       `VITE_*` variable — it bypasses every policy in this file.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Articles, including their full version history.
-- The whole GeneratedArticle object is stored as JSONB in `article`; the flat
-- columns exist only so policies and ordering do not need to parse it.
-- ---------------------------------------------------------------------------
create table if not exists public.fisio_articles (
  id               text primary key,
  workspace_secret text not null,
  topic            text not null default '',
  -- Client-written: the moment this revision was saved locally. Last-write-wins
  -- merges compare it, which is why it is not `now()`.
  updated_at       timestamptz not null,
  article          jsonb not null,
  -- Server-written on every request, so the app can show when the row last
  -- arrived rather than trusting the writer's clock.
  synced_at        timestamptz not null default now()
);

create index if not exists fisio_articles_workspace_updated_idx
  on public.fisio_articles (workspace_secret, updated_at desc);

-- ---------------------------------------------------------------------------
-- Profile rules (brand + design tokens + exclusions), the universal writing/SEO
-- rules, and the pipeline settings. One row per workspace, so a rules change on
-- the laptop lands on the desktop instead of forking per device.
-- ---------------------------------------------------------------------------
create table if not exists public.fisio_settings (
  workspace_secret text primary key,
  profile          jsonb not null default '{}'::jsonb,
  universal_rules  jsonb not null default '{}'::jsonb,
  pipeline_config  jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null,
  synced_at        timestamptz not null default now()
);

-- Keep `synced_at` honest on updates; it has a column default for inserts.
create or replace function public.fisio_set_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists fisio_articles_set_synced_at on public.fisio_articles;
create trigger fisio_articles_set_synced_at
  before update on public.fisio_articles
  for each row execute function public.fisio_set_synced_at();

drop trigger if exists fisio_settings_set_synced_at on public.fisio_settings;
create trigger fisio_settings_set_synced_at
  before update on public.fisio_settings
  for each row execute function public.fisio_set_synced_at();

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- PostgREST does NOT publish one GUC per header. The whole header set arrives
-- as a single JSON setting, `request.headers`, with names lowercased and dashes
-- KEPT (documented in PostgREST "Transaction Settings"), so the header
-- `X-Workspace-Secret` is read as:
--     current_setting('request.headers', true)::json ->> 'x-workspace-secret'
--
-- `workspace_secret_from_header()` centralizes that. Returning '' when the
-- setting is absent means an unauthenticated call matches nothing, including a
-- row whose secret column was somehow written empty.
-- ---------------------------------------------------------------------------
create or replace function public.workspace_secret_from_header()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-workspace-secret',
    ''
  );
$$;

create or replace function public.is_workspace_member(secret_column text)
returns boolean
language sql
stable
as $$
  select public.workspace_secret_from_header() <> ''
     and public.workspace_secret_from_header() = secret_column;
$$;

alter table public.fisio_articles enable row level security;
alter table public.fisio_settings enable row level security;

-- Force table checks even for owners/dashboard queries that bypass policies
-- would otherwise skip; nothing is readable without the header.
alter table public.fisio_articles force row level security;
alter table public.fisio_settings force row level security;

drop policy if exists "workspace members read articles" on public.fisio_articles;
create policy "workspace members read articles"
  on public.fisio_articles for select
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members write their own articles" on public.fisio_articles;
create policy "workspace members write their own articles"
  on public.fisio_articles for insert
  to anon, authenticated
  with check (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members update their articles" on public.fisio_articles;
create policy "workspace members update their articles"
  on public.fisio_articles for update
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret))
  with check (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members delete their articles" on public.fisio_articles;
create policy "workspace members delete their articles"
  on public.fisio_articles for delete
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members read settings" on public.fisio_settings;
create policy "workspace members read settings"
  on public.fisio_settings for select
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members write settings" on public.fisio_settings;
create policy "workspace members write settings"
  on public.fisio_settings for insert
  to anon, authenticated
  with check (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members update settings" on public.fisio_settings;
create policy "workspace members update settings"
  on public.fisio_settings for update
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret))
  with check (public.is_workspace_member(workspace_secret));

drop policy if exists "workspace members delete settings" on public.fisio_settings;
create policy "workspace members delete settings"
  on public.fisio_settings for delete
  to anon, authenticated
  using (public.is_workspace_member(workspace_secret));

-- ---------------------------------------------------------------------------
-- Handshake for the in-app "Test connection" button.
--
-- A plain select cannot distinguish a wrong secret from an empty workspace:
-- row level security answers both with zero rows. This function runs as the
-- caller (no SECURITY DEFINER), so its counts are still limited by the
-- policies above, and it reports whether the header arrived at all.
-- ---------------------------------------------------------------------------
create or replace function public.fisio_cloud_handshake()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    -- The extraction the policies actually use: did a non-empty secret arrive?
    'header_present', public.workspace_secret_from_header() <> '',
    -- Did PostgREST expose the header set at all? Distinguishes "this platform
    -- does not publish request.headers" from "the secret simply did not match".
    'headers_guc_present',
      nullif(current_setting('request.headers', true), '') is not null,
    'articles_visible',
      (select count(*) from (select 1 from public.fisio_articles) as visible_rows),
    'settings_visible',
      (select count(*) from (select 1 from public.fisio_settings) as visible_rows)
  );
$$;

revoke execute on function public.fisio_cloud_handshake() from public;
grant execute on function public.fisio_cloud_handshake() to anon, authenticated;
