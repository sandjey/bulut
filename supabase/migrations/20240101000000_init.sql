-- ============================================================
--  Bulut — схема базы данных (PostgreSQL / Supabase)
--  Выполните этот скрипт в Supabase SQL Editor
--  (или он применится автоматически как миграция при local dev).
-- ============================================================

-- Расширение для генерации UUID
create extension if not exists "pgcrypto";

-- ---------- BOARDS (доски / направления) ----------
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',
  columns     jsonb not null default '[]'::jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- TASKS (карточки задач) ----------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  board_id      uuid not null references public.boards (id) on delete cascade,
  column_id     text not null,
  title         text not null,
  description   text not null default '',
  assignee      text not null default '',
  priority      text not null default 'medium',
  due_date      date,
  tags          text[] not null default '{}',
  status        text not null default 'active',
  position      double precision not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- ---------- JOURNAL (журнал выполненных задач) ----------
create table if not exists public.journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  date        date not null default current_date,
  board_name  text not null default '',
  task_title  text not null default '',
  assignee    text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------- Индексы ----------
create index if not exists idx_boards_user   on public.boards (user_id);
create index if not exists idx_tasks_user    on public.tasks (user_id);
create index if not exists idx_tasks_board   on public.tasks (board_id);
create index if not exists idx_journal_user  on public.journal (user_id);

-- ============================================================
--  ROW LEVEL SECURITY — каждый пользователь видит только своё
-- ============================================================
alter table public.boards  enable row level security;
alter table public.tasks   enable row level security;
alter table public.journal enable row level security;

-- BOARDS policies
drop policy if exists "boards_select" on public.boards;
drop policy if exists "boards_insert" on public.boards;
drop policy if exists "boards_update" on public.boards;
drop policy if exists "boards_delete" on public.boards;
create policy "boards_select" on public.boards for select using (auth.uid() = user_id);
create policy "boards_insert" on public.boards for insert with check (auth.uid() = user_id);
create policy "boards_update" on public.boards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "boards_delete" on public.boards for delete using (auth.uid() = user_id);

-- TASKS policies
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_select" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks_insert" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete" on public.tasks for delete using (auth.uid() = user_id);

-- JOURNAL policies
drop policy if exists "journal_select" on public.journal;
drop policy if exists "journal_insert" on public.journal;
drop policy if exists "journal_update" on public.journal;
drop policy if exists "journal_delete" on public.journal;
create policy "journal_select" on public.journal for select using (auth.uid() = user_id);
create policy "journal_insert" on public.journal for insert with check (auth.uid() = user_id);
create policy "journal_update" on public.journal for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_delete" on public.journal for delete using (auth.uid() = user_id);
