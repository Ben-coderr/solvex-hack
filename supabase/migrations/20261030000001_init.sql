-- SELLEKNI 0001 — initial schema (docs/04 §5).
-- All writes go through Next.js route handlers on a server-only connection; browsers only SELECT under RLS.
-- No char(n) anywhere: Supabase Realtime truncates char(n) values to one character (checked on 2026-10-30),
-- which also breaks its per-subscriber RLS check. Fixed-length codes are text + CHECK.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.band as enum ('R','O','Y','G','U');
create type public.incident_status as enum
  ('RECEIVED','ACKNOWLEDGED','DISPATCHED','EN_ROUTE','ON_SCENE','TRANSPORTING','AT_HOSPITAL','CLOSED','CANCELLED','MERGED');

-- ───────────────────────── people ─────────────────────────

create table public.profiles (               -- one row per auth user
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('dispatcher','hospital','admin')),
  hospital_id text,
  display_name text
);

-- ───────────────────────── hospitals ─────────────────────────

create table public.hospitals (
  id text primary key,                       -- e.g. 'CHU-A'
  name text not null,
  level text not null check (level in ('A','B','C')),
  wilaya_code smallint,
  phone_sms text,
  capabilities text[] not null default '{}'
    check (capabilities <@ array['ed24','trauma_surgery','ct','icu','neurosurgery','pediatrics','burns','general_surgery']),
  location extensions.geography(Point,4326) not null,
  source text not null default 'manual',
  verified boolean not null default false
);
create index hospitals_location_idx on public.hospitals using gist (location);

alter table public.profiles
  add constraint profiles_hospital_fk foreign key (hospital_id) references public.hospitals on delete set null;

create table public.hospital_status (
  hospital_id text not null references public.hospitals on delete cascade,
  status text not null check (status in ('OK','BUSY','SATURATED')),
  set_by text not null,
  set_at timestamptz not null default now(),
  primary key (hospital_id, set_at)
);                                           -- latest row wins; older than 6 h = UNKNOWN (done in code)

-- ───────────────────────── incidents ─────────────────────────

