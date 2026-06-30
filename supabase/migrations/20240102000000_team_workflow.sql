-- ============================================================
--  Миграция: командный процесс (этапы задачи + комментарии)
--  Выполните в Supabase SQL Editor поверх первой схемы.
--  Идемпотентно — можно запускать повторно.
-- ============================================================

-- Временные метки этапов жизненного цикла задачи
alter table public.tasks add column if not exists ready_at  timestamptz;  -- отправлено на проверку
alter table public.tasks add column if not exists tested_at timestamptz;  -- проверено QA / принято

-- Комментарии к задачам (в т.ч. причины возврата от QA)
create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author      text not null default '',
  text        text not null default '',
  kind        text not null default 'comment',  -- 'comment' | 'return'
  created_at  timestamptz not null default now()
);

create index if not exists idx_comments_user on public.task_comments (user_id);
create index if not exists idx_comments_task on public.task_comments (task_id);

alter table public.task_comments enable row level security;

drop policy if exists "comments_select" on public.task_comments;
drop policy if exists "comments_insert" on public.task_comments;
drop policy if exists "comments_update" on public.task_comments;
drop policy if exists "comments_delete" on public.task_comments;
create policy "comments_select" on public.task_comments for select using (auth.uid() = user_id);
create policy "comments_insert" on public.task_comments for insert with check (auth.uid() = user_id);
create policy "comments_update" on public.task_comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "comments_delete" on public.task_comments for delete using (auth.uid() = user_id);
