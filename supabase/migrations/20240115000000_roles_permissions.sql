-- ============================================================
--  Роли и права доступа (профили аккаунтов)
--  Выполните этот скрипт в Supabase SQL Editor.  Идемпотентно.
--
--  Модель:
--   • owner  — владелец (супер-админ). Все права. Неудаляем и непонижаем.
--   • admin  — администратор. Все возможности + управление правами
--              обычных пользователей. НЕ может трогать владельца и НЕ
--              может назначать других админов.
--   • member — обычный пользователь. Права выдаёт админ поштучно.
--              По умолчанию — только просмотр досок.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Таблица профилей ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  name         text not null default '',
  job_role     text not null default '',              -- профессия (Frontend/QA/…)
  role         text not null default 'member',        -- owner | admin | member
  permissions  text[] not null default '{}',          -- список ключей прав (для member)
  created_at   timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profiles_role  on public.profiles (role);

-- ---------- Кто владелец ----------
-- Единственная точка правды об email владельца.
create or replace function public.bulut_owner_email()
returns text language sql immutable as $$
  select 'ibrokhimov3210@gmail.com'::text;
$$;

-- ---------- Роль текущего пользователя (для RLS) ----------
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'member');
$$;

-- ---------- Автосоздание профиля при регистрации ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner boolean := (new.email = public.bulut_owner_email());
begin
  insert into public.profiles (id, email, name, job_role, role, permissions)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', ''),
    case when v_owner then 'owner' else 'member' end,
    case when v_owner then '{}'::text[] else array['board.view'] end
  )
  on conflict (id) do update
    set email    = excluded.email,
        name     = case when profiles.name = '' then excluded.name else profiles.name end,
        job_role = case when profiles.job_role = '' then excluded.job_role else profiles.job_role end,
        role     = case when v_owner then 'owner' else profiles.role end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Бэкофилл: профили для уже существующих пользователей ----------
insert into public.profiles (id, email, name, job_role, role, permissions)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'role', ''),
  case when u.email = public.bulut_owner_email() then 'owner' else 'member' end,
  case when u.email = public.bulut_owner_email() then '{}'::text[] else array['board.view'] end
from auth.users u
on conflict (id) do nothing;

-- Гарантируем, что владелец — owner (на случай если профиль уже был member).
update public.profiles
   set role = 'owner'
 where email = public.bulut_owner_email();

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;

-- Читать профили может любой авторизованный (нужно для раздела «Команда»/«Администрирование»).
create policy "profiles_select" on public.profiles
  for select using (auth.uid() is not null);

-- Вставка — только свой профиль (обычно делает триггер).
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

-- Обновление:
--   • owner может менять любой профиль;
--   • admin может менять только обычных пользователей (member) и не может
--     повысить их до admin/owner (новая роль обязана остаться member);
--   • member не может менять профили.
create policy "profiles_update" on public.profiles
  for update
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'admin' and role = 'member')
  )
  with check (
    public.my_role() = 'owner'
    or (public.my_role() = 'admin' and role = 'member')
  );

-- Удаление:
--   • owner может удалить любого, кроме владельца;
--   • admin может удалить только member.
create policy "profiles_delete" on public.profiles
  for delete
  using (
    (public.my_role() = 'owner' and role <> 'owner')
    or (public.my_role() = 'admin' and role = 'member')
  );
