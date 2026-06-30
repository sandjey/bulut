-- ============================================================
--  Миграция: динамический журнал + метрики этапов карточки
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================

-- Метрики жизненного цикла карточки
alter table public.tasks add column if not exists stage_entered_at timestamptz;   -- когда вошла в текущий этап
alter table public.tasks add column if not exists return_count integer not null default 0;  -- сколько раз возвращали

-- Какое действие/этап зафиксировано в записи журнала
alter table public.journal add column if not exists stage text not null default '';
