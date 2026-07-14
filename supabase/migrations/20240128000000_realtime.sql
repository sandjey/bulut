-- ============================================================
--  Включаем Realtime для таблиц, чтобы изменения приходили мгновенно
--  (без обновления браузера). Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================
do $$
declare
  t text;
  tbls text[] := array[
    'boards', 'tasks', 'journal', 'task_comments', 'project_maps',
    'workspace_members', 'invitations', 'notifications'
  ];
begin
  -- публикация supabase_realtime есть в Supabase по умолчанию; на всякий случай создаём
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tbls loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    -- добавляем таблицу в публикацию, если её там ещё нет
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    -- полная replica identity — чтобы события UPDATE/DELETE несли данные строки
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
