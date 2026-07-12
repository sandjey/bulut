-- ============================================================
--  Уведомить участника комнаты (назначение / комментарий / упоминание).
--  RLS на notifications разрешает вставку только себе — поэтому шлём через
--  security-definer RPC с проверкой: и отправитель, и получатель в комнате.
--  Выполните в Supabase SQL Editor. Идемпотентно.
-- ============================================================
create or replace function public.notify_member(
  p_user uuid,
  p_ws uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;      -- себе не шлём
  if not public.is_ws_member(p_ws) then return; end if;             -- отправитель в комнате
  if not exists (                                                    -- получатель в комнате
    select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_user
  ) then return; end if;
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
    values (p_user, p_ws, coalesce(p_type, 'info'), coalesce(p_title, ''), coalesce(p_body, ''), p_link);
end; $$;

grant execute on function public.notify_member(uuid, uuid, text, text, text, text)
  to anon, authenticated, service_role;
