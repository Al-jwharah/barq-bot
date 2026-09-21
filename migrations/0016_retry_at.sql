alter table download_jobs add column if not exists retry_at timestamptz;
create index if not exists download_jobs_retry_idx
  on download_jobs (status, retry_at)
  where status = 'pending';
