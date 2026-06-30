# Bulut — Командный менеджер задач

Современный Kanban-менеджер для команды. Next.js 14 + Supabase + TypeScript + real-time.

**Прод:** https://bulut-kappa.vercel.app  
**GitHub:** https://github.com/sandjey/bulut  
**API:** https://bulut-kappa.vercel.app/api

---

## Быстрый старт

### Docker (рекомендуется)

```bash
git clone https://github.com/sandjey/bulut.git
cd bulut
cp .env.example .env
# заполни .env своими ключами Supabase
docker compose up --build
# → http://localhost:3000
```

### Без Docker

```bash
npm install
cp .env.example .env
npm run dev
```

---

## Переменные окружения

| Переменная | Где взять | Назначение |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Публичный ключ |
| `BULUT_API_KEY` | Любой случайный секрет | Ключ для REST API |
| `BULUT_API_SERVICE_EMAIL` | Email сервис-аккаунта | REST API авторизация |
| `BULUT_API_SERVICE_PASS` | Пароль сервис-аккаунта | REST API авторизация |

---

## База данных (Supabase SQL Editor)

Применяй миграции по порядку — или сразу весь `supabase/schema.sql`:

```
supabase/migrations/20240101000000_init.sql
supabase/migrations/20240102000000_team_workflow.sql
supabase/migrations/20240103000000_members.sql
supabase/migrations/20240104000000_journal_dynamic.sql
supabase/migrations/20240105000000_task_type.sql
supabase/migrations/20240106000000_stage_times.sql
supabase/migrations/20240107000000_checklist_attachments.sql
supabase/migrations/20240110000000_shared_workspace.sql
```

Включи Realtime (Supabase → Database → Replication) для таблиц:
`boards`, `tasks`, `journal`, `task_comments`, `members`

Или через SQL:
```sql
alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.journal;
alter publication supabase_realtime add table public.task_comments;
alter publication supabase_realtime add table public.members;
```

---

## Возможности

| Раздел | Функции |
|---|---|
| **Доски** | Drag & drop колонки и карточки, цвета, прогресс |
| **Задачи** | 10 типов (баг/фича/…), приоритет, дедлайн, теги, исполнитель |
| **Команда** | Участники, роли, статистика нагрузки |
| **Процесс** | Отправить на проверку → QA принимает или возвращает с комментарием |
| **Чек-лист** | Подзадачи с прогресс-баром прямо в карточке |
| **Вложения** | Ссылки и файлы в карточке |
| **Журнал** | Авто-запись событий, фильтрация по доске |
| **Отчёты** | По сотрудникам / занятость / узкие места за день/неделю/месяц |
| **Аналитика** | Графики, прогресс по доскам, нагрузка по исполнителям |
| **Мои задачи** | Персональный список сгруппирован по срокам |
| **Уведомления** | Просрочка, дедлайн, возвраты QA, @упоминания |
| **Экспорт** | Excel (задачи + журнал) |
| **Real-time** | Все изменения видны всем пользователям без перезагрузки |
| **REST API** | GET/POST/PATCH/DELETE с фильтрацией и пагинацией |

---

## REST API

**Base URL:** `https://bulut-kappa.vercel.app/api`

Полная документация endpoints: `GET /api`

### Аутентификация

```
X-API-Key: ВАШ_КЛЮЧ                          # для внешних интеграций
Authorization: Bearer <supabase-jwt-token>    # для своих клиентов
```

---

### GET /api/boards — список досок

```bash
curl https://bulut-kappa.vercel.app/api/boards \
  -H "X-API-Key: ВАШ_КЛЮЧ"
```

```json
{
  "data": [{
    "id": "uuid", "name": "Backend", "color": "#2563eb",
    "taskCount": 12,
    "columns": [
      { "id": "col1", "name": "Бэклог", "total": 5, "active": 5, "done": 0 }
    ]
  }],
  "total": 3
}
```

---

### GET /api/tasks — список задач с фильтрами

```bash
curl "https://bulut-kappa.vercel.app/api/tasks?status=active&priority=high" \
  -H "X-API-Key: ВАШ_КЛЮЧ"
```

