create table if not exists paypal_events (
  event_id text primary key,
  plan_id text,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists paypal_events_created_idx on paypal_events (created_at desc);
