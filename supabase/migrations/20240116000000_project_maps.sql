-- ============================================================
--  Bulut MAP — карты проекта (визуальные флоу)
--  Выполните этот скрипт в Supabase SQL Editor. Идемпотентно.
--
--  Весь граф (узлы, связи, вьюпорт) хранится в одном JSONB-поле graph —
--  ровно в той форме, что отдаёт/принимает React Flow.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.project_maps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade, -- автор
  name        text not null default 'Новая карта',
  description text not null default '',
  color       text not null default '#6366f1',
  graph       jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_project_maps_user on public.project_maps (user_id);

-- ---------- RLS: общий воркспейс (как boards) ----------
alter table public.project_maps enable row level security;

drop policy if exists "maps_select" on public.project_maps;
drop policy if exists "maps_insert" on public.project_maps;
drop policy if exists "maps_update" on public.project_maps;
drop policy if exists "maps_delete" on public.project_maps;

create policy "maps_select" on public.project_maps
  for select using (auth.uid() is not null);
create policy "maps_insert" on public.project_maps
  for insert with check (auth.uid() = user_id);
create policy "maps_update" on public.project_maps
  for update using (auth.uid() is not null);
create policy "maps_delete" on public.project_maps
  for delete using (auth.uid() is not null);

-- ---------- Realtime ----------
-- Добавляем таблицу в публикацию realtime (без ошибки, если уже добавлена).
do $$
begin
  begin
    alter publication supabase_realtime add table public.project_maps;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
