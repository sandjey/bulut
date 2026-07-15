-- Bulut API (Console): сохранение коллекций/окружений в базе (по пользователю).
-- Персонально для каждого пользователя, синхронизируется между устройствами.
-- Применяется вручную в Supabase SQL Editor.

create table if not exists public.api_consoles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.api_consoles enable row level security;

-- Каждый видит и правит только свою строку.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'api_consoles' and policyname = 'api_consoles_select_own'
  ) then
    create policy api_consoles_select_own on public.api_consoles
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'api_consoles' and policyname = 'api_consoles_insert_own'
  ) then
    create policy api_consoles_insert_own on public.api_consoles
      for insert with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'api_consoles' and policyname = 'api_consoles_update_own'
  ) then
    create policy api_consoles_update_own on public.api_consoles
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'api_consoles' and policyname = 'api_consoles_delete_own'
  ) then
    create policy api_consoles_delete_own on public.api_consoles
      for delete using (user_id = auth.uid());
  end if;
end $$;
