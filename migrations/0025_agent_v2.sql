create table if not exists agent_sessions (
  tg_id text primary key,
  summary text not null default '',
  pending_tool jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists agent_steps (
  id bigserial primary key,
  tg_id text not null,
  tool text not null,
  args jsonb,
  result jsonb,
  ok boolean not null,
  error text,
  job_id text,
  created_at timestamptz not null default now()
);

create index if not exists agent_steps_tg_idx on agent_steps (tg_id, created_at desc);
