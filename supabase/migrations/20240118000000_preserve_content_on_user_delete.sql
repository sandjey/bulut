-- ============================================================
--  Защита данных при удалении пользователя
--  Выполните в Supabase SQL Editor. Идемпотентно.
--
--  Проблема: раньше user_id ссылался на auth.users с ON DELETE CASCADE —
--  при удалении аккаунта удалялось ВСЁ, что он создал (доски/задачи/карты).
--  В общем воркспейсе это сносило общие доски.
--
--  Решение: меняем на ON DELETE SET NULL — контент остаётся, обнуляется
--  только «автор». Профиль (profiles) по-прежнему удаляется каскадом.
-- ============================================================

do $$
declare
  t text;
  fk text;
  tables text[] := array['boards', 'tasks', 'journal', 'task_comments', 'project_maps'];
begin
  foreach t in array tables loop
    -- пропускаем таблицу, если её нет
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- разрешаем NULL в user_id
    execute format('alter table public.%I alter column user_id drop not null', t);

    -- находим и удаляем текущий FK на user_id
    select conname into fk
    from pg_constraint
    where conrelid = ('public.' || t)::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = ('public.' || t)::regclass and attname = 'user_id')
      ];
    if fk is not null then
      execute format('alter table public.%I drop constraint %I', t, fk);
    end if;

    -- добавляем новый FK с ON DELETE SET NULL
    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete set null',
      t, t || '_user_id_fkey'
    );
  end loop;
end $$;
