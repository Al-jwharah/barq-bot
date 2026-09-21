alter table members add column if not exists channel_ok boolean not null default false;

create table if not exists clip_links (
  id text primary key,
  tg_id text not null,
  url text not null,
  media_url text,
  thumbnail text,
  kind text,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists clip_links_created_idx on clip_links (created_at desc);
create index if not exists clip_links_tg_idx on clip_links (tg_id);

insert into bot_settings (key, value) values
  ('required_channel', 'barq_all'),
  ('free_downloads', '5'),
  ('bot_paused', 'off'),
  ('ads_enabled', 'off'),
  ('ads_text', ''),
  ('grok_owner', 'on'),
  ('grok_model', 'grok-4.5'),
  ('grok_speed', 'balanced'),
  ('grok_web_search', 'off'),
  ('grok_tools', 'on'),
  ('restrictions_on', 'on'),
  ('public_origin', '')
on conflict (key) do nothing;
