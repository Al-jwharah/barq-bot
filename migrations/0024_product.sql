create table if not exists media_cache (
  url_hash text primary key,
  url text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists download_ratings (
  id bigserial primary key,
  tg_id text not null,
  url text not null,
  stars int not null,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  tg_id text primary key,
  code text not null unique,
  invited_by text,
  invites int not null default 0,
  bonus_downloads int not null default 0,
  affiliate_credit int not null default 0,
  trial_used boolean not null default false
);

create table if not exists dead_links (
  url text primary key,
  reason text,
  hits int not null default 1,
  last_seen timestamptz not null default now()
);

alter table download_jobs add column if not exists priority int not null default 0;
