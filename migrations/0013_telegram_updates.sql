create table if not exists telegram_updates (
  id bigserial primary key,
  update_id bigint not null unique,
  update_type text not null default 'unknown',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error_code text
);
create index if not exists telegram_updates_status_idx on telegram_updates (status, received_at);

insert into telegram_updates (update_id, update_type, status, received_at, processed_at)
select update_id, 'unknown', 'processed', created_at, created_at
from processed_updates
on conflict (update_id) do nothing;

alter table download_jobs add column if not exists update_id bigint;
create unique index if not exists download_jobs_update_id_uidx on download_jobs (update_id);
