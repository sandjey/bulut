-- ============================================================
--  Нельзя приглашать того, кто уже участник комнаты.
--  Выполните в Supabase SQL Editor. Идемпотентно (create or replace).
-- ============================================================
create or replace function public.invite_to_workspace(p_ws uuid, p_email text, p_role text default 'member')
returns json language plpgsql security definer set search_path = public as $$
declare v_token text; v_uid uuid; v_ws_name text; v_email text;
begin
  if public.ws_role(p_ws) not in ('owner','admin') then raise exception 'Недостаточно прав'; end if;
  v_email := lower(trim(p_email));
  if v_email = '' then raise exception 'Пустой email'; end if;

  -- зарегистрирован в Bulut?
  select id into v_uid from public.profiles where lower(email) = v_email and deleted_at is null limit 1;
  if v_uid is null then
    raise exception 'Пользователь % не является пользователем Bulut. Пусть сначала зарегистрируется, после этого пригласите его по почте.', p_email;
  end if;

  -- уже в комнате?
  if exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = v_uid) then
    raise exception 'Пользователь % уже участник этой комнаты.', p_email;
  end if;

  insert into public.invitations (workspace_id, email, role, invited_by)
    values (p_ws, v_email, coalesce(p_role, 'member'), auth.uid())
    returning token into v_token;

  select name into v_ws_name from public.workspaces where id = p_ws;
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
    values (v_uid, p_ws, 'invite', 'Приглашение в комнату',
            'Вас пригласили в «'||coalesce(v_ws_name, 'комнату')||'»', '/invite/'||v_token);

  return json_build_object('token', v_token, 'workspace', coalesce(v_ws_name, ''));
end; $$;

grant execute on function public.invite_to_workspace(uuid, text, text) to anon, authenticated, service_role;
