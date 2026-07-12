-- ============================================================
--  МУЛЬТИАРЕНДНОСТЬ: Комнаты (workspaces), участники, приглашения, уведомления
--  Выполните в Supabase SQL Editor. Идемпотентно.
--
--  Что делает:
--  1) Таблицы workspaces / workspace_members / invitations / notifications.
--  2) Колонка workspace_id на boards/tasks/journal/task_comments/project_maps/backups.
--  3) Бэкофилл: создаёт комнату «Моя команда» (владелец = текущий owner),
--     переносит в неё ВСЕ существующие данные, делает всех участниками.
--  4) Новый RLS: видно только то, что в комнатах, где ты участник (is_ws_member).
--  5) RPC: create_workspace, invite_to_workspace, accept_invitation.
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- 1. Таблицы ----------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Моя команда',
  color      text not null default '#6366f1',
  owner_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member',      -- owner | admin | member
  permissions  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists idx_ws_members_ws   on public.workspace_members (workspace_id);
create index if not exists idx_ws_members_user on public.workspace_members (user_id);

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null,
  role         text not null default 'member',
  permissions  text[] not null default '{}',
  token        text not null unique default encode(gen_random_bytes(20), 'hex'),
  invited_by   uuid references auth.users (id) on delete set null,
  status       text not null default 'pending',     -- pending | accepted | revoked
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days'
);
create index if not exists idx_invites_ws    on public.invitations (workspace_id);
create index if not exists idx_invites_email on public.invitations (lower(email));
create index if not exists idx_invites_token on public.invitations (token);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type         text not null,                        -- invite | ...
  title        text not null default '',
  body         text not null default '',
  link         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notifs_user on public.notifications (user_id, read);

-- ---------- 2. workspace_id на существующих таблицах ----------
do $$
declare
  t text;
  tables text[] := array['boards','tasks','journal','task_comments','project_maps','backups'];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade', t);
    execute format('create index if not exists idx_%I_ws on public.%I(workspace_id)', t, t);
  end loop;
end $$;

-- ---------- 3. Хелперы (security definer — обходят RLS, без рекурсии) ----------
create or replace function public.is_ws_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.ws_role(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()),
    ''
  );
$$;

-- ---------- 4. Бэкофилл: перенос существующих данных в комнату по умолчанию ----------
do $$
declare
  v_owner uuid;
  v_ws uuid;
begin
  -- только если комнат ещё нет (первый прогон)
  if not exists (select 1 from public.workspaces) then
    select id into v_owner from public.profiles where role = 'owner' order by created_at limit 1;
    if v_owner is null then
      select id into v_owner from public.profiles order by created_at limit 1;
    end if;

    if v_owner is not null then
      insert into public.workspaces (name, color, owner_id)
        values ('Моя команда', '#6366f1', v_owner)
        returning id into v_ws;

      -- участники = все текущие профили (роль и права переносим из profiles)
      insert into public.workspace_members (workspace_id, user_id, role, permissions)
        select v_ws, p.id, p.role, coalesce(p.permissions, '{}')
        from public.profiles p
        on conflict (workspace_id, user_id) do nothing;

      -- вешаем workspace_id на существующие строки
      update public.boards        set workspace_id = v_ws where workspace_id is null;
      update public.tasks         set workspace_id = v_ws where workspace_id is null;
      update public.journal       set workspace_id = v_ws where workspace_id is null;
      update public.task_comments set workspace_id = v_ws where workspace_id is null;
      update public.project_maps  set workspace_id = v_ws where workspace_id is null;
      update public.backups       set workspace_id = v_ws where workspace_id is null;
    end if;
  end if;
end $$;

-- ---------- 5. RPC ----------
-- Создать комнату + сделать себя владельцем.
create or replace function public.create_workspace(p_name text, p_color text default '#6366f1')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  if auth.uid() is null then raise exception 'Не авторизован'; end if;
  insert into public.workspaces (name, color, owner_id)
    values (coalesce(nullif(trim(p_name), ''), 'Новая комната'), coalesce(p_color, '#6366f1'), auth.uid())
    returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, permissions)
    values (v_ws, auth.uid(), 'owner', '{}');
  return v_ws;
end; $$;

-- Пригласить в комнату: создаёт invite + (если есть аккаунт) уведомление. Возвращает токен.
create or replace function public.invite_to_workspace(p_ws uuid, p_email text, p_role text default 'member')
returns json language plpgsql security definer set search_path = public as $$
declare v_token text; v_uid uuid; v_ws_name text; v_email text;
begin
  if public.ws_role(p_ws) not in ('owner','admin') then raise exception 'Недостаточно прав'; end if;
  v_email := lower(trim(p_email));
  if v_email = '' then raise exception 'Пустой email'; end if;

  insert into public.invitations (workspace_id, email, role, invited_by)
    values (p_ws, v_email, coalesce(p_role, 'member'), auth.uid())
    returning token into v_token;

  select name into v_ws_name from public.workspaces where id = p_ws;
  select id into v_uid from public.profiles where lower(email) = v_email and deleted_at is null limit 1;
  if v_uid is not null then
    insert into public.notifications (user_id, workspace_id, type, title, body, link)
      values (v_uid, p_ws, 'invite', 'Приглашение в комнату',
              'Вас пригласили в «'||coalesce(v_ws_name, 'комнату')||'»', '/invite/'||v_token);
  end if;
  return json_build_object('token', v_token, 'workspace', coalesce(v_ws_name, ''));
