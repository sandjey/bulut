-- ============================================================
--  Миграция: участники команды (справочник исполнителей)
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null default '',
  role        text not null default '',
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now()
);

create index if not exists idx_members_user on public.members (user_id);

alter table public.members enable row level security;

drop policy if exists "members_select" on public.members;
drop policy if exists "members_insert" on public.members;
drop policy if exists "members_update" on public.members;
drop policy if exists "members_delete" on public.members;
create policy "members_select" on public.members for select using (auth.uid() = user_id);
create policy "members_insert" on public.members for insert with check (auth.uid() = user_id);
create policy "members_update" on public.members for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "members_delete" on public.members for delete using (auth.uid() = user_id);
