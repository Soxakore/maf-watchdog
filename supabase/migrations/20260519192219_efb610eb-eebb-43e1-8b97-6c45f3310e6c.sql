
-- 1. Role enum
create type public.app_role as enum ('admin', 'member');

-- 2. user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 3. Security definer helpers (avoid recursive RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_approved(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id
  )
$$;

-- 4. RLS policies on user_roles
create policy "users can see their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

create policy "admins can see all roles"
  on public.user_roles for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "admins can grant roles"
  on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "admins can revoke roles"
  on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 5. Bootstrap: every existing auth user becomes admin
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
on conflict do nothing;

-- 6. Tighten existing data tables to require approval
drop policy if exists "auth read players" on public.players;
drop policy if exists "auth write players" on public.players;
drop policy if exists "auth update players" on public.players;
drop policy if exists "auth delete players" on public.players;

create policy "approved read players" on public.players for select to authenticated
  using (public.is_approved(auth.uid()));
create policy "approved write players" on public.players for insert to authenticated
  with check (public.is_approved(auth.uid()));
create policy "approved update players" on public.players for update to authenticated
  using (public.is_approved(auth.uid()));
create policy "admin delete players" on public.players for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "auth read snapshots" on public.snapshots;
drop policy if exists "auth write snapshots" on public.snapshots;

create policy "approved read snapshots" on public.snapshots for select to authenticated
  using (public.is_approved(auth.uid()));
create policy "approved write snapshots" on public.snapshots for insert to authenticated
  with check (public.is_approved(auth.uid()));

drop policy if exists "auth read alerts" on public.alerts;
drop policy if exists "auth update alerts" on public.alerts;
drop policy if exists "auth delete alerts" on public.alerts;

create policy "approved read alerts" on public.alerts for select to authenticated
  using (public.is_approved(auth.uid()));
create policy "approved update alerts" on public.alerts for update to authenticated
  using (public.is_approved(auth.uid()));
create policy "admin delete alerts" on public.alerts for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
