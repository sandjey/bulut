-- ============================================================
--  Ленивая загрузка: доски открываются быстро
--  Выполните этот скрипт в Supabase SQL Editor. Идемпотентно.
--
--  Что изменилось в клиенте: вместо «вся комната целиком» он тянет
--   1) доски + счётчики по доскам (эта RPC),
--   2) сводки задач только открытой доски,
--   3) описание/комментарии — при открытии карточки.
--  Без этого скрипта клиент тоже работает (считает счётчики сам), но
--  главная страница качает на порядок больше.
-- ============================================================

-- ---------- 1. Счётчики по доскам для главной ----------
create or replace function public.board_task_stats(p_ws uuid, p_today date)
returns table (board_id uuid, total integer, done integer, overdue integer)
language sql
stable
security invoker
as $$
  select
    t.board_id,
    count(*)::integer as total,
    count(*) filter (where t.status = 'done')::integer as done,
    count(*) filter (
      where t.status <> 'done'
        and (
          (t.ready_at is null and t.due_date is not null and t.due_date < p_today)
          or (t.done_due_date is not null and t.done_due_date < p_today)
        )
    )::integer as overdue
  from public.tasks t
  where t.workspace_id = p_ws
    and t.deleted_at is null
  group by t.board_id;
$$;

grant execute on function public.board_task_stats(uuid, date) to authenticated;

-- ---------- 2. Индексы под новые выборки ----------
create index if not exists idx_tasks_ws_board      on public.tasks (workspace_id, board_id, position);
create index if not exists idx_tasks_ws_assignee   on public.tasks (workspace_id, assignee);
create index if not exists idx_tasks_ws_map        on public.tasks (workspace_id, map_id);
create index if not exists idx_task_comments_task  on public.task_comments (task_id);
create index if not exists idx_journal_task_stage  on public.journal (task_id, stage);

-- ---------- 3. Bulut API (консоль) удалён из приложения ----------
drop table if exists public.api_consoles;
