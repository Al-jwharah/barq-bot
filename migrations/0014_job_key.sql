alter table download_jobs add column if not exists job_key text;
alter table download_jobs add column if not exists quota_applied boolean not null default false;

create unique index if not exists download_jobs_active_key_uidx
  on download_jobs (job_key)
  where status in ('pending', 'processing', 'uploading') and job_key is not null;

create index if not exists download_jobs_job_key_idx on download_jobs (job_key, created_at desc);
