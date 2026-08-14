-- ============================================================
--  Экономия трафика (egress) при опросе сервера
--  Выполните этот скрипт в Supabase SQL Editor. Идемпотентно.
--
--  Зачем: после перехода с realtime на опрос каждые 25с клиент качал
--  ВСЕ задачи комнаты целиком — вместе с колонкой photos, где лежат
--  фото в base64. Это давало ~10 ГБ egress в день на одну вкладку.
--
--  Этот скрипт даёт две вещи:
--   1) updated_at + триггеры → дешёвая «метка синхронизации»: клиент
--      сначала спрашивает одним запросом «что-нибудь изменилось?»
--      (~200 байт) и качает данные только если да.
--   2) tasks.photo_count → значок «сколько фото» на карточке без
--      скачивания самих фото.
-- ============================================================

-- ---------- 1. updated_at на синхронизируемых таблицах ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['boards', 'tasks', 'journal', 'task_comments', 'project_maps'] loop
    -- таблицы может не быть (старая база) — пропускаем без ошибки
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);

    execute format('drop trigger if exists trg_%I_touch_updated on public.%I', t, t);
    execute format(
      'create trigger trg_%I_touch_updated before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);

    -- индекс под max(updated_at) в метке синхронизации
    execute format(
      'create index if not exists idx_%I_ws_updated on public.%I (workspace_id, updated_at desc)', t, t);
  end loop;
end $$;

-- ---------- 2. Счётчик фото без самих фото ----------
-- Значок «3 фото» на карточке доски должен работать, не таская base64.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'photo_count'
  ) then
    alter table public.tasks add column photo_count integer
      generated always as (
        case when jsonb_typeof(photos) = 'array' then jsonb_array_length(photos) else 0 end
      ) stored;
  end if;
end $$;

-- ---------- 3. Метка синхронизации: «изменилось ли что-нибудь?» ----------
-- Возвращает короткую строку вида «12:2026-08-14T10:00:00+00|…».
-- Меняется при любой вставке, правке или удалении в комнате:
--   count(*)         ловит вставки и удаления,
--   max(updated_at)  ловит правки.
-- security invoker — RLS работает как обычно, чужую комнату не видно.

create or replace function public.workspace_sync_stamp(p_ws uuid)
returns text
language sql
stable
security invoker
as $$
  select concat_ws('|',
    (select concat(count(*), ':', coalesce(max(updated_at)::text, '-'))
       from public.boards where workspace_id = p_ws),
    (select concat(count(*), ':', coalesce(max(updated_at)::text, '-'))
       from public.tasks where workspace_id = p_ws),
    (select concat(count(*), ':', coalesce(max(updated_at)::text, '-'))
       from public.journal where workspace_id = p_ws),
    (select concat(count(*), ':', coalesce(max(updated_at)::text, '-'))
       from public.task_comments where workspace_id = p_ws)
  );
$$;

create or replace function public.maps_sync_stamp(p_ws uuid)
returns text
language sql
stable
security invoker
as $$
  select concat(count(*), ':', coalesce(max(updated_at)::text, '-'))
    from public.project_maps where workspace_id = p_ws;
$$;

grant execute on function public.workspace_sync_stamp(uuid) to authenticated;
grant execute on function public.maps_sync_stamp(uuid) to authenticated;
