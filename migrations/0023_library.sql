create table if not exists media_picks (
  id text primary key,
  tg_id text not null,
  chat_id bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table download_logs add column if not exists title text;

create index if not exists download_logs_tg_ok_idx on download_logs (tg_id, ok, created_at desc);
create index if not exists media_picks_created_idx on media_picks (created_at);
