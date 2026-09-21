-- Stored like counter + unique likers. Count is a real row, not only COUNT(*).
create table if not exists bot_likes (
  tg_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists like_counter (
  id smallint primary key default 1 check (id = 1),
  total integer not null default 0
);

insert into like_counter (id, total) values (1, 0) on conflict (id) do nothing;

insert into bot_likes (tg_id, created_at)
select tg_id, min(created_at)
from user_feedback
where stage = 'like' and tg_id is not null and btrim(tg_id) <> ''
group by tg_id
on conflict (tg_id) do nothing;

update like_counter
set total = (select count(*)::int from bot_likes)
where id = 1;
