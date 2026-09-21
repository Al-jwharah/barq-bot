-- news pending already in settings; ops extras
create table if not exists support_tickets (
  id text primary key,
  user_id text not null,
  job_id text,
  subject text,
  message text not null,
  status text not null default 'open',
  assigned_to text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_tickets_user_idx on support_tickets (user_id, created_at desc);

create table if not exists bans (
  id text primary key,
  user_id text not null,
  reason text,
  category text,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',
  appeal_status text,
  appeal_text text
);
create index if not exists bans_user_idx on bans (user_id, created_at desc);

update bot_settings set value = '' where key = 'webhook_url' and value like '%vercel.app%';
