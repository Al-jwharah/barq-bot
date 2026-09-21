create table if not exists ai_turns (
  tg_id text not null,
  day text not null,
  used integer not null default 0,
  primary key (tg_id, day)
);