create table public.incidents (
  id text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{5}$'),  -- first client id; merged incidents keep it
  status public.incident_status not null default 'RECEIVED',
  band public.band not null,
  nsi smallint not null check (nsi between 0 and 99),
  conf text not null check (conf in ('H','M','L')),
  location extensions.geography(Point,4326) not null,
  plus_code text,
  crashed_at timestamptz not null,
  first_channel text not null check (first_channel in ('https','sms','paste','witness','sim')),
  merged_count smallint not null default 1,
  assigned_unit text,
  hospital_id text references public.hospitals,
  wilaya_code smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_location_idx on public.incidents using gist (location);
create index incidents_status_created_idx on public.incidents (status, created_at desc);
create index incidents_crashed_idx on public.incidents (crashed_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();

-- append-only; one row per received message. Unparsed messages have no incident and no client id
-- but are stored and shown raw (never dropped).
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  incident_id text references public.incidents on delete cascade,
  client_id text check (client_id ~ '^[0-9A-HJKMNP-TV-Z]{5}$'),                         -- the packet's id (a repeated id = update of the same report)
  channel text not null check (channel in ('https','sms','paste','witness','sim')),
  source text not null check (source in ('auto','witness','sos','crew','unknown')),
  raw text not null,
  parsed jsonb,                              -- decoded packet incl. the phone's band/score hint (kept for audit)
  parse_error text,                          -- decoder error code when unparsed
  sender_hash text,                          -- sha256 of the sender number/IP; never the number itself
  received_at timestamptz not null default now(),
  check ((parsed is null) = (parse_error is not null)),
  check (parse_error is not null or client_id is not null)
);
create unique index reports_idempotent_idx on public.reports (client_id, channel, md5(raw))
  where client_id is not null;               -- idempotent re-delivery of a parsed packet
create unique index reports_unparsed_idempotent_idx on public.reports (channel, md5(raw), coalesce(sender_hash, ''))
  where client_id is null;                   -- idempotent re-delivery of an unparsed message
create index reports_incident_idx on public.reports (incident_id, received_at);
create index reports_client_idx on public.reports (client_id);
create index reports_unparsed_idx on public.reports (received_at desc) where parse_error is not null;

create table public.assessments (            -- every recompute (server-authoritative)
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references public.incidents on delete cascade,
  version int not null,
  band public.band not null,
  nsi smallint not null,
  conf text not null check (conf in ('H','M','L')),
  reasons jsonb not null,
  inputs jsonb not null,
  engine_version text not null,
  created_at timestamptz not null default now(),
  unique (incident_id, version)
);

create table public.prealerts (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references public.incidents on delete cascade,
  hospital_id text not null references public.hospitals,
  channel text not null check (channel in ('web','sms')),
  body text,
  sent_at timestamptz not null default now(),
  acked_at timestamptz,
  acked_by text
);
create index prealerts_incident_idx on public.prealerts (incident_id);
create index prealerts_hospital_idx on public.prealerts (hospital_id, sent_at desc);

-- immutable: no UPDATE/DELETE for anyone (trigger + revoked privileges). TRUNCATE is used only by the demo reset.
create table public.audit_events (
  id bigint generated always as identity primary key,
  incident_id text,
  actor text not null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index audit_events_incident_idx on public.audit_events (incident_id, at);

create or replace function public.audit_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only (% refused)', tg_op;
end $$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

create table public.eta_cache (
  origin_key text not null,                  -- ~100 m grid cell of the incident
  hospital_id text not null references public.hospitals on delete cascade,
  minutes real not null,
  km real,
  source text not null check (source in ('osrm','ors','haversine')),
  computed_at timestamptz not null default now(),
  primary key (origin_key, hospital_id)
);

create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  to_number text,
  body text not null,
  purpose text not null check (purpose in ('ack','prealert','status_reply')),
  incident_id text,
  status text not null default 'queued' check (status in ('queued','sent','failed','simulated','no_number')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.hospitals enable row level security;
alter table public.hospital_status enable row level security;
alter table public.incidents enable row level security;
alter table public.reports enable row level security;
alter table public.assessments enable row level security;
alter table public.prealerts enable row level security;
alter table public.audit_events enable row level security;
alter table public.eta_cache enable row level security;
alter table public.sms_outbox enable row level security;

-- Role of the signed-in user (null when no profile). SECURITY DEFINER so policies can read profiles without recursion.
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid()
$$;
create or replace function public.current_hospital_id() returns text
language sql stable security definer set search_path = '' as $$
  select hospital_id from public.profiles where user_id = auth.uid()
$$;
revoke all on function public.current_role_name() from public, anon;
revoke all on function public.current_hospital_id() from public, anon;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.current_hospital_id() to authenticated;

create policy "own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

create policy "staff read hospitals" on public.hospitals
  for select to authenticated using (public.current_role_name() is not null);
create policy "staff read hospital_status" on public.hospital_status
  for select to authenticated using (public.current_role_name() is not null);
create policy "staff read incidents" on public.incidents
  for select to authenticated using (public.current_role_name() is not null);
create policy "staff read reports" on public.reports
  for select to authenticated using (public.current_role_name() in ('dispatcher','admin'));
create policy "staff read assessments" on public.assessments
  for select to authenticated using (public.current_role_name() is not null);
create policy "dispatch read prealerts" on public.prealerts
  for select to authenticated using (public.current_role_name() in ('dispatcher','admin'));
create policy "hospital reads own prealerts" on public.prealerts
  for select to authenticated using (
    public.current_role_name() = 'hospital' and hospital_id = public.current_hospital_id());
create policy "dispatch read audit" on public.audit_events
  for select to authenticated using (public.current_role_name() in ('dispatcher','admin'));
-- eta_cache, sms_outbox: no policy at all (server-only tables).

-- Defence in depth: browsers never write. Server code uses a direct connection (bypasses RLS).
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.eta_cache, public.sms_outbox from anon, authenticated;
revoke update, delete on public.audit_events from anon, authenticated, service_role;

-- ───────────────────────── Realtime ─────────────────────────
-- postgres_changes respects RLS for the subscriber.
alter publication supabase_realtime add table public.incidents, public.reports, public.assessments, public.prealerts;
