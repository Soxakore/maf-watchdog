create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  fid bigint not null,
  participated boolean not null default true,
  score bigint,
  notes text,
  created_at timestamptz not null default now(),
  unique (event_id, fid)
);

create index if not exists idx_event_attendance_event on public.event_attendance(event_id);
create index if not exists idx_event_attendance_fid on public.event_attendance(fid);
create index if not exists idx_events_occurred on public.events(occurred_at desc);

alter table public.events enable row level security;
alter table public.event_attendance enable row level security;

create policy "approved read events" on public.events for select to authenticated using (public.is_approved(auth.uid()));
create policy "approved write events" on public.events for insert to authenticated with check (public.is_approved(auth.uid()));
create policy "approved update events" on public.events for update to authenticated using (public.is_approved(auth.uid()));
create policy "admin delete events" on public.events for delete to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "approved read attendance" on public.event_attendance for select to authenticated using (public.is_approved(auth.uid()));
create policy "approved write attendance" on public.event_attendance for insert to authenticated with check (public.is_approved(auth.uid()));
create policy "approved update attendance" on public.event_attendance for update to authenticated using (public.is_approved(auth.uid()));
create policy "approved delete attendance" on public.event_attendance for delete to authenticated using (public.is_approved(auth.uid()));