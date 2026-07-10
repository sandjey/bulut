-- ============================================================
--  Связь задачи с картой проекта (Bulut MAP × Доски)
--  Выполните в Supabase SQL Editor. Идемпотентно.
--
--  Задача может быть привязана к одному экрану (узлу) карты:
--   • map_id       — какая карта (project_maps)
--   • map_node_id  — id узла-экрана внутри graph карты
--  Этап задачи — это её column_id (уже есть). Статус узла агрегируется
--  из задач на клиенте; ручной override живёт в graph (node.data).
--
--  БЕЗОПАСНОСТЬ: при удалении карты ссылка обнуляется (on delete set null),
--  задача не удаляется. Удаление узла из графа задачу не трогает — на клиенте
--  показываем «экран удалён».
-- ============================================================

alter table public.tasks
  add column if not exists map_id uuid references public.project_maps (id) on delete set null,
  add column if not exists map_node_id text;

create index if not exists idx_tasks_map on public.tasks (map_id);
