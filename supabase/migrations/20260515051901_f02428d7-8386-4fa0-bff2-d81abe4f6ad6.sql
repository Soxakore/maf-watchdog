
create table public.players (
  fid bigint primary key,
  nickname text,
  state integer,
  furnace_level integer,
  avatar_image text,
  alliance text,
  power bigint,
  notes text,
  is_active boolean not null default true,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_api_status text
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null references public.players(fid) on delete cascade,
  nickname text,
  state integer,
  furnace_level integer,
  alliance text,
  power bigint,
  captured_at timestamptz not null default now()
);
create index snapshots_fid_captured_idx on public.snapshots(fid, captured_at desc);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null references public.players(fid) on delete cascade,
  alert_type text not null,
  message text not null,
  old_value text,
  new_value text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index alerts_created_idx on public.alerts(created_at desc);
create index alerts_unread_idx on public.alerts(is_read, created_at desc);

alter table public.players enable row level security;
alter table public.snapshots enable row level security;
alter table public.alerts enable row level security;

create policy "auth read players" on public.players for select to authenticated using (true);
create policy "auth write players" on public.players for insert to authenticated with check (true);
create policy "auth update players" on public.players for update to authenticated using (true);
create policy "auth delete players" on public.players for delete to authenticated using (true);

create policy "auth read snapshots" on public.snapshots for select to authenticated using (true);
create policy "auth write snapshots" on public.snapshots for insert to authenticated with check (true);

create policy "auth read alerts" on public.alerts for select to authenticated using (true);
create policy "auth update alerts" on public.alerts for update to authenticated using (true);
create policy "auth delete alerts" on public.alerts for delete to authenticated using (true);
