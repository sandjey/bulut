-- ============================================================
--  Миграция: чек-листы (подзадачи) и вложения у задач
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================

alter table public.tasks add column if not exists checklist   jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;
