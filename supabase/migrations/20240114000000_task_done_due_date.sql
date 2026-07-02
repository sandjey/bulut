-- Второй дедлайн: «Готово» (для тестировщика/финал). dueDate = «Готов к тестированию».
alter table public.tasks add column if not exists done_due_date date;
