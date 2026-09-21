create table if not exists processed_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

insert into bot_settings (key, value) values
  ('last_heartbeat', ''),
  ('webhook_url', 'https://barq-vid.vercel.app/api/telegram')
on conflict (key) do nothing;
