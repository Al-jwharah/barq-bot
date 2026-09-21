create table if not exists user_stats (
  tg_id text primary key,
  onboarding_step integer not null default 0,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_seen_day date,
  last_nudge_day date,
  downloads_ok integer not null default 0,
  ai_uses integer not null default 0,
  tips integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists growth_events (
  id serial primary key,
  tg_id text,
  name text not null,
  props text,
  created_at timestamptz not null default now()
);
create index if not exists growth_events_created_idx on growth_events (created_at desc);
create index if not exists growth_events_name_idx on growth_events (name, created_at desc);
create index if not exists growth_events_tg_idx on growth_events (tg_id, created_at desc);

create table if not exists user_achievements (
  tg_id text not null,
  code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (tg_id, code)
);

create table if not exists user_journeys (
  tg_id text not null,
  journey_id text not null,
  step integer not null default 0,
  completed_at timestamptz,
  primary key (tg_id, journey_id)
);
