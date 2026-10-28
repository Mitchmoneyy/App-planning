-- Global Sanctuary: the world's places of worship (loaded by scripts/db-load-places.mjs
-- from the pipeline's places.ndjson.gz). Used for search, "near me" and place pages.
-- Needs the PostGIS and pg_trgm extensions (both available on Supabase).

create extension if not exists postgis;
create extension if not exists pg_trgm;

create table if not exists places (
  id          text primary key,
  name        text not null,
  faith       text not null,
  tradition   text,
  address     text,
  city        text,
  region      text,
  postcode    text,
  cc          text,
  country     text,
  website     text,
  wikidata    text,
  wikipedia   text,
  heritage    boolean not null default false,
  landmark    boolean not null default false,
  height      real,
  geom        geography(Point, 4326) not null,
  footprint   jsonb,        -- building outline (GeoJSON)
  sources     text[] not null default '{}',
  source_ids  text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

create index if not exists places_geom_idx on places using gist (geom);
create index if not exists places_name_trgm_idx on places using gin (name gin_trgm_ops);
create index if not exists places_city_trgm_idx on places using gin (city gin_trgm_ops);
create index if not exists places_faith_idx on places (faith);

alter table places enable row level security;
-- Public, read-only data. The app reads it through the server; no client policies needed.
