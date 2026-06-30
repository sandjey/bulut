# Bulut — Менеджер задач в стиле Trello

Современное веб-приложение для управления задачами, вдохновлённое Trello / Linear / Notion.
Данные хранятся в **PostgreSQL через Supabase**, вход — **по email**, запуск — **через Docker**.

![stack](https://img.shields.io/badge/Next.js-14-black) ![ts](https://img.shields.io/badge/TypeScript-5-blue) ![tw](https://img.shields.io/badge/Tailwind-3-38bdf8) ![supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e) ![docker](https://img.shields.io/badge/Docker-ready-2496ed)

## ✨ Возможности

- **Аккаунты по email** — регистрация/вход через Supabase Auth, данные привязаны к пользователю
- **Облачное хранение** — Postgres вместо localStorage, ничего не теряется при перезагрузке
- **Полностью динамично** — сами создаёте и удаляете доски, колонки, задачи (никаких статичных данных)
- **Доски** с цветовыми метками и настраиваемыми колонками
- **Drag & drop** карточек между колонками
- **Карточки**: название, описание, исполнитель, приоритет, дедлайн, теги; обратный отсчёт 🟢🟡🔴; быстрое редактирование
- Отметка «выполнено» → авто-запись в **Журнал**
- **Фильтры и поиск**, глобальный поиск `⌘K`
- **Журнал** в Excel-виде с группировкой по **дню / неделе / месяцу / направлению**
- **Аналитика**: графики, нагрузка по исполнителям, сводка по направлениям
- **Экспорт в Excel** (`.xlsx`) с фильтрами
- Тёмная / **мягкая светлая** тема, анимации, адаптив

> Изоляция данных обеспечивается **Row Level Security**: каждый пользователь видит только свои записи.

---

## 🚀 Быстрый старт

Нужен только аккаунт/инстанс **Supabase** (облако или локально) и Node 18.18+ или Docker.

### Шаг 1. Поднять базу данных (Supabase)

**Вариант A — облако (проще всего):**
1. Создайте бесплатный проект на [supabase.com](https://supabase.com).
2. Откройте **SQL Editor** и выполните содержимое [`supabase/schema.sql`](supabase/schema.sql)
   (создаст таблицы `boards`, `tasks`, `journal` и политики RLS).
3. В **Settings → API** скопируйте `Project URL` и `anon public` ключ.
4. *(Опционально)* В **Authentication → Providers → Email** отключите «Confirm email»,
   чтобы входить сразу без подтверждения по почте.

**Вариант B — локально через Docker (Supabase CLI):**
```bash
npm i -g supabase            # или: brew install supabase/tap/supabase
supabase start               # поднимет Postgres + Auth в Docker и применит миграции
# URL  → http://localhost:54321
# ключ → значение "anon key" из вывода команды
```

### Шаг 2. Настроить переменные окружения

```bash
cp .env.example .env
```
Заполните `.env`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co   # или http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ваш anon public ключ>
```

### Шаг 3. Запустить

**Через Docker (рекомендуется):**
```bash
docker compose up --build
# открыть http://localhost:3000
```

**Или локально без Docker:**
```bash
npm install
npm run dev
# открыть http://localhost:3000
```

Зарегистрируйтесь по email — и создавайте свои доски. 🎉

---

## 🐳 Docker

- `Dockerfile` — multi-stage сборка, образ на базе `node:20-alpine` с `output: standalone` (минимальный размер).
- `docker-compose.yml` — поднимает приложение на порту `3000`, переменные берёт из `.env`.

```bash
docker compose up --build      # собрать и запустить
docker compose down            # остановить
```

> `NEXT_PUBLIC_*` переменные встраиваются в клиентский бандл **на этапе сборки**,
> поэтому compose передаёт их и как `build args`, и как `environment`.

---

## 🧱 Стек

| Назначение     | Технология              |
| -------------- | ----------------------- |
| Фреймворк      | Next.js 14 (App Router) |
| Язык           | TypeScript              |
| Стили          | Tailwind CSS            |
| БД + Auth      | Supabase (PostgreSQL)   |
| Drag & drop    | @hello-pangea/dnd       |
| Графики        | recharts                |
| Excel          | xlsx (SheetJS)          |
| Даты           | date-fns                |
| Иконки         | lucide-react            |

## 📁 Структура

```
├── Dockerfile / docker-compose.yml / .dockerignore
├── .env.example
├── supabase/
│   ├── schema.sql                 # схема + RLS (для облака)
│   └── migrations/                # та же схема как миграция (для supabase CLI)
└── src/
    ├── app/                       # страницы (App Router)
    ├── components/                # UI + AuthGate / LoginScreen
    └── lib/
        ├── supabase.ts            # браузерный клиент Supabase
        ├── auth.tsx               # провайдер аутентификации (email)
        ├── db.ts                  # доступ к Postgres (CRUD)
        ├── store.tsx              # стор с оптимистичными обновлениями
        ├── types.ts / date.ts / filters.ts / export.ts / utils.ts
```

## 💾 Модель данных (PostgreSQL)

```sql
boards (id, user_id, name, color, columns jsonb, position, created_at)
tasks  (id, user_id, board_id, column_id, title, description, assignee,
        priority, due_date, tags text[], status, position, created_at, completed_at)
journal(id, user_id, task_id, date, board_name, task_title, assignee, notes, created_at)
```

Все таблицы защищены RLS-политикой `auth.uid() = user_id`.

---

Сделано с ❤️ — продакшн-уровень, облачное хранение, запуск одной командой.
