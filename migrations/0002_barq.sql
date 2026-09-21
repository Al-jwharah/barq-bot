create table if not exists members (
  tg_id text primary key,
  username text,
  first_name text,
  downloads_used integer not null default 0,
  subscribed_until timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists promo_codes (
  code text primary key,
  days integer not null default 30,
  max_uses integer not null default 20,
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists download_logs (
  id serial primary key,
  tg_id text,
  url text not null,
  platform text,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists download_logs_created_idx on download_logs (created_at desc);

create table if not exists payments (
  id serial primary key,
  tg_id text not null,
  stars integer not null,
  charge_id text,
  created_at timestamptz not null default now()
);
