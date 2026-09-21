-- drop unused duplicate update table if empty-safe
drop table if exists processed_updates;

alter table download_jobs add column if not exists worker_id text;
alter table download_jobs add column if not exists last_heartbeat_at timestamptz;
alter table download_jobs add column if not exists request_id text;

alter table clip_links add column if not exists revoked_at timestamptz;

alter table bans add column if not exists updated_at timestamptz;
