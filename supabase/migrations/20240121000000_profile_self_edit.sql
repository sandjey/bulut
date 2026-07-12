-- ============================================================
--  Профиль: фото (avatar), мягкое удаление (deleted_at),
--  и право пользователя редактировать СВОЙ профиль.
--  Выполните в Supabase SQL Editor. Идемпотентно.
--
--  Важно: удаление профиля НЕ трогает доски/задачи/журнал/карты —
--  там хранится имя строкой, ничего не удаляется и не ломается.
--  Профиль лишь помечается deleted_at (рядом покажем «удалённый аккаунт»).
-- ============================================================

alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists idx_profiles_deleted on public.profiles (deleted_at);

-- Разрешаем пользователю обновлять СВОЙ профиль (имя/должность/фото/почта/мягкое удаление).
-- owner — любой профиль; admin — только member; каждый — свой (auth.uid() = id).
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'admin' and role = 'member')
    or auth.uid() = id
  )
  with check (
    public.my_role() = 'owner'
    or (public.my_role() = 'admin' and role = 'member')
    or auth.uid() = id
  );

-- Защита: обычный пользователь (не owner) НЕ может менять СВОЮ роль или права
-- через self-update. Управление чужими ролями по-прежнему по RLS выше.
create or replace function public.guard_profile_self_role()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.uid() = new.id and public.my_role() <> 'owner' then
    if new.role is distinct from old.role
       or new.permissions is distinct from old.permissions then
      raise exception 'Нельзя менять свою роль или права';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_self_role on public.profiles;
create trigger trg_guard_profile_self_role
  before update on public.profiles
  for each row execute function public.guard_profile_self_role();
