-- ============================================================
--  P1: очки, эпик, спринт, наблюдатели, кастомные поля.
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================
alter table public.tasks add column if not exists story_points integer;
alter table public.tasks add column if not exists epic         text   not null default '';
alter table public.tasks add column if not exists sprint       text   not null default '';
alter table public.tasks add column if not exists watchers     text[] not null default '{}';
alter table public.tasks add column if not exists custom       jsonb  not null default '{}'::jsonb;

alter table public.boards add column if not exists custom_fields jsonb not null default '[]'::jsonb;

create index if not exists idx_tasks_sprint on public.tasks (sprint);
create index if not exists idx_tasks_epic   on public.tasks (epic);
