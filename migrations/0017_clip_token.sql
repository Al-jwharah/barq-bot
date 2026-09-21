alter table clip_links add column if not exists storage_key text;
alter table clip_links add column if not exists hits integer not null default 0;
alter table clip_links add column if not exists max_hits integer;

create index if not exists clip_links_expires_idx on clip_links (expires_at);
