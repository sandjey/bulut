-- Фото задач: до 10 сжатых base64-изображений в jsonb.
-- Удаляются автоматически при переходе задачи в «Готово», чтобы БД не разрасталась.
alter table public.tasks add column if not exists photos jsonb not null default '[]'::jsonb;
