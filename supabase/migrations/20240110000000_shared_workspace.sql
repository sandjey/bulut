-- ============================================================
--  Общее рабочее пространство: все авторизованные видят всё
--  Выполните в Supabase SQL Editor
-- ============================================================

-- BOARDS
drop policy if exists "boards_select" on public.boards;
drop policy if exists "boards_insert" on public.boards;
drop policy if exists "boards_update" on public.boards;
drop policy if exists "boards_delete" on public.boards;

create policy "boards_select" on public.boards for select using (auth.uid() is not null);
create policy "boards_insert" on public.boards for insert with check (auth.uid() = user_id);
create policy "boards_update" on public.boards for update using (auth.uid() is not null);
create policy "boards_delete" on public.boards for delete using (auth.uid() is not null);

-- TASKS
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks for select using (auth.uid() is not null);
create policy "tasks_insert" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update" on public.tasks for update using (auth.uid() is not null);
create policy "tasks_delete" on public.tasks for delete using (auth.uid() is not null);

-- JOURNAL
drop policy if exists "journal_select" on public.journal;
drop policy if exists "journal_insert" on public.journal;
drop policy if exists "journal_update" on public.journal;
drop policy if exists "journal_delete" on public.journal;

create policy "journal_select" on public.journal for select using (auth.uid() is not null);
create policy "journal_insert" on public.journal for insert with check (auth.uid() = user_id);
create policy "journal_update" on public.journal for update using (auth.uid() is not null);
create policy "journal_delete" on public.journal for delete using (auth.uid() is not null);

-- TASK COMMENTS
drop policy if exists "comments_select" on public.task_comments;
drop policy if exists "comments_insert" on public.task_comments;
drop policy if exists "comments_update" on public.task_comments;
drop policy if exists "comments_delete" on public.task_comments;

create policy "comments_select" on public.task_comments for select using (auth.uid() is not null);
create policy "comments_insert" on public.task_comments for insert with check (auth.uid() is not null);
create policy "comments_update" on public.task_comments for update using (auth.uid() is not null);
create policy "comments_delete" on public.task_comments for delete using (auth.uid() is not null);

-- MEMBERS
drop policy if exists "members_select" on public.members;
drop policy if exists "members_insert" on public.members;
drop policy if exists "members_update" on public.members;
drop policy if exists "members_delete" on public.members;

create policy "members_select" on public.members for select using (auth.uid() is not null);
create policy "members_insert" on public.members for insert with check (auth.uid() is not null);
create policy "members_update" on public.members for update using (auth.uid() is not null);
create policy "members_delete" on public.members for delete using (auth.uid() is not null);
