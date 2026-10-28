-- Global Sanctuary database schema (PostgreSQL 14+; works on Supabase, Neon, RDS…)
--
-- Apply with:  npm run db:migrate      (uses DATABASE_URL)
-- Safe to run more than once.

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,            -- sha256 of the cookie token; the token itself is never stored
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists prayers (
  id              uuid primary key default gen_random_uuid(),
  place_id        text not null,
  owner_device    text not null,
  owner_user      uuid references users(id) on delete cascade,
  body            text not null,          -- private prayers are encrypted by the app when a key is set
  is_public       boolean not null,
  anonymous       boolean not null default true,
  display_name    text,
  status          text not null check (status in ('published','pending','rejected','hidden','private')),
  moderation_note text,
  prayed_count    integer not null default 0,
  report_count    integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists prayers_wall_idx on prayers(place_id, created_at desc) where status = 'published';
create index if not exists prayers_owner_user_idx on prayers(owner_user);
create index if not exists prayers_owner_device_idx on prayers(owner_device);
create index if not exists prayers_queue_idx on prayers(status) where status in ('pending','hidden');

create table if not exists prayed_for (
  prayer_id  uuid not null references prayers(id) on delete cascade,
  actor      text not null,
  created_at timestamptz not null default now(),
  primary key (prayer_id, actor)
);
create index if not exists prayed_for_actor_idx on prayed_for(actor);

create table if not exists prayer_reports (
  prayer_id  uuid not null references prayers(id) on delete cascade,
  actor      text not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  primary key (prayer_id, actor)
);

create table if not exists candles (
  id         bigint generated always as identity primary key,
  place_id   text not null,
  actor      text not null,
  created_at timestamptz not null default now()
);
create index if not exists candles_place_idx on candles(place_id, created_at desc);
create index if not exists candles_actor_idx on candles(actor, place_id, created_at desc);

create table if not exists favorites (
  actor      text not null,
  place_id   text not null,
  created_at timestamptz not null default now(),
  primary key (actor, place_id)
);

create table if not exists reviews (
  id              uuid primary key default gen_random_uuid(),
  place_id        text not null,
  user_id         uuid not null references users(id) on delete cascade,
  display_name    text not null,
  rating          smallint not null check (rating between 1 and 5),
  body            text not null,
  status          text not null check (status in ('published','pending','rejected','hidden')),
  moderation_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (place_id, user_id)
);
create index if not exists reviews_place_idx on reviews(place_id, updated_at desc) where status = 'published';

-- The app connects with a server-side database user, never from the browser.
-- If you use Supabase, turn on Row Level Security with no policies so the
-- public "anon" API key can't read these tables directly:
alter table users enable row level security;
alter table sessions enable row level security;
alter table prayers enable row level security;
alter table prayed_for enable row level security;
alter table prayer_reports enable row level security;
alter table candles enable row level security;
alter table favorites enable row level security;
alter table reviews enable row level security;
