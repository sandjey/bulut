-- ============================================================
--  ПОЧИНКА РЕГИСТРАЦИИ: профиль не создавался при регистрации.
--
--  В новом проекте Supabase не оказалось триггера on_auth_user_created,
--  поэтому у зарегистрировавшихся не появлялся profiles-row: их не видно
--  в команде, нельзя пригласить в комнату и нет прав.
--
--  Этот скрипт:
--   1) заново создаёт функцию + триггер автосоздания профиля;
--   2) добивает профили тем, кто уже зарегистрирован, но остался без него.
--
--  Выполните в Supabase SQL Editor. Идемпотентно — можно запускать повторно.
-- ============================================================

-- ---------- 0. Email владельца (на случай, если функции нет) ----------
create or replace function public.bulut_owner_email()
returns text language sql immutable as $$
  select 'ibrokhimov3210@gmail.com'::text;
$$;

-- ---------- 1. Функция и триггер ----------
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
exception when others then
  -- Профиль не должен ломать саму регистрацию: логируем и пропускаем.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. Добиваем профили «осиротевшим» аккаунтам ----------
insert into public.profiles (id, email, name, job_role, role, permissions)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email,''), '@', 1)),
  coalesce(u.raw_user_meta_data->>'role', ''),
  case when u.email = public.bulut_owner_email() then 'owner' else 'member' end,
  case when u.email = public.bulut_owner_email() then '{}'::text[] else array['board.view'] end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and coalesce(u.email, '') not like '%@bulut.internal'   -- служебный API-аккаунт не показываем в команде
on conflict (id) do nothing;

-- ---------- 3. Проверка ----------
-- Должно вернуть 0: аккаунтов без профиля не осталось.
select count(*) as accounts_without_profile
from auth.users u left join public.profiles p on p.id = u.id
where p.id is null and coalesce(u.email, '') not like '%@bulut.internal';