| Параметр | Значения | Описание |
|---|---|---|
| `boardId` | UUID | Фильтр по доске |
| `columnId` | string | Фильтр по колонке |
| `assignee` | string | Исполнитель (без учёта регистра) |
| `status` | `active` / `done` | Статус |
| `priority` | `low` / `medium` / `high` | Приоритет |
| `type` | `task` / `bug` / `feature` / `newfeature` / `improvement` / `refactor` / `docs` / `test` / `design` / `research` | Тип |
| `search` | string | Поиск в названии и описании |
| `dueAfter` | YYYY-MM-DD | Дедлайн от |
| `dueBefore` | YYYY-MM-DD | Дедлайн до |
| `overdue` | `true` | Только просроченные |
| `hasAssignee` | `true` / `false` | Есть/нет исполнитель |
| `sort` | `created_at` / `due_date` / `position` / `title` | Сортировка |
| `order` | `asc` / `desc` | Направление |
| `page` | number | Страница (по умолч. 1) |
| `limit` | number | На странице (по умолч. 50, макс. 200) |

```json
{
  "data": [{ "id": "...", "title": "...", "assignee": "Иван", "priority": "high", ... }],
  "meta": { "total": 45, "page": 1, "limit": 20, "pages": 3, "hasMore": true }
}
```

---

### POST /api/tasks — создать задачу

```bash
curl -X POST https://bulut-kappa.vercel.app/api/tasks \
  -H "X-API-Key: ВАШ_КЛЮЧ" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Исправить баг авторизации",
    "boardId": "BOARD_UUID",
    "columnId": "COLUMN_ID",
    "assignee": "Иван",
    "priority": "high",
    "type": "bug",
    "dueDate": "2026-07-15",
    "tags": ["auth", "urgent"],
    "checklist": [
      { "text": "Воспроизвести баг" },
      { "text": "Написать тест" },
      { "text": "Исправить и задеплоить" }
    ],
    "attachments": [
      { "name": "Скриншот ошибки", "url": "https://example.com/bug.png" }
    ]
  }'
```

| Поле | Тип | Обяз. |
|---|---|---|
| `title` | string | ✅ |
| `boardId` | UUID | ✅ |
| `columnId` | string | ✅ |
| `description` | string | — |
| `assignee` | string | — |
| `priority` | `low` / `medium` / `high` | — |
| `type` | `task` / `bug` / `feature` / ... | — |
| `dueDate` | YYYY-MM-DD | — |
| `tags` | string[] | — |
| `checklist` | `{ text, done? }[]` | — |
| `attachments` | `{ name, url }[]` | — |

Ответ: `201 Created` + созданная задача.

---

### GET /api/tasks/:id — задача с комментариями

```bash
curl https://bulut-kappa.vercel.app/api/tasks/TASK_UUID \
  -H "X-API-Key: ВАШ_КЛЮЧ"
```

---

### PATCH /api/tasks/:id — обновить задачу

```bash
curl -X PATCH https://bulut-kappa.vercel.app/api/tasks/TASK_UUID \
  -H "X-API-Key: ВАШ_КЛЮЧ" \
  -H "Content-Type: application/json" \
  -d '{ "status": "done", "assignee": "Мария", "priority": "low" }'
```

---

### DELETE /api/tasks/:id — удалить задачу

```bash
curl -X DELETE https://bulut-kappa.vercel.app/api/tasks/TASK_UUID \
  -H "X-API-Key: ВАШ_КЛЮЧ"
```

---

### Примеры запросов

```bash
BASE="https://bulut-kappa.vercel.app/api"
KEY="ВАШ_API_КЛЮЧ"

# Задачи Ивана — активные, высокий приоритет
curl "$BASE/tasks?assignee=Иван&status=active&priority=high" -H "X-API-Key: $KEY"

# Просроченные, сортировка по дедлайну
curl "$BASE/tasks?overdue=true&sort=due_date&order=asc" -H "X-API-Key: $KEY"

# Все баги за июль
curl "$BASE/tasks?type=bug&dueAfter=2026-07-01&dueBefore=2026-07-31" -H "X-API-Key: $KEY"

# Поиск по тексту
curl "$BASE/tasks?search=авторизация" -H "X-API-Key: $KEY"

# Страница 2, по 25 задач
curl "$BASE/tasks?page=2&limit=25" -H "X-API-Key: $KEY"
```

---

## CI/CD

При каждом `git push` в ветку `main` Vercel автоматически:
1. Собирает проект (`next build`)
2. Деплоит на продакшн
3. Pull request'ы получают preview-деплой

Ручной деплой: `vercel --prod`

---

## Стек

| | |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **Backend** | Supabase (PostgreSQL + Auth + Realtime) |
| **Drag & Drop** | @hello-pangea/dnd |
| **Графики** | Recharts |
| **Экспорт** | SheetJS (xlsx) |
| **Иконки** | Lucide React |
| **Деплой** | Vercel (CI/CD через GitHub) |
| **Docker** | Multi-stage build, standalone output |
