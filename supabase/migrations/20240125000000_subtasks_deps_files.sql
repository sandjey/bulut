-- ============================================================
--  Подзадачи, связи «блокируется», и хранилище файлов.
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================

-- ---------- 1. Подзадачи + зависимости ----------
alter table public.tasks add column if not exists parent_id  uuid references public.tasks (id) on delete cascade;
alter table public.tasks add column if not exists blocked_by uuid[] not null default '{}';
create index if not exists idx_tasks_parent on public.tasks (parent_id);

-- ---------- 2. Файлы: приватный бакет task-files ----------
insert into storage.buckets (id, name, public)
  values ('task-files', 'task-files', false)
  on conflict (id) do nothing;

-- Доступ к файлам бакета — любому авторизованному (пути включают комнату/задачу,
-- ссылки на скачивание — подписанные и временные). Простая, рабочая политика.
drop policy if exists "taskfiles_select" on storage.objects;
drop policy if exists "taskfiles_insert" on storage.objects;
drop policy if exists "taskfiles_update" on storage.objects;
drop policy if exists "taskfiles_delete" on storage.objects;
create policy "taskfiles_select" on storage.objects for select
  using (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_insert" on storage.objects for insert
  with check (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_update" on storage.objects for update
  using (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_delete" on storage.objects for delete
  using (bucket_id = 'task-files' and auth.uid() is not null);
