-- Автор карточки: кто её создал (имя из «Я» или email). Пусто для старых задач.
alter table public.tasks add column if not exists created_by text not null default '';
