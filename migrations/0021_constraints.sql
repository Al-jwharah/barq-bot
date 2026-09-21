-- Idempotent uniqueness + lookup indexes. Never drops rows.
-- Requested uniques that already exist (PK / unique index) are skipped.
-- If duplicates would block a new unique, a SELECT guard skips with NOTICE.

-- ========== UNIQUE telegram_updates.update_id ==========
-- Already: 0013 `update_id bigint not null unique` + 0018 telegram_updates_update_id_uidx
DO $$
BEGIN
  IF to_regclass('public.telegram_updates') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'telegram_updates'
      AND (
        indexname IN ('telegram_updates_update_id_uidx', 'telegram_updates_update_id_key')
        OR (indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(update_id)%')
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'telegram_updates'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%(update_id)%'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM telegram_updates GROUP BY update_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0021: skip UNIQUE telegram_updates.update_id — duplicate rows present';
    RETURN;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX telegram_updates_update_id_uidx ON telegram_updates (update_id)';
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE '0021: skip UNIQUE telegram_updates.update_id — unique_violation';
END $$;

-- ========== UNIQUE download_jobs.job_key among ACTIVE jobs ==========
-- Already: 0014 download_jobs_active_key_uidx (pending/processing/uploading, job_key not null)
DO $$
BEGIN
  IF to_regclass('public.download_jobs') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'download_jobs'
      AND indexname = 'download_jobs_active_key_uidx'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT job_key FROM download_jobs
    WHERE status IN ('pending', 'processing', 'uploading') AND job_key IS NOT NULL
    GROUP BY job_key HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0021: skip UNIQUE download_jobs.job_key (active) — duplicate rows present';
    RETURN;
  END IF;
  EXECUTE $i$
    CREATE UNIQUE INDEX download_jobs_active_key_uidx
      ON download_jobs (job_key)
      WHERE status IN ('pending', 'processing', 'uploading') AND job_key IS NOT NULL
  $i$;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE '0021: skip UNIQUE download_jobs.job_key (active) — unique_violation';
END $$;

-- ========== UNIQUE clip_links.id (clip token; no clip_id / token column) ==========
-- Already: 0004 clip_links.id text primary key
DO $$
BEGIN
  IF to_regclass('public.clip_links') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'clip_links'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%PRIMARY KEY%'
  ) OR EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'clip_links'
      AND (indexname = 'clip_links_pkey' OR (indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(id)%'))
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM clip_links GROUP BY id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0021: skip UNIQUE clip_links.id — duplicate rows present';
    RETURN;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX clip_links_id_uidx ON clip_links (id)';
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE '0021: skip UNIQUE clip_links.id — unique_violation';
END $$;

-- ========== UNIQUE members.tg_id (telegram id; no telegram_id / user_id column) ==========
-- Already: 0002 members.tg_id text primary key
DO $$
BEGIN
  IF to_regclass('public.members') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'members'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%(tg_id)%'
  ) OR EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'members'
      AND (indexname IN ('members_pkey', 'members_tg_id_uidx') OR (indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(tg_id)%'))
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM members GROUP BY tg_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0021: skip UNIQUE members.tg_id — duplicate rows present';
    RETURN;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX members_tg_id_uidx ON members (tg_id)';
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE '0021: skip UNIQUE members.tg_id — unique_violation';
END $$;

-- ========== UNIQUE payments.charge_id (provider / Telegram charge id) ==========
-- Already: 0010 + 0018 payments_charge_id_uidx WHERE charge_id IS NOT NULL
-- No provider_id column.
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND indexname = 'payments_charge_id_uidx'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT charge_id FROM payments
    WHERE charge_id IS NOT NULL
    GROUP BY charge_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0021: skip UNIQUE payments.charge_id — duplicate rows present';
    RETURN;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX payments_charge_id_uidx ON payments (charge_id) WHERE charge_id IS NOT NULL';
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE '0021: skip UNIQUE payments.charge_id — unique_violation';
END $$;

-- ========== Helpful indexes: (user_id|tg_id|actor_id, created_at) ==========
-- download_jobs already has download_jobs_tg_idx (tg_id, created_at desc)
-- bans already has bans_user_idx (user_id, created_at desc)
-- support_tickets already has support_tickets_user_idx (user_id, created_at desc)
create index if not exists download_logs_tg_created_idx on download_logs (tg_id, created_at desc);
create index if not exists user_feedback_tg_created_idx on user_feedback (tg_id, created_at desc);
create index if not exists audit_log_actor_created_idx on audit_log (actor_id, created_at desc);
create index if not exists payments_tg_created_idx on payments (tg_id, created_at desc);
create index if not exists clip_links_tg_created_idx on clip_links (tg_id, created_at desc);
create index if not exists contest_entries_tg_created_idx on contest_entries (tg_id, created_at desc);

-- ========== Helpful indexes: (status, retry_at) ==========
-- download_jobs_retry_idx (0016) is partial WHERE status = 'pending'.
-- Broader (status, retry_at) covers processing/uploading retry scans too.
create index if not exists download_jobs_status_retry_at_idx on download_jobs (status, retry_at);

-- Other hot lookup indexes (idempotent)
create index if not exists files_clip_idx on files (clip_id) where clip_id is not null;
create index if not exists files_created_idx on files (created_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status, created_at desc);
create index if not exists bans_status_idx on bans (status, created_at desc);
create index if not exists job_attempts_started_idx on job_attempts (started_at desc);
