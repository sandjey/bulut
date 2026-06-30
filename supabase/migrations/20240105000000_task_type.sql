-- ============================================================
--  Миграция: тип задачи (баг / фича / новый функционал / …)
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================

alter table public.tasks   add column if not exists type text not null default 'task';
alter table public.journal add column if not exists type text not null default 'task';
