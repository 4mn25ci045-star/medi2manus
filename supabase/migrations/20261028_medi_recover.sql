create table if not exists public.mr_app_state (
  id integer primary key check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.mr_app_state enable row level security;

drop policy if exists "MediRecover demo state read" on public.mr_app_state;
create policy "MediRecover demo state read" on public.mr_app_state for select to anon, authenticated using (true);

drop policy if exists "MediRecover demo state write" on public.mr_app_state;
create policy "MediRecover demo state write" on public.mr_app_state for insert to anon, authenticated with check (true);

drop policy if exists "MediRecover demo state update" on public.mr_app_state;
create policy "MediRecover demo state update" on public.mr_app_state for update to anon, authenticated using (true) with check (true);

comment on table public.mr_app_state is 'MediRecover fictional hackathon demo state. Replace open demo policies with tenant-scoped authenticated RLS before production use.';
