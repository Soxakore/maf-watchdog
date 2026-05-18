alter table public.players
  add column if not exists alliance_source text,
  add column if not exists power_source text,
  add column if not exists api_source text,
  add column if not exists api_profile jsonb not null default '{}'::jsonb;

alter table public.snapshots
  add column if not exists alliance_source text,
  add column if not exists power_source text,
  add column if not exists api_source text,
  add column if not exists api_profile jsonb not null default '{}'::jsonb;
