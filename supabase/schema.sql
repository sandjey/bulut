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

-- ============================================================
--  КОМАНДНЫЙ ПРОЦЕСС: этапы задачи + комментарии (QA-возвраты)
--  Этот блок идемпотентен — можно выполнять повторно.
-- ============================================================

-- Временные метки этапов жизненного цикла задачи
alter table public.tasks add column if not exists ready_at  timestamptz;  -- отправлено на проверку
alter table public.tasks add column if not exists tested_at timestamptz;  -- проверено QA / принято
alter table public.tasks add column if not exists stage_entered_at timestamptz;  -- когда вошла в текущий этап
alter table public.tasks add column if not exists return_count integer not null default 0;  -- сколько раз возвращали
alter table public.journal add column if not exists stage text not null default '';  -- действие/этап записи
alter table public.tasks   add column if not exists type text not null default 'task';  -- тип задачи
alter table public.journal add column if not exists type text not null default 'task';
alter table public.tasks   add column if not exists stage_times jsonb not null default '{}'::jsonb;  -- время по этапам
alter table public.tasks   add column if not exists checklist   jsonb not null default '[]'::jsonb;  -- чек-лист
alter table public.tasks   add column if not exists attachments jsonb not null default '[]'::jsonb;  -- вложения

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

-- ============================================================
--  УЧАСТНИКИ КОМАНДЫ (справочник исполнителей)
-- ============================================================
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null default '',
  role        text not null default '',
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now()
);

create index if not exists idx_members_user on public.members (user_id);

alter table public.members enable row level security;

drop policy if exists "members_select" on public.members;
drop policy if exists "members_insert" on public.members;
drop policy if exists "members_update" on public.members;
drop policy if exists "members_delete" on public.members;
create policy "members_select" on public.members for select using (auth.uid() = user_id);
create policy "members_insert" on public.members for insert with check (auth.uid() = user_id);
create policy "members_update" on public.members for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "members_delete" on public.members for delete using (auth.uid() = user_id);
