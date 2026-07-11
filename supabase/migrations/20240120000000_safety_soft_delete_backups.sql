-- ============================================================
--  Надёжность: Корзина (soft-delete) + Бэкапы
--  Выполните в Supabase SQL Editor. Идемпотентно.
--
--  Что делает:
--  1) Добавляет deleted_at в boards/tasks/journal/project_maps —
--     обычное удаление больше НЕ стирает строку, а помечает её удалённой
--     (уходит в Корзину, можно восстановить). Данные строго остаются в БД.
--  2) Создаёт таблицу backups — снимок всех данных (JSON) на всякий случай.
-- ============================================================

-- ---------- 1. Soft-delete: колонка deleted_at ----------
do $$
declare
  t text;
  tables text[] := array['boards', 'tasks', 'journal', 'project_maps'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format(
      'create index if not exists idx_%I_deleted on public.%I (deleted_at)', t, t
    );
  end loop;
end $$;

-- ---------- 2. Таблица бэкапов ----------
create table if not exists public.backups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  author_name text,
  label       text,
  kind        text not null default 'manual',   -- manual | auto
  counts      jsonb not null default '{}'::jsonb,
  data        jsonb not null
);
create index if not exists idx_backups_created on public.backups (created_at desc);

alter table public.backups enable row level security;
drop policy if exists "backups_select" on public.backups;
drop policy if exists "backups_insert" on public.backups;
drop policy if exists "backups_delete" on public.backups;
create policy "backups_select" on public.backups for select using (auth.uid() is not null);
create policy "backups_insert" on public.backups for insert with check (auth.uid() is not null);
create policy "backups_delete" on public.backups for delete using (auth.uid() is not null);