end; $$;

-- Принять приглашение по токену (ссылка или письмо).
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Не авторизован'; end if;
  select * into v_inv from public.invitations where token = p_token;
  if v_inv.id is null then raise exception 'Приглашение не найдено'; end if;
  if v_inv.status <> 'pending' then raise exception 'Приглашение уже использовано или отозвано'; end if;
  if v_inv.expires_at < now() then raise exception 'Срок приглашения истёк'; end if;

  insert into public.workspace_members (workspace_id, user_id, role, permissions)
    values (v_inv.workspace_id, v_uid, v_inv.role, v_inv.permissions)
    on conflict (workspace_id, user_id) do nothing;
  update public.invitations set status = 'accepted' where id = v_inv.id;
  update public.notifications set read = true where link = '/invite/'||p_token and user_id = v_uid;
  return v_inv.workspace_id;
end; $$;

-- ---------- 6. RLS: данные видны только участникам комнаты ----------
do $$
declare
  t text; p record;
  tables text[] := array['boards','tasks','journal','task_comments','project_maps','backups'];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    -- сносим ВСЕ прежние политики (в т.ч. «общий воркспейс»), чтобы не осталось дыр
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select using (public.is_ws_member(workspace_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_ws_member(workspace_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_ws_member(workspace_id)) with check (public.is_ws_member(workspace_id))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_ws_member(workspace_id))', t||'_del', t);
  end loop;
end $$;

-- workspaces
alter table public.workspaces enable row level security;
drop policy if exists "ws_select" on public.workspaces;
drop policy if exists "ws_insert" on public.workspaces;
drop policy if exists "ws_update" on public.workspaces;
drop policy if exists "ws_delete" on public.workspaces;
create policy "ws_select" on public.workspaces for select using (public.is_ws_member(id));
create policy "ws_insert" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "ws_update" on public.workspaces for update using (public.ws_role(id) in ('owner','admin'));
create policy "ws_delete" on public.workspaces for delete using (public.ws_role(id) = 'owner');

-- workspace_members
alter table public.workspace_members enable row level security;
drop policy if exists "wm_select" on public.workspace_members;
drop policy if exists "wm_insert" on public.workspace_members;
drop policy if exists "wm_update" on public.workspace_members;
drop policy if exists "wm_delete" on public.workspace_members;
create policy "wm_select" on public.workspace_members for select using (public.is_ws_member(workspace_id));
create policy "wm_insert" on public.workspace_members for insert
  with check (public.ws_role(workspace_id) in ('owner','admin') or user_id = auth.uid());
create policy "wm_update" on public.workspace_members for update
  using (public.ws_role(workspace_id) in ('owner','admin'));
create policy "wm_delete" on public.workspace_members for delete
  using (public.ws_role(workspace_id) in ('owner','admin') or user_id = auth.uid());

-- invitations
alter table public.invitations enable row level security;
drop policy if exists "inv_select" on public.invitations;
drop policy if exists "inv_insert" on public.invitations;
drop policy if exists "inv_update" on public.invitations;
drop policy if exists "inv_delete" on public.invitations;
create policy "inv_select" on public.invitations for select
  using (public.ws_role(workspace_id) in ('owner','admin') or lower(email) = lower(coalesce(auth.email(), '')));
create policy "inv_insert" on public.invitations for insert
  with check (public.ws_role(workspace_id) in ('owner','admin'));
create policy "inv_update" on public.invitations for update
  using (public.ws_role(workspace_id) in ('owner','admin'));
create policy "inv_delete" on public.invitations for delete
  using (public.ws_role(workspace_id) in ('owner','admin'));

-- notifications
alter table public.notifications enable row level security;
drop policy if exists "notif_select" on public.notifications;
drop policy if exists "notif_insert" on public.notifications;
drop policy if exists "notif_update" on public.notifications;
drop policy if exists "notif_delete" on public.notifications;
create policy "notif_select" on public.notifications for select using (user_id = auth.uid());
create policy "notif_insert" on public.notifications for insert with check (user_id = auth.uid());
create policy "notif_update" on public.notifications for update using (user_id = auth.uid());
create policy "notif_delete" on public.notifications for delete using (user_id = auth.uid());

-- ---------- 7. Доступ ролям Supabase (RLS всё равно ограничивает данные) ----------
grant all on public.workspaces, public.workspace_members, public.invitations, public.notifications
  to anon, authenticated, service_role;
grant execute on function public.create_workspace(text, text)          to anon, authenticated, service_role;
grant execute on function public.invite_to_workspace(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.accept_invitation(text)               to anon, authenticated, service_role;
grant execute on function public.is_ws_member(uuid)                     to anon, authenticated, service_role;
grant execute on function public.ws_role(uuid)                          to anon, authenticated, service_role;
