alter table download_logs add column if not exists blocked boolean not null default false;
alter table download_logs add column if not exists reason text;
alter table download_logs add column if not exists verdict text;

create table if not exists bot_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into bot_settings (key, value) values
  ('porn_filter', 'on'),
  ('owner_exempt_custom', 'on')
on conflict (key) do nothing;

create table if not exists filter_events (
  id serial primary key,
  tg_id text,
  url text not null,
  kind text not null,
  reason text,
  evidence text,
  created_at timestamptz not null default now()
);

create index if not exists filter_events_created_idx on filter_events (created_at desc);

create table if not exists grok_notes (
  id serial primary key,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now()
);
