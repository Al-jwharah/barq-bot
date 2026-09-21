create table if not exists contests (
  id text primary key,
  title text not null,
  prize text not null default '',
  rules text not null default '',
  winners_count int not null default 1,
  grant_days int not null default 0,
  channel_message_id bigint,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists contest_entries (
  contest_id text not null,
  tg_id text not null,
  username text,
  first_name text,
  created_at timestamptz not null default now(),
  primary key (contest_id, tg_id)
);

create index if not exists contest_entries_contest_idx on contest_entries (contest_id);
create index if not exists contests_status_idx on contests (status, created_at desc);
