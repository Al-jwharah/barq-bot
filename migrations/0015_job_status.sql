alter table download_jobs add column if not exists completed_at timestamptz;
alter table download_jobs add column if not exists failed_at timestamptz;
alter table download_jobs add column if not exists cancelled_at timestamptz;
alter table download_jobs add column if not exists expired_at timestamptz;
alter table download_jobs add column if not exists error_code text;
alter table download_jobs add column if not exists error_message_safe text;

update download_jobs
set completed_at = coalesce(completed_at, finished_at)
where status = 'completed' and completed_at is null;

update download_jobs
set failed_at = coalesce(failed_at, finished_at),
    error_message_safe = coalesce(error_message_safe, error)
where status = 'failed' and failed_at is null;

update download_jobs
set status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, finished_at, now()),
    error_code = coalesce(error_code, 'blocked'),
    error_message_safe = coalesce(error_message_safe, error)
where status = 'blocked';
