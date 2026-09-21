alter table clip_links add column if not exists expires_at timestamptz;
update clip_links set expires_at = created_at + interval '1 day' where expires_at is null;
