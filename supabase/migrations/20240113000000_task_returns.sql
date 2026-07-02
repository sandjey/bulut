-- История возвратов карточки: массив событий { at, from, to, seconds, reason }.
alter table public.tasks add column if not exists returns jsonb not null default '[]'::jsonb;
