create table if not exists user_feedback (
  id serial primary key,
  tg_id text,
  rating integer,
  comment text,
  stage text,
  created_at timestamptz not null default now()
);
create index if not exists user_feedback_created_idx on user_feedback (created_at desc);
