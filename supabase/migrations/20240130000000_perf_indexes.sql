-- Композитные индексы под реальные паттерны запросов из src/lib/db.ts.
-- Раньше был только индекс на workspace_id — Postgres фильтровал по нему,
-- а сортировку (position/created_at/date) делал отдельным шагом. На тарифе
-- Nano (маленький Disk IO budget) это давало "57014 canceling statement due
-- to statement timeout" в логах при конкуррентной нагрузке.
--
-- db.fetchAll:   boards/tasks  .eq(workspace_id).order(position asc)
--                journal       .eq(workspace_id).order(date desc)
--                task_comments .eq(workspace_id).order(created_at asc)
-- db.fetchTrash: boards/tasks  .eq(workspace_id).order(created_at desc)
--                journal       .eq(workspace_id).order(date desc)  -- уже покрыт выше

create index if not exists idx_boards_ws_position   on public.boards (workspace_id, position);
create index if not exists idx_boards_ws_created    on public.boards (workspace_id, created_at desc);

create index if not exists idx_tasks_ws_position    on public.tasks (workspace_id, position);
create index if not exists idx_tasks_ws_created     on public.tasks (workspace_id, created_at desc);

create index if not exists idx_journal_ws_date      on public.journal (workspace_id, date desc);

create index if not exists idx_task_comments_ws_created on public.task_comments (workspace_id, created_at asc);

create index if not exists idx_project_maps_ws      on public.project_maps (workspace_id);
