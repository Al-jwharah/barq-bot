-- Shared counters, rate limits, job attempts, and file registry.
-- Blob/S3 stays for bytes; this is the transactional source of truth.

create table if not exists usage_counters (
  user_id text not null,
  day date not null,
  action text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, action)
);
create index if not exists usage_counters_day_idx on usage_counters (day, action);

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

insert into rate_limits (key, count, reset_at)
select key, count, reset_at from rate_buckets
on conflict (key) do nothing;

create table if not exists job_attempts (
  id bigserial primary key,
  job_id text not null,
  attempt integer not null,
  status text not null,
  error_code text,
  error_message_safe text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (job_id, attempt)
);
create index if not exists job_attempts_job_idx on job_attempts (job_id, attempt desc);

create table if not exists files (
  id text primary key,
  storage_key text not null unique,
  kind text,
  bytes integer,
  clip_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists payments_charge_id_uidx on payments (charge_id) where charge_id is not null;
create unique index if not exists telegram_updates_update_id_uidx on telegram_updates (update_id);
