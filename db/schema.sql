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
-- Which gesture: candle, diya, dua, incense, … (src/lib/gestures.ts)
alter table candles add column if not exists kind text not null default 'candle';
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

-- ---------------------------------------------------------------------------
-- Praying for people in places
-- Locations are always rounded: a city centre (GeoNames id) or a whole country.
-- ---------------------------------------------------------------------------

create table if not exists prayer_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  body            text not null,
  faith           text,
  show_faith      boolean not null default false,
  anonymous       boolean not null default true,
  display_name    text not null,
  area_kind       text not null check (area_kind in ('city','country')),
  area_city_id    integer,
  area_cc         char(2) not null,
  area_name       text not null,
  area_lat        real not null,
  area_lon        real not null,
  visibility      text not null check (visibility in ('public','unlisted')),
  status          text not null check (status in ('published','pending','rejected','hidden')),
  moderation_note text,
  prayed_count    integer not null default 0,
  report_count    integer not null default 0,
  closed          boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists requests_public_idx on prayer_requests(created_at desc)
  where status = 'published' and visibility = 'public' and not closed;
create index if not exists requests_user_idx on prayer_requests(user_id);

create table if not exists request_prayers (
  request_id uuid not null references prayer_requests(id) on delete cascade,
  actor      text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, actor)
);

create table if not exists world_prayers (
  id              uuid primary key default gen_random_uuid(),
  sender_device   text not null,
  sender_user     uuid references users(id) on delete cascade,
  body            text not null,
  template_id     text,
  faith           text,
  show_faith      boolean not null default false,
  anonymous       boolean not null default true,
  display_name    text,
  target_kind     text not null check (target_kind in ('city','country')),
  target_city_id  integer,
  target_cc       char(2) not null,
  target_name     text not null,
  target_lat      real not null,
  target_lon      real not null,
  origin_kind     text check (origin_kind in ('city','country')),
  origin_city_id  integer,
  origin_cc       char(2),
  origin_name     text,
  origin_lat      real,
  origin_lon      real,
  request_id      uuid references prayer_requests(id) on delete set null,
  status          text not null check (status in ('published','pending','rejected','hidden')),
  moderation_note text,
  report_count    integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists world_recent_idx on world_prayers(created_at desc) where status = 'published';
create index if not exists world_target_city_idx on world_prayers(target_city_id, created_at desc) where status = 'published';
create index if not exists world_target_cc_idx on world_prayers(target_cc, created_at desc) where status = 'published';
create index if not exists world_request_idx on world_prayers(request_id) where request_id is not null;
create index if not exists world_sender_user_idx on world_prayers(sender_user);
create index if not exists world_sender_device_idx on world_prayers(sender_device);

create table if not exists content_reports (
  kind       text not null check (kind in ('world_prayer','request')),
  content_id uuid not null,
  actor      text not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  primary key (kind, content_id, actor)
);

create table if not exists blocks (
  id            uuid primary key default gen_random_uuid(),
  blocker_actor text not null,
  blocked_actor text not null,
  label         text not null,
  created_at    timestamptz not null default now(),
  unique (blocker_actor, blocked_actor)
);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  link       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);

create table if not exists user_settings (
  user_id            uuid primary key references users(id) on delete cascade,
  home_kind          text check (home_kind in ('city','country')),
  home_city_id       integer,
  home_cc            char(2),
  home_name          text,
  home_lat           real,
  home_lon           real,
  notify_requests    boolean not null default true,
  notify_area        boolean not null default false,
  email              boolean not null default false,
  push               boolean not null default false,
  last_email_at      timestamptz,
  last_area_notice_at timestamptz
);
create index if not exists settings_area_idx on user_settings(home_city_id) where notify_area;

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('web','expo')),
  endpoint   text not null unique,
  keys       text,
  created_at timestamptz not null default now()
);

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
alter table prayer_requests enable row level security;
alter table request_prayers enable row level security;
alter table world_prayers enable row level security;
alter table content_reports enable row level security;
alter table blocks enable row level security;
alter table notifications enable row level security;
alter table user_settings enable row level security;
alter table push_subscriptions enable row level security;

-- Suggested corrections and new places from users, reviewed by moderators.
create table if not exists place_suggestions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('new', 'correction', 'closed', 'duplicate')),
  place_id    text,
  name        text,
  faith       text,
  tradition   text,
  address     text,
  lat         double precision,
  lon         double precision,
  website     text,
  note        text,
  owner_user  uuid references users(id) on delete set null,
  owner_device text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderation_note text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists place_suggestions_status_idx on place_suggestions (status, created_at);
alter table place_suggestions enable row level security;
