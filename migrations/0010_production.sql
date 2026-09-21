alter table members add column if not exists role text not null default 'user';
alter table members add column if not exists tier text not null default 'free';
alter table members add column if not exists daily_limit integer not null default 5;
alter table members add column if not exists last_active timestamptz;

create table if not exists download_jobs (
  id text primary key,
  tg_id text not null,
  chat_id text not null,
  url text not null,
  platform text,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  status_message_id integer,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists download_jobs_status_idx on download_jobs (status, created_at);
create index if not exists download_jobs_tg_idx on download_jobs (tg_id, created_at desc);

create table if not exists audit_log (
  id serial primary key,
  actor_id text,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

create table if not exists app_events (
  id serial primary key,
  request_id text,
  tg_id text,
  action text not null,
  status text,
  duration_ms integer,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists app_events_created_idx on app_events (created_at desc);
create index if not exists app_events_tg_idx on app_events (tg_id);

create table if not exists ai_usage (
  id serial primary key,
  tg_id text not null,
  model text,
  tokens integer,
  requests integer not null default 1,
  day date not null default current_date
);
create index if not exists ai_usage_day_idx on ai_usage (tg_id, day);

alter table payments add column if not exists plan text;
alter table payments add column if not exists expires_at timestamptz;
create unique index if not exists payments_charge_id_uidx on payments (charge_id) where charge_id is not null;

create table if not exists url_reputation (
  host text primary key,
  verdict text not null,
  hits integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists rate_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);
