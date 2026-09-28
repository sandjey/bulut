#!/usr/bin/env bash
# Перенос ВСЕЙ базы Bulut между Supabase-проектами: схема public, данные public,
# пользователи auth (с хешами паролей, id сохраняются), триггер профиля, bucket.
#
#   scripts/db-migrate.sh A B      # из аккаунта A в аккаунт B (см. .env.supabase-accounts)
#
# Правило: целевая база ПОЛНОСТЬЮ очищается перед заливкой — данные никогда не
# копятся поверх. Нужен Docker (pg_dump/psql 17 берём из образа postgres:17-alpine).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.supabase-accounts ] || { echo "нет .env.supabase-accounts"; exit 1; }
set -a; . ./.env.supabase-accounts; set +a
SRC_VAR="${1:?из какого аккаунта (A|B)}_DB_URL"; DST_VAR="${2:?в какой аккаунт (A|B)}_DB_URL"
SRC="${!SRC_VAR}"; DST="${!DST_VAR}"
[ "$SRC" != "$DST" ] || { echo "источник и цель совпадают"; exit 1; }
D="$(mktemp -d)"; echo "дампы: $D"
PG="docker run --rm -i -v $D:/out postgres:17-alpine"

echo "1/6 дамп из $1…"
$PG sh -c "pg_dump '$SRC' --schema-only --schema=public --no-owner -f /out/schema.sql \
  && pg_dump '$SRC' --data-only --schema=public --no-owner -f /out/data_public.sql \
  && pg_dump '$SRC' --data-only --table=auth.users --table=auth.identities --no-owner -f /out/data_auth.sql"
# то, что Supabase не даёт менять / уже есть
sed -i '' '/^CREATE SCHEMA public;$/d' "$D/schema.sql"
perl -0pi -e 's/^ALTER DEFAULT PRIVILEGES[^;]*;\n?//mg' "$D/schema.sql"

echo "2/6 очистка $2…"
cat > "$D/wipe.sql" <<'SQL'
do $$ declare r record; begin
  for r in select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal loop execute format('drop trigger if exists %I on auth.users', r.tgname); end loop;
  for r in select tablename from pg_tables where schemaname = 'public' loop execute format('drop table if exists public.%I cascade', r.tablename); end loop;
  for r in select viewname from pg_views where schemaname = 'public' loop execute format('drop view if exists public.%I cascade', r.viewname); end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop execute format('drop function if exists %s cascade', r.sig); end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype in ('e','d') loop execute format('drop type if exists public.%I cascade', r.typname); end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop execute format('drop sequence if exists public.%I cascade', r.sequencename); end loop;
end $$;
delete from auth.identities; delete from auth.sessions; delete from auth.refresh_tokens; delete from auth.users;
SQL
cat > "$D/post.sql" <<'SQL'
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into storage.buckets (id, name, public) values ('task-files', 'task-files', false) on conflict (id) do nothing;
drop policy if exists "taskfiles_select" on storage.objects; drop policy if exists "taskfiles_insert" on storage.objects;
drop policy if exists "taskfiles_update" on storage.objects; drop policy if exists "taskfiles_delete" on storage.objects;
create policy "taskfiles_select" on storage.objects for select using (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_insert" on storage.objects for insert with check (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_update" on storage.objects for update using (bucket_id = 'task-files' and auth.uid() is not null);
create policy "taskfiles_delete" on storage.objects for delete using (bucket_id = 'task-files' and auth.uid() is not null);
SQL
P="$PG psql '$DST' -v ON_ERROR_STOP=1 -q"
$PG psql "$DST" -v ON_ERROR_STOP=1 -q -f /out/wipe.sql 2>/dev/null
echo "3/6 схема…";  $PG psql "$DST" -v ON_ERROR_STOP=1 -q -f /out/schema.sql
echo "4/6 пользователи…"; $PG psql "$DST" -v ON_ERROR_STOP=1 -q -c "set session_replication_role = replica" -f /out/data_auth.sql >/dev/null
echo "5/6 данные…"; $PG psql "$DST" -v ON_ERROR_STOP=1 -q -c "set session_replication_role = replica" -f /out/data_public.sql >/dev/null
echo "6/6 триггер, bucket, миграции…"; $PG psql "$DST" -v ON_ERROR_STOP=1 -q -f /out/post.sql 2>/dev/null
for m in supabase/migrations/*.sql; do docker run --rm -i postgres:17-alpine psql "$DST" -v ON_ERROR_STOP=1 -q < "$m" >/dev/null 2>&1 || echo "  (пропущена $m)"; done

echo "== проверка"
CHK="select 'users='||(select count(*) from auth.users)||' tasks='||(select count(*) from public.tasks)||' comments='||(select count(*) from public.task_comments)||' journal='||(select count(*) from public.journal)||' boards='||(select count(*) from public.boards)"
echo "из:  $(docker run --rm postgres:17-alpine psql "$SRC" -Atc "$CHK")"
echo "в:   $(docker run --rm postgres:17-alpine psql "$DST" -Atc "$CHK")"
echo "Готово. Дальше: поменять NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY в .env и Vercel, задеплоить."
